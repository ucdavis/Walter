CREATE PROCEDURE dbo.usp_GetFacultyDeptPortfolio
    @ProjectIds VARCHAR(MAX) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: ProjectIds must be provided
    IF @ProjectIds IS NULL
    BEGIN
        RAISERROR('@ProjectIds must be provided', 16, 1);
        RETURN;
    END;

    -- Validate date range if both are provided
    IF @StartDate IS NOT NULL AND @EndDate IS NOT NULL AND @EndDate < @StartDate
    BEGIN
        RAISERROR('EndDate must be greater than or equal to StartDate', 16, 1);
        RETURN;
    END;

    DECLARE @RedshiftQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Compute current fiscal year boundaries (July 1 - June 30)
    DECLARE @FYStart DATE = CASE
        WHEN MONTH(GETDATE()) >= 7
        THEN DATEFROMPARTS(YEAR(GETDATE()), 7, 1)
        ELSE DATEFROMPARTS(YEAR(GETDATE()) - 1, 7, 1)
    END;

    -- Build fiscal year period names for GL filter (e.g. 'Jul-25', 'Aug-25', ..., 'Jun-26')
    DECLARE @PeriodFilter NVARCHAR(MAX) = '';
    DECLARE @PeriodDate DATE;
    DECLARE @i INT = 0;
    WHILE @i < 12
    BEGIN
        SET @PeriodDate = DATEADD(MONTH, @i, @FYStart);
        IF @i > 0 SET @PeriodFilter = @PeriodFilter + ', ';
        SET @PeriodFilter = @PeriodFilter +
            '''' + LEFT(DATENAME(MONTH, @PeriodDate), 3) + '-' + RIGHT(CAST(YEAR(@PeriodDate) AS VARCHAR(4)), 2) + '''';
        SET @i = @i + 1;
    END;

    -- Sanitize ApplicationName for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Parse and validate ProjectIds
    DECLARE @ProjectIdFilter NVARCHAR(MAX);
    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build optional date filter (applied to both sponsored and internal sections)
    DECLARE @DateFilter NVARCHAR(MAX) = '';
    IF @StartDate IS NOT NULL
        SET @DateFilter = @DateFilter + ' AND f.AWARD_END_DATE >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';
    IF @EndDate IS NOT NULL
        SET @DateFilter = @DateFilter + ' AND f.AWARD_START_DATE <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build Redshift query: pgm + gl CTEs, then UNION ALL of sponsored (detail) and internal (chart-string with GL)
    SET @RedshiftQuery = '
        WITH pgm AS (
            SELECT
                project_number, award_number,
                close_date AS award_close_date,
                LISTAGG(DISTINCT principal_investigator_person_name, ''; '') WITHIN GROUP (ORDER BY 1) AS award_pi,
                billing_cycle, project_burden_schedule_base, project_burden_cost_rate,
                cost_share_required_by_sponsor,
                LISTAGG(DISTINCT grant_administrator, ''; '') WITHIN GROUP (ORDER BY 1) AS grant_administrator,
                postrepperiod AS post_reporting_period,
                primary_sponsor_name,
                '''' AS project_fund,
                LISTAGG(DISTINCT contractadmin, ''; '') WITHIN GROUP (ORDER BY 1) AS contract_administrator,
                sponsor_award_number
            FROM ae_dwh.pgm_master_data
            WHERE project_number IN (' + @ProjectIdFilter + ')
            GROUP BY
                project_number, award_number, close_date, billing_cycle,
                project_burden_schedule_base, project_burden_cost_rate,
                cost_share_required_by_sponsor, postrepperiod, primary_sponsor_name,
                sponsor_award_number
        ),
        gl AS (
            SELECT
                tlr.PROJECT,
                tlr.FUND,
                tlr.PROGRAM,
                tlr.ACTIVITY,
                SUM(CASE WHEN acc.parent_level_0_code LIKE ''3%''
                         THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS BEGINNING_BALANCE,
                SUM(CASE WHEN acc.parent_level_0_code LIKE ''4%''
                         AND tlr.PERIOD_NAME IN (' + @PeriodFilter + ')
                         THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS REVENUE,
                SUM(CASE WHEN acc.parent_level_0_code LIKE ''5%''
                         AND tlr.PERIOD_NAME IN (' + @PeriodFilter + ')
                         THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS EXPENSES
            FROM ae_dwh.transactional_listing_report tlr
            LEFT JOIN ae_dwh.erp_account acc ON tlr.ACCOUNT = acc.code
            WHERE tlr.PROJECT IN (
                SELECT DISTINCT PROJECT_NUMBER FROM ae_dwh.ucd_faculty_rpt_t
                WHERE PROJECT_NUMBER IN (' + @ProjectIdFilter + ') AND PROJECT_TYPE = ''Internal''
            )
            GROUP BY tlr.PROJECT, tlr.FUND, tlr.PROGRAM, tlr.ACTIVITY
        )
        SELECT
            f.AWARD_NUMBER, f.AWARD_NAME, f.AWARD_TYPE,
            f.AWARD_START_DATE, f.AWARD_END_DATE, f.AWARD_STATUS,
            f.PROJECT_NUMBER, f.PROJECT_NAME,
            f.PRJ_OWNING_CD AS PROJECT_OWNING_ORG_CODE,
            CASE WHEN POSITION('' - '' IN f.PRJ_OWNING_ORG) > 0
                THEN SUBSTRING(f.PRJ_OWNING_ORG FROM POSITION('' - '' IN f.PRJ_OWNING_ORG) + 3)
                ELSE f.PRJ_OWNING_ORG END AS PROJECT_OWNING_ORG,
            f.PROJECT_TYPE, f.PROJECT_STATUS_CODE AS PROJECT_STATUS,
            f.TASK_NUM, f.TASK_NAME, f.TASK_STATUS,
            f.PM, f.PA, f.PI, f.COPI,
            f.EXPENDITURE_CATEGORY_NAME,
            f.FUND_CD AS FUND_CODE, f.FUND_DESC,
            f.PURPOSE_CD AS PURPOSE_CODE, f.PURPOSE_DESC,
            f.PROGRAM_CD AS PROGRAM_CODE, f.PROGRAM_DESC,
            f.ACTIVITY_CD AS ACTIVITY_CODE, f.ACTIVITY_DESC,
            f.CAT_BUDGET AS PPM_BUDGET, f.CAT_ITD_EXP AS PPM_EXPENSES,
            f.CAT_COMMITMENTS AS PPM_COMMITMENTS, f.CAT_BUD_BAL AS PPM_BUD_BAL,
            NULL::NUMERIC AS GL_BEGINNING_BALANCE,
            NULL::NUMERIC AS GL_REVENUE,
            NULL::NUMERIC AS GL_EXPENSES,
            p.award_close_date AS AWARD_CLOSE_DATE, p.award_pi AS AWARD_PI,
            p.billing_cycle AS BILLING_CYCLE,
            p.project_burden_schedule_base AS PROJECT_BURDEN_SCHEDULE_BASE,
            p.project_burden_cost_rate AS PROJECT_BURDEN_COST_RATE,
            p.cost_share_required_by_sponsor AS COST_SHARE_REQUIRED_BY_SPONSOR,
            p.grant_administrator AS GRANT_ADMINISTRATOR,
            p.post_reporting_period AS POST_REPORTING_PERIOD,
            p.primary_sponsor_name AS PRIMARY_SPONSOR_NAME,
            p.project_fund AS PROJECT_FUND,
            p.contract_administrator AS CONTRACT_ADMINISTRATOR,
            p.sponsor_award_number AS SPONSOR_AWARD_NUMBER
        FROM ae_dwh.ucd_faculty_rpt_t f
        LEFT JOIN pgm p ON f.PROJECT_NUMBER = p.project_number AND f.AWARD_NUMBER = p.award_number
        WHERE f.PROJECT_NUMBER IN (' + @ProjectIdFilter + ')
          AND f.PROJECT_TYPE <> ''Internal''
          AND f.TASK_STATUS <> ''Inactive''' + @DateFilter + '
        UNION ALL
        SELECT
            ppm.AWARD_NUMBER, ppm.AWARD_NAME, ppm.AWARD_TYPE,
            ppm.AWARD_START_DATE, ppm.AWARD_END_DATE, ppm.AWARD_STATUS,
            COALESCE(ppm.PROJECT_NUMBER, g.PROJECT) AS PROJECT_NUMBER,
            ppm.PROJECT_NAME,
            ppm.PROJECT_OWNING_ORG_CODE,
            ppm.PROJECT_OWNING_ORG,
            ppm.PROJECT_TYPE, ppm.PROJECT_STATUS,
            NULL AS TASK_NUM, NULL AS TASK_NAME, NULL AS TASK_STATUS,
            ppm.PM, ppm.PA, ppm.PI, ppm.COPI,
            ''All Expenditures'' AS EXPENDITURE_CATEGORY_NAME,
            COALESCE(ppm.FUND_CODE, g.FUND) AS FUND_CODE, ppm.FUND_DESC,
            ppm.PURPOSE_CODE, ppm.PURPOSE_DESC,
            COALESCE(ppm.PROGRAM_CODE, g.PROGRAM) AS PROGRAM_CODE, ppm.PROGRAM_DESC,
            COALESCE(ppm.ACTIVITY_CODE, g.ACTIVITY) AS ACTIVITY_CODE, ppm.ACTIVITY_DESC,
            COALESCE(ppm.PPM_BUDGET, 0) AS PPM_BUDGET,
            COALESCE(ppm.PPM_EXPENSES, 0) AS PPM_EXPENSES,
            COALESCE(ppm.PPM_COMMITMENTS, 0) AS PPM_COMMITMENTS,
            COALESCE(ppm.PPM_BUD_BAL, 0) AS PPM_BUD_BAL,
            -COALESCE(g.BEGINNING_BALANCE, 0) AS GL_BEGINNING_BALANCE,
            -COALESCE(g.REVENUE, 0) AS GL_REVENUE,
            COALESCE(g.EXPENSES, 0) AS GL_EXPENSES,
            p.award_close_date AS AWARD_CLOSE_DATE, p.award_pi AS AWARD_PI,
            p.billing_cycle AS BILLING_CYCLE,
            p.project_burden_schedule_base AS PROJECT_BURDEN_SCHEDULE_BASE,
            p.project_burden_cost_rate AS PROJECT_BURDEN_COST_RATE,
            p.cost_share_required_by_sponsor AS COST_SHARE_REQUIRED_BY_SPONSOR,
            p.grant_administrator AS GRANT_ADMINISTRATOR,
            p.post_reporting_period AS POST_REPORTING_PERIOD,
            p.primary_sponsor_name AS PRIMARY_SPONSOR_NAME,
            p.project_fund AS PROJECT_FUND,
            p.contract_administrator AS CONTRACT_ADMINISTRATOR,
            p.sponsor_award_number AS SPONSOR_AWARD_NUMBER
        FROM (
            SELECT
                PROJECT_NUMBER,
                FUND_CD AS FUND_CODE,
                PROGRAM_CD AS PROGRAM_CODE,
                ACTIVITY_CD AS ACTIVITY_CODE,
                MAX(AWARD_NUMBER) AS AWARD_NUMBER,
                MAX(AWARD_NAME) AS AWARD_NAME,
                MAX(AWARD_TYPE) AS AWARD_TYPE,
                MAX(AWARD_START_DATE) AS AWARD_START_DATE,
                MAX(AWARD_END_DATE) AS AWARD_END_DATE,
                MAX(AWARD_STATUS) AS AWARD_STATUS,
                MAX(PROJECT_NAME) AS PROJECT_NAME,
                MAX(PRJ_OWNING_CD) AS PROJECT_OWNING_ORG_CODE,
                MAX(CASE WHEN POSITION('' - '' IN PRJ_OWNING_ORG) > 0
                    THEN SUBSTRING(PRJ_OWNING_ORG FROM POSITION('' - '' IN PRJ_OWNING_ORG) + 3)
                    ELSE PRJ_OWNING_ORG END) AS PROJECT_OWNING_ORG,
                MAX(PROJECT_TYPE) AS PROJECT_TYPE,
                MAX(PROJECT_STATUS_CODE) AS PROJECT_STATUS,
                MAX(PM) AS PM,
                MAX(PA) AS PA,
                MAX(PI) AS PI,
                MAX(COPI) AS COPI,
                MAX(FUND_DESC) AS FUND_DESC,
                MAX(PURPOSE_CD) AS PURPOSE_CODE,
                MAX(PURPOSE_DESC) AS PURPOSE_DESC,
                MAX(PROGRAM_DESC) AS PROGRAM_DESC,
                MAX(ACTIVITY_DESC) AS ACTIVITY_DESC,
                SUM(CAT_BUDGET) AS PPM_BUDGET,
                SUM(CAT_ITD_EXP) AS PPM_EXPENSES,
                SUM(CAT_COMMITMENTS) AS PPM_COMMITMENTS,
                SUM(CAT_BUD_BAL) AS PPM_BUD_BAL
            FROM ae_dwh.ucd_faculty_rpt_t f
            WHERE f.PROJECT_NUMBER IN (' + @ProjectIdFilter + ')
              AND f.PROJECT_TYPE = ''Internal''
              AND f.TASK_STATUS <> ''Inactive''' + @DateFilter + '
            GROUP BY PROJECT_NUMBER, FUND_CD, PROGRAM_CD, ACTIVITY_CD
        ) ppm
        FULL OUTER JOIN gl g
            ON ppm.PROJECT_NUMBER = g.PROJECT
            AND ppm.FUND_CODE = g.FUND
            AND ppm.PROGRAM_CODE = g.PROGRAM
            AND ppm.ACTIVITY_CODE = g.ACTIVITY
        LEFT JOIN pgm p
            ON COALESCE(ppm.PROJECT_NUMBER, g.PROJECT) = p.project_number
            AND ppm.AWARD_NUMBER = p.award_number
    ';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            CONVERT(VARCHAR(10), @StartDate, 120) AS StartDate,
            CONVERT(VARCHAR(10), @EndDate, 120) AS EndDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Execute via OPENQUERY
    BEGIN TRY
        SET @TSQLCommand =
            'SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@RedshiftQuery, '''', '''''') + ''')';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolio',
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

        -- Log failed execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolio',
            @Duration_MS = @Duration_MS,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO
