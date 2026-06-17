-- Monthly per-expenditure-category budget burndown for a single project.
-- Returns two result sets:
--   1. Per-category budget header (budget, spent-to-date, committed, current remaining).
--   2. Period x category grid: 3 trailing actual months, the current (blended) month, and 12
--      projected months, each with actual spend, projected spend, and the running budget
--      remaining (burndown).
-- All inputs are local: GL actuals from dbo.GlProjectMonthlyActuals, the natural-account ->
-- category crosswalk from dbo.ExpenditureTypeByAccount, personnel from dbo.PositionBudgets +
-- dbo.CompositeBenefitRates, and the budget baseline from dbo.FacultyDeptPortfolio.
CREATE PROCEDURE dbo.usp_GetProjectProjection
    @ProjectId       NVARCHAR(15),
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

    -- "Now" anchors the whole window: 3 trailing actual months, the current (blended) month,
    -- and 12 projected months. Current-month non-personnel projection is prorated by the days
    -- remaining in the month.
    DECLARE @Today          DATE = CAST(GETDATE() AS DATE);
    DECLARE @CurrMonthStart DATE = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);
    DECLARE @DaysInMonth    INT  = DAY(EOMONTH(@Today));
    DECLARE @RemainingDays  INT  = @DaysInMonth - DAY(@Today);

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    BEGIN TRY
        -- Build parameters JSON before validation so a bad project id is still logged by the CATCH.
        SET @ParametersJSON = (
            SELECT @ProjectId AS ProjectId,
                   COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        EXEC dbo.usp_ValidateAggieEnterpriseProject @ProjectId;

        /* Period dimension: offsets -3..+12 from the current month. */
        DROP TABLE IF EXISTS #periods;
        SELECT
            DATEADD(MONTH, n, @CurrMonthStart) AS MonthStart,
            FORMAT(DATEADD(MONTH, n, @CurrMonthStart), 'MMM-yy') AS DisplayPeriod,
            CASE WHEN n < 0 THEN 'actual' WHEN n = 0 THEN 'blended' ELSE 'projected' END AS Kind
        INTO #periods
        FROM (VALUES (-3),(-2),(-1),(0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) v(n);

        /* GL actuals, filtered to expense accounts (parent rollup '5%') and mapped from natural
           account to expenditure category. Unmapped expense accounts fall into
           '99 - Uncategorized' so nothing silently disappears. PeriodName ('Mmm-yy') is matched
           to the period dimension's DisplayPeriod downstream. */
        DROP TABLE IF EXISTS #gl;
        SELECT COALESCE(x.ExpenditureCategory, '99 - Uncategorized') AS ExpenditureCategory,
               a.PeriodName,
               SUM(a.ActualAmount) AS ActualAmount
        INTO #gl
        FROM dbo.GlProjectMonthlyActuals a
        LEFT JOIN dbo.ExpenditureTypeByAccount x ON x.NaturalAccount = a.NaturalAccount
        WHERE a.ProjectId = @ProjectId
          AND a.ParentLevel0Code LIKE '5%'
        GROUP BY COALESCE(x.ExpenditureCategory, '99 - Uncategorized'), a.PeriodName;

        /* Per-category budget baseline (anchor for the burndown). PpmBudBal already nets
           commitments, consistent with excluding commitments from spend. */
        DROP TABLE IF EXISTS #budget;
        SELECT f.ExpenditureCategoryName AS ExpenditureCategory,
               SUM(f.PpmBudget)      AS Budget,
               SUM(f.PpmExpenses)    AS SpentToDate,
               SUM(f.PpmCommitments) AS Committed,
               SUM(f.PpmBudBal)      AS RemainingNow
        INTO #budget
        FROM dbo.FacultyDeptPortfolio f
        WHERE f.ProjectNumber = @ProjectId
        GROUP BY f.ExpenditureCategoryName;

        /* Category set = anything with GL spend, a budget line, or that is personnel. */
        DROP TABLE IF EXISTS #cats;
        SELECT c.ExpenditureCategory,
               CASE WHEN c.ExpenditureCategory IN ('01 - Salaries and Wages','02 - Fringe Benefits')
                    THEN 1 ELSE 0 END AS IsPersonnel
        INTO #cats
        FROM (SELECT ExpenditureCategory FROM #gl
              UNION SELECT ExpenditureCategory FROM #budget
              UNION SELECT '01 - Salaries and Wages'
              UNION SELECT '02 - Fringe Benefits') c;

        /* Personnel projection for the current + future months. Salary is this project's share:
           MonthlyRate (1.0-FTE rate) * Fte * DistributionPercent. Fringe loads CBR + vacation
           accrual (both stored as fractions). A position contributes only while its funding
           window is open and its job has not ended; a NULL end date means funded indefinitely. */
        DROP TABLE IF EXISTS #pers;
        SELECT p.MonthStart,
               SUM(pb.MonthlyRate * pb.Fte * pb.DistributionPercent / 100.0) AS Salary,
               SUM(pb.MonthlyRate * pb.Fte * pb.DistributionPercent / 100.0
                   * (COALESCE(cbr.CBR, 0) + COALESCE(cbr.VacationAccrual, 0))) AS Fringe
        INTO #pers
        FROM #periods p
        JOIN dbo.PositionBudgets pb ON pb.ProjectId = @ProjectId
           AND (pb.FundingEffectiveDate IS NULL OR pb.FundingEffectiveDate <= EOMONTH(p.MonthStart))
           AND (pb.FundingEndDate       IS NULL OR pb.FundingEndDate       >= p.MonthStart)
           AND (pb.ExpectedEndDate      IS NULL OR pb.ExpectedEndDate      >= p.MonthStart)
        LEFT JOIN dbo.CompositeBenefitRates cbr ON cbr.JobCode = pb.JobCode
        WHERE p.Kind IN ('blended','projected')
        GROUP BY p.MonthStart;

        /* Non-personnel projection = average of the 3 trailing actual months (divided by 3 even
           when a category posted in fewer of them). */
        DROP TABLE IF EXISTS #navg;
        SELECT g.ExpenditureCategory, SUM(g.ActualAmount) / 3.0 AS AvgAmount
        INTO #navg
        FROM #gl g
        JOIN #periods p ON p.DisplayPeriod = g.PeriodName AND p.Kind = 'actual'
        JOIN #cats c ON c.ExpenditureCategory = g.ExpenditureCategory AND c.IsPersonnel = 0
        GROUP BY g.ExpenditureCategory;

        /* Spend per period x category. Current month: non-personnel = booked actuals + prorated
           remainder; personnel = whole-month budget (mid-month payroll actuals ignored). */
        DROP TABLE IF EXISTS #spend;
        SELECT p.MonthStart, p.DisplayPeriod, p.Kind, c.ExpenditureCategory, c.IsPersonnel,
            CAST(CASE
                WHEN p.Kind = 'actual'                        THEN COALESCE(g.ActualAmount, 0)
                WHEN p.Kind = 'blended' AND c.IsPersonnel = 0 THEN COALESCE(g.ActualAmount, 0)
                ELSE 0 END AS DECIMAL(18,2)) AS ActualAmount,
            CAST(CASE
                WHEN c.IsPersonnel = 1 AND p.Kind IN ('blended','projected')
                    THEN COALESCE(CASE WHEN c.ExpenditureCategory = '01 - Salaries and Wages'
                                       THEN pr.Salary ELSE pr.Fringe END, 0)
                WHEN c.IsPersonnel = 0 AND p.Kind = 'projected'
                    THEN COALESCE(na.AvgAmount, 0)
                WHEN c.IsPersonnel = 0 AND p.Kind = 'blended'
                    THEN COALESCE(na.AvgAmount, 0) * @RemainingDays / @DaysInMonth
                ELSE 0 END AS DECIMAL(18,2)) AS ProjectedAmount
        INTO #spend
        FROM #periods p
        CROSS JOIN #cats c
        LEFT JOIN #gl   g  ON g.ExpenditureCategory = c.ExpenditureCategory AND g.PeriodName = p.DisplayPeriod
        LEFT JOIN #pers pr ON pr.MonthStart = p.MonthStart
        LEFT JOIN #navg na ON na.ExpenditureCategory = c.ExpenditureCategory;

        /* Result 1: per-category budget header. */
        SELECT b.ExpenditureCategory,
               CASE WHEN b.ExpenditureCategory IN ('01 - Salaries and Wages','02 - Fringe Benefits')
                    THEN 1 ELSE 0 END AS IsPersonnel,
               b.Budget, b.SpentToDate, b.Committed, b.RemainingNow
        FROM #budget b
        ORDER BY b.ExpenditureCategory;

        /* Result 2: period x category grid with the running burndown. Remaining is anchored at
           the current balance (RemainingNow) as of the last actual month, then integrated
           backward (history) and forward (projection). */
        SELECT
            CONVERT(CHAR(7), s.MonthStart, 126) AS [Month],   -- 'YYYY-MM'
            s.DisplayPeriod,
            s.Kind,
            s.ExpenditureCategory,
            s.IsPersonnel,
            s.ActualAmount,
            s.ProjectedAmount,
            CAST(COALESCE(b.RemainingNow, 0)
                 + SUM(CASE WHEN s.Kind = 'actual' THEN s.ActualAmount + s.ProjectedAmount ELSE 0 END)
                       OVER (PARTITION BY s.ExpenditureCategory)
                 - SUM(s.ActualAmount + s.ProjectedAmount)
                       OVER (PARTITION BY s.ExpenditureCategory ORDER BY s.MonthStart ROWS UNBOUNDED PRECEDING)
                 AS DECIMAL(18,2)) AS Remaining
        FROM #spend s
        LEFT JOIN #budget b ON b.ExpenditureCategory = s.ExpenditureCategory
        ORDER BY s.ExpenditureCategory, s.MonthStart;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectProjection',
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
            @ProcedureName = 'dbo.usp_GetProjectProjection',
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
