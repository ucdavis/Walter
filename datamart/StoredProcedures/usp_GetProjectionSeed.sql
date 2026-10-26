-- Seed data for a PI projection, at project/task x expenditure category grain, for the PI's active
-- portfolio: projects where they are PI (project or award scope) plus PI-less projects they manage.
-- Portfolio rule mirrors ProjectController by-iam; keep in sync.
-- Returns four result sets:
--   1. Projects: names, award, and dates (project dates from dbo.PpmProjects, else award dates).
--   2. Budgets: budget, spent, committed from dbo.FacultyDeptPortfolio.
--   3. Actuals: monthly burdened cost from dbo.PPMProjectCosts, 12 full months plus the current month.
--   4. RunRates: trailing non-personnel monthly averages for 3, 6, and 12 month windows.
CREATE PROCEDURE dbo.usp_GetProjectionSeed
    @PiEmployeeId    VARCHAR(16),
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser   NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime      DATETIME2 = SYSDATETIME();
    DECLARE @RowCount       INT;
    DECLARE @Duration_MS    INT;
    DECLARE @ErrorMsg       NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);
    DECLARE @CurrMonthStart DATE = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    BEGIN TRY
        SET @ParametersJSON = (
            SELECT @PiEmployeeId AS PiEmployeeId,
                   COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        DROP TABLE IF EXISTS #ids;
        SELECT DISTINCT r.ProjectNumber
        INTO #ids
        FROM dbo.PpmPersonRoles r
        JOIN dbo.PpmProjects p ON p.ProjectNumber = r.ProjectNumber
        WHERE r.EmployeeId = @PiEmployeeId
          AND r.ScopeType IN ('PROJECT', 'AWARD')
          AND (r.RoleName = 'Principal Investigator'
               OR (r.RoleName = 'Project Manager'
                   AND NOT EXISTS (SELECT 1 FROM dbo.PpmPersonRoles pi
                                   WHERE pi.ProjectNumber = r.ProjectNumber
                                     AND pi.ScopeType = 'PROJECT'
                                     AND pi.RoleName = 'Principal Investigator')))
          AND EXISTS (SELECT 1 FROM dbo.FacultyDeptPortfolio f
                      WHERE f.ProjectNumber = r.ProjectNumber AND f.ProjectStatus = 'ACTIVE');

        -- Month dimension: n = -12..-1 full months, 0 = current month.
        DROP TABLE IF EXISTS #months;
        ;WITH n AS (
            SELECT TOP (13) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 13 AS n
            FROM sys.all_objects
        )
        SELECT n.n,
               DATEADD(MONTH, n.n, @CurrMonthStart) AS MonthStart,
               FORMAT(DATEADD(MONTH, n.n, @CurrMonthStart), 'MMM-yy') AS DisplayPeriod
        INTO #months
        FROM n;

        /* 1. Projects */
        SELECT f.ProjectNumber,
               f.TaskNum AS TaskNumber,
               MAX(f.TaskName) AS TaskName,
               MAX(f.ProjectName) AS ProjectName,
               MAX(f.ProjectType) AS ProjectType,
               MAX(f.AwardNumber) AS AwardNumber,
               MAX(f.AwardName) AS AwardName,
               COALESCE(MAX(pp.ProjectStartDate), MAX(f.AwardStartDate)) AS StartDate,
               COALESCE(MAX(pp.ProjectEndDate), MAX(f.AwardEndDate)) AS EndDate
        FROM dbo.FacultyDeptPortfolio f
        JOIN #ids i ON i.ProjectNumber = f.ProjectNumber
        LEFT JOIN dbo.PpmProjects pp ON pp.ProjectNumber = CAST(f.ProjectNumber AS VARCHAR(15))
        GROUP BY f.ProjectNumber, f.TaskNum;

        /* 2. Budgets */
        SELECT f.ProjectNumber,
               f.TaskNum AS TaskNumber,
               f.ExpenditureCategoryName AS ExpenditureCategory,
               SUM(f.PpmBudget) AS Budget,
               SUM(f.PpmExpenses) AS SpentToDate,
               SUM(f.PpmCommitments) AS Committed
        FROM dbo.FacultyDeptPortfolio f
        JOIN #ids i ON i.ProjectNumber = f.ProjectNumber
        GROUP BY f.ProjectNumber, f.TaskNum, f.ExpenditureCategoryName;

        DROP TABLE IF EXISTS #actuals;
        SELECT c.ProjectNumber,
               c.TaskNumber,
               c.ExpenditureCategoryCode + ' - ' + c.ExpenditureCategoryName AS ExpenditureCategory,
               mo.n,
               mo.MonthStart,
               SUM(c.BurdenedCost) AS Amount
        INTO #actuals
        FROM dbo.PPMProjectCosts c
        JOIN #ids i ON i.ProjectNumber = c.ProjectNumber
        JOIN #months mo ON mo.DisplayPeriod = c.AccountingPeriod
        GROUP BY c.ProjectNumber, c.TaskNumber,
                 c.ExpenditureCategoryCode + ' - ' + c.ExpenditureCategoryName, mo.n, mo.MonthStart;

        /* 3. Actuals */
        SELECT ProjectNumber, TaskNumber, ExpenditureCategory, MonthStart AS [Month], Amount
        FROM #actuals;

        /* 4. RunRates. Run-rate rule duplicated from dbo.usp_GetProjectProjection; keep in sync.
           Per window, average over the full months from the first month with any cost through
           last month; equipment is excluded as lumpy. */
        ;WITH w AS (
            SELECT v.W FROM (VALUES (3), (6), (12)) v(W)
        ),
        span AS (
            SELECT a.ProjectNumber, a.TaskNumber, w.W, -MIN(a.n) AS Months
            FROM #actuals a
            JOIN w ON a.n BETWEEN -w.W AND -1
            GROUP BY a.ProjectNumber, a.TaskNumber, w.W
        )
        SELECT a.ProjectNumber, a.TaskNumber, a.ExpenditureCategory, s.W AS HistoryMonths,
               CAST(SUM(a.Amount) / s.Months AS DECIMAL(18, 2)) AS MonthlyAmount
        FROM #actuals a
        JOIN span s ON s.ProjectNumber = a.ProjectNumber
                   AND s.TaskNumber = a.TaskNumber
                   AND a.n BETWEEN -s.W AND -1
        WHERE a.ExpenditureCategory NOT IN ('01 - Salaries and Wages', '02 - Fringe Benefits',
                                            '04 - Equipment and Facilities')
        GROUP BY a.ProjectNumber, a.TaskNumber, a.ExpenditureCategory, s.W, s.Months;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectionSeed',
            @Duration_MS = @Duration_MS,
            @RowCount = @RowCount,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser,
            @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectionSeed',
            @Duration_MS = @Duration_MS,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        THROW;
    END CATCH
END;
GO
