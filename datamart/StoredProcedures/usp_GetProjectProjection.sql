-- Monthly per-expenditure-category budget burndown for a single project.
-- Returns two result sets:
--   1. Per-category budget header (budget, spent-to-date, committed, current remaining, award end date).
--   2. Period x category grid: 3 trailing actual months, the current (blended) month, and
--      projected months through the award end date (12 when the award end date is unknown),
--      each with actual spend, projected spend, and the running budget
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
    -- and projected months through the award end date. Current-month non-personnel projection
    -- is prorated by the days remaining in the month.
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

        /* Horizon end: project through the award end date's month; when the award end date
           is unknown, fall back to 12 projected months. A past/current end date yields no
           projected months (history + the blended current month only). */
        DECLARE @AwardEndDate DATE = (
            SELECT MAX(f.AwardEndDate)
            FROM dbo.FacultyDeptPortfolio f
            WHERE f.ProjectNumber = @ProjectId
        );
        DECLARE @ProjMonths INT =
            CASE WHEN @AwardEndDate IS NULL THEN 12
                 ELSE DATEDIFF(MONTH, @CurrMonthStart,
                               DATEFROMPARTS(YEAR(@AwardEndDate), MONTH(@AwardEndDate), 1))
            END;
        IF @ProjMonths < 0 SET @ProjMonths = 0;

        /* Period dimension: 3 trailing actual months (n = -3..-1), the blended current month
           (n = 0), and projected months (n = 1..@ProjMonths). The tally reads from
           sys.all_objects, which bounds even a corrupt far-future end date to a finite window. */
        DROP TABLE IF EXISTS #periods;
        ;WITH n AS (
            SELECT TOP (@ProjMonths + 4)
                   ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 4 AS n
            FROM sys.all_objects
        )
        SELECT
            DATEADD(MONTH, n.n, @CurrMonthStart) AS MonthStart,
            FORMAT(DATEADD(MONTH, n.n, @CurrMonthStart), 'MMM-yy') AS DisplayPeriod,
            CASE WHEN n.n < 0 THEN 'actual' WHEN n.n = 0 THEN 'blended' ELSE 'projected' END AS Kind
        INTO #periods
        FROM n;

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
               SUM(f.PpmBudBal)      AS RemainingNow,
               MAX(f.AwardEndDate)   AS AwardEndDate   -- project-level; same on every category row
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

        /* Personnel projection for the current + future months. Mirrors the personnel table on
           the page (usp_GetPositionBudgetsLocal): every funding line for the project, with no
           funding- or job-end-date gating, projected flat across the whole horizon (the award
           end date is returned separately for the chart to mark). Salary is this project's share:
           MonthlyRate (1.0-FTE rate) * Fte * DistributionPercent. Fringe loads CBR only (the CBR
           is stored as a fraction); vacation accrual is excluded for now, matching the page. */
        DROP TABLE IF EXISTS #pers;
        SELECT p.MonthStart,
               SUM(pb.MonthlyRate * pb.Fte * pb.DistributionPercent / 100.0) AS Salary,
               SUM(pb.MonthlyRate * pb.Fte * pb.DistributionPercent / 100.0
                   * COALESCE(cbr.CBR, 0)) AS Fringe
        INTO #pers
        FROM #periods p
        JOIN dbo.PositionBudgets pb ON pb.ProjectId = @ProjectId
        LEFT JOIN dbo.CompositeBenefitRates cbr ON cbr.JobCode = pb.JobCode
        WHERE p.Kind IN ('blended','projected')
        GROUP BY p.MonthStart;

        /* Trailing actual months to average over: from the first month with GL data through the
           most recent actual month (0-3). A zero-spend month after activity has begun counts as a
           real zero; months before the project started posting do not dilute the run-rate (e.g.
           data two months ago and nothing last month still averages over 2 months). */
        DECLARE @FirstActualMonth DATE = (
            SELECT MIN(p.MonthStart)
            FROM #gl g
            JOIN #periods p ON p.DisplayPeriod = g.PeriodName AND p.Kind = 'actual'
        );
        DECLARE @ActualMonths INT = (
            SELECT COUNT(*)
            FROM #periods p
            WHERE p.Kind = 'actual' AND p.MonthStart >= @FirstActualMonth
        );

        /* Non-personnel projection = average spend per trailing actual month that has data.
           Equipment ('04 - Equipment and Facilities') is excluded: it is lumpy/one-time and a
           run-rate would over-project it. It still shows its actuals and stays in the burndown. */
        DROP TABLE IF EXISTS #navg;
        SELECT g.ExpenditureCategory, SUM(g.ActualAmount) / NULLIF(@ActualMonths, 0) AS AvgAmount
        INTO #navg
        FROM #gl g
        JOIN #periods p ON p.DisplayPeriod = g.PeriodName AND p.Kind = 'actual'
        JOIN #cats c ON c.ExpenditureCategory = g.ExpenditureCategory AND c.IsPersonnel = 0
        WHERE g.ExpenditureCategory <> '04 - Equipment and Facilities'
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

        /* Result 1: per-category budget header. AwardEndDate is project-level (same on each row)
           so the chart can draw the award-end reference line. */
        SELECT b.ExpenditureCategory,
               CASE WHEN b.ExpenditureCategory IN ('01 - Salaries and Wages','02 - Fringe Benefits')
                    THEN 1 ELSE 0 END AS IsPersonnel,
               b.Budget, b.SpentToDate, b.Committed, b.RemainingNow,
               b.AwardEndDate
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
