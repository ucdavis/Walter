CREATE PROCEDURE dbo.usp_GetProjectSummary
    @ProjectIds VARCHAR(MAX),
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate ProjectIds is provided
    IF @ProjectIds IS NULL OR LEN(LTRIM(RTRIM(@ProjectIds))) = 0
    BEGIN
        RAISERROR('@ProjectIds must be provided', 16, 1);
        RETURN;
    END;

    DECLARE @PortfolioRedshiftQuery NVARCHAR(MAX);
    DECLARE @GLRedshiftQuery NVARCHAR(MAX);
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

    -- Sanitize inputs
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Parse and validate ProjectIds
    DECLARE @ProjectIdFilter NVARCHAR(MAX);
    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build portfolio Redshift query (same as usp_GetFacultyDeptPortfolio without date filtering)
    SET @PortfolioRedshiftQuery = '
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
        )
        SELECT f.AWARD_NUMBER, f.AWARD_NAME, f.AWARD_TYPE, f.AWARD_ENTITY, f.AWARD_START_DATE, f.AWARD_END_DATE, f.AWARD_STATUS, f.AWD_PI_NAME,
        f.FUNDING_SOURCE, f.PROJECT_NUMBER, f.PROJECT_NAME, f.PROJECT_ENTITY, f.PRJ_OWNING_ORG AS PROJECT_OWNING_ORG,
        f.PROJECT_TYPE, f.PROJECT_STATUS_CODE AS PROJECT_STATUS, f.PM, f.PA, f.PI, f.COPI,
        f.FUND_CD AS FUND_CODE, f.FUND_DESC, f.PURPOSE_CD AS PURPOSE_CODE, f.PURPOSE_DESC,
        f.PROGRAM_CD AS PROGRAM_CODE, f.PROGRAM_DESC, f.ACTIVITY_CD AS ACTIVITY_CODE, f.ACTIVITY_DESC,
        SUM(f.CAT_BUDGET) AS CAT_BUDGET, SUM(f.CAT_COMMITMENTS) AS CAT_COMMITMENTS, SUM(f.CAT_ITD_EXP) AS CAT_ITD_EXP, SUM(f.CAT_BUD_BAL) AS CAT_BUD_BAL,
        p.award_close_date AS AWARD_CLOSE_DATE, p.award_pi AS AWARD_PI, p.billing_cycle AS BILLING_CYCLE,
        p.project_burden_schedule_base AS PROJECT_BURDEN_SCHEDULE_BASE, p.project_burden_cost_rate AS PROJECT_BURDEN_COST_RATE,
        p.cost_share_required_by_sponsor AS COST_SHARE_REQUIRED_BY_SPONSOR, p.grant_administrator AS GRANT_ADMINISTRATOR,
        p.post_reporting_period AS POST_REPORTING_PERIOD,
        p.primary_sponsor_name AS PRIMARY_SPONSOR_NAME, p.project_fund AS PROJECT_FUND,
        p.contract_administrator AS CONTRACT_ADMINISTRATOR, p.sponsor_award_number AS SPONSOR_AWARD_NUMBER
        FROM ae_dwh.ucd_faculty_rpt_t f
        LEFT JOIN pgm p ON f.project_number = p.project_number AND f.award_number = p.award_number
        WHERE f.PROJECT_NUMBER IN (' + @ProjectIdFilter + ')
          AND f.TASK_STATUS <> ''Inactive''
        GROUP BY f.AWARD_NUMBER, f.AWARD_NAME, f.AWARD_TYPE, f.AWARD_ENTITY, f.AWARD_START_DATE, f.AWARD_END_DATE, f.AWARD_STATUS, f.AWD_PI_NAME,
            f.FUNDING_SOURCE, f.PROJECT_NUMBER, f.PROJECT_NAME, f.PROJECT_ENTITY, f.PRJ_OWNING_ORG,
            f.PROJECT_TYPE, f.PROJECT_STATUS_CODE, f.PM, f.PA, f.PI, f.COPI,
            f.FUND_CD, f.FUND_DESC, f.PURPOSE_CD, f.PURPOSE_DESC,
            f.PROGRAM_CD, f.PROGRAM_DESC, f.ACTIVITY_CD, f.ACTIVITY_DESC,
            p.award_close_date, p.award_pi, p.billing_cycle,
            p.project_burden_schedule_base, p.project_burden_cost_rate,
            p.cost_share_required_by_sponsor, p.grant_administrator,
            p.post_reporting_period, p.primary_sponsor_name, p.project_fund,
            p.contract_administrator, p.sponsor_award_number';

    -- Build GL summary Redshift query for current fiscal year
    SET @GLRedshiftQuery = '
        SELECT
            tlr.FINANCIAL_DEPARTMENT,
            tlr.PROJECT,
            tlr.FUND,
            tlr.PROGRAM,
            tlr.ACTIVITY,
            tlr.ACCOUNT,
            acc.parent_level_0_code AS ACCOUNT_ROLLUP,
            SUM(CASE WHEN acc.parent_level_0_code LIKE ''3%''
                      OR acc.parent_level_0_code LIKE ''4%''
                 THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS APPROPRIATION,
            SUM(CASE WHEN acc.parent_level_0_code LIKE ''5%''
                 THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS EXPENSES,
            SUM(tlr.COMMITMENT_AMOUNT + tlr.OBLIGATION_AMOUNT) AS COMMITMENTS
        FROM ae_dwh.transactional_listing_report tlr
        LEFT JOIN ae_dwh.erp_account acc ON tlr.ACCOUNT = acc.code
        WHERE tlr.PROJECT IN (' + @ProjectIdFilter + ')
          AND tlr.PERIOD_NAME IN (' + @PeriodFilter + ')
        GROUP BY tlr.FINANCIAL_DEPARTMENT, tlr.PROJECT, tlr.FUND, tlr.PROGRAM, tlr.ACTIVITY, tlr.ACCOUNT, acc.parent_level_0_code';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Execute: portfolio into temp table, GL into temp table
    -- Sponsored projects use PPM data; Internal projects use GL data with project metadata from portfolio
    BEGIN TRY
        SET @TSQLCommand =
            'SELECT * INTO #portfolio FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@PortfolioRedshiftQuery, '''', '''''') + ''');

            SELECT * INTO #gl_summary FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@GLRedshiftQuery, '''', '''''') + ''');

            -- Sponsored projects: PPM data as-is
            SELECT AWARD_NUMBER, AWARD_NAME, AWARD_TYPE, AWARD_ENTITY, AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS, AWD_PI_NAME,
                FUNDING_SOURCE, PROJECT_NUMBER, PROJECT_NAME, PROJECT_ENTITY, PROJECT_OWNING_ORG,
                PROJECT_TYPE, PROJECT_STATUS, PM, PA, PI, COPI,
                FUND_CODE, FUND_DESC, PURPOSE_CODE, PURPOSE_DESC,
                PROGRAM_CODE, PROGRAM_DESC, ACTIVITY_CODE, ACTIVITY_DESC,
                CAT_BUDGET, CAT_COMMITMENTS, CAT_ITD_EXP, CAT_BUD_BAL,
                AWARD_CLOSE_DATE, AWARD_PI, BILLING_CYCLE,
                PROJECT_BURDEN_SCHEDULE_BASE, PROJECT_BURDEN_COST_RATE,
                COST_SHARE_REQUIRED_BY_SPONSOR, GRANT_ADMINISTRATOR,
                POST_REPORTING_PERIOD, PRIMARY_SPONSOR_NAME, PROJECT_FUND,
                CONTRACT_ADMINISTRATOR, SPONSOR_AWARD_NUMBER,
                ''PPM'' AS BALANCE_DATA_SOURCE
            FROM #portfolio
            WHERE PROJECT_TYPE <> ''Internal''

            UNION ALL

            -- Internal projects: GL for budget/expenses, portfolio for commitments
            SELECT m.AWARD_NUMBER, m.AWARD_NAME, m.AWARD_TYPE, m.AWARD_ENTITY, m.AWARD_START_DATE, m.AWARD_END_DATE, m.AWARD_STATUS, m.AWD_PI_NAME,
                m.FUNDING_SOURCE, m.PROJECT_NUMBER, m.PROJECT_NAME, m.PROJECT_ENTITY, m.PROJECT_OWNING_ORG,
                m.PROJECT_TYPE, m.PROJECT_STATUS, m.PM, m.PA, m.PI, m.COPI,
                g.FUND AS FUND_CODE, '''' AS FUND_DESC, '''' AS PURPOSE_CODE, '''' AS PURPOSE_DESC,
                g.PROGRAM AS PROGRAM_CODE, '''' AS PROGRAM_DESC, g.ACTIVITY AS ACTIVITY_CODE, '''' AS ACTIVITY_DESC,
                -COALESCE(g.APPROPRIATION, 0) AS CAT_BUDGET,
                COALESCE(m.PPM_COMMITMENTS, 0) AS CAT_COMMITMENTS,
                COALESCE(g.EXPENSES, 0) AS CAT_ITD_EXP,
                -COALESCE(g.APPROPRIATION, 0) - COALESCE(g.EXPENSES, 0) - COALESCE(m.PPM_COMMITMENTS, 0) AS CAT_BUD_BAL,
                m.AWARD_CLOSE_DATE, m.AWARD_PI, m.BILLING_CYCLE,
                m.PROJECT_BURDEN_SCHEDULE_BASE, m.PROJECT_BURDEN_COST_RATE,
                m.COST_SHARE_REQUIRED_BY_SPONSOR, m.GRANT_ADMINISTRATOR,
                m.POST_REPORTING_PERIOD, m.PRIMARY_SPONSOR_NAME, m.PROJECT_FUND,
                m.CONTRACT_ADMINISTRATOR, m.SPONSOR_AWARD_NUMBER,
                ''GL'' AS BALANCE_DATA_SOURCE
            FROM (
                SELECT PROJECT, FUND, PROGRAM, ACTIVITY,
                    SUM(APPROPRIATION) AS APPROPRIATION,
                    SUM(EXPENSES) AS EXPENSES
                FROM #gl_summary
                GROUP BY PROJECT, FUND, PROGRAM, ACTIVITY
            ) g
            JOIN (
                SELECT AWARD_NUMBER, AWARD_NAME, AWARD_TYPE, AWARD_ENTITY, AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS, AWD_PI_NAME,
                    FUNDING_SOURCE, PROJECT_NUMBER, PROJECT_NAME, PROJECT_ENTITY, PROJECT_OWNING_ORG,
                    PROJECT_TYPE, PROJECT_STATUS, PM, PA, PI, COPI,
                    AWARD_CLOSE_DATE, AWARD_PI, BILLING_CYCLE,
                    PROJECT_BURDEN_SCHEDULE_BASE, PROJECT_BURDEN_COST_RATE,
                    COST_SHARE_REQUIRED_BY_SPONSOR, GRANT_ADMINISTRATOR,
                    POST_REPORTING_PERIOD, PRIMARY_SPONSOR_NAME, PROJECT_FUND,
                    CONTRACT_ADMINISTRATOR, SPONSOR_AWARD_NUMBER,
                    SUM(CAT_COMMITMENTS) AS PPM_COMMITMENTS
                FROM #portfolio
                WHERE PROJECT_TYPE = ''Internal''
                GROUP BY AWARD_NUMBER, AWARD_NAME, AWARD_TYPE, AWARD_ENTITY, AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS, AWD_PI_NAME,
                    FUNDING_SOURCE, PROJECT_NUMBER, PROJECT_NAME, PROJECT_ENTITY, PROJECT_OWNING_ORG,
                    PROJECT_TYPE, PROJECT_STATUS, PM, PA, PI, COPI,
                    AWARD_CLOSE_DATE, AWARD_PI, BILLING_CYCLE,
                    PROJECT_BURDEN_SCHEDULE_BASE, PROJECT_BURDEN_COST_RATE,
                    COST_SHARE_REQUIRED_BY_SPONSOR, GRANT_ADMINISTRATOR,
                    POST_REPORTING_PERIOD, PRIMARY_SPONSOR_NAME, PROJECT_FUND,
                    CONTRACT_ADMINISTRATOR, SPONSOR_AWARD_NUMBER
            ) m ON g.PROJECT = m.PROJECT_NUMBER;

            DROP TABLE #portfolio;
            DROP TABLE #gl_summary;';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectSummary',
            @Duration_MS = @Duration_MS,
            @RowCount = @RowCount,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();

        -- Log failed execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectSummary',
            @Duration_MS = @Duration_MS,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO