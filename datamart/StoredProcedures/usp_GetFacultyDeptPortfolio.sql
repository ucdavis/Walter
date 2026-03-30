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

    -- Build optional date filter (applied in faculty query)
    DECLARE @DateFilter NVARCHAR(MAX) = '';
    IF @StartDate IS NOT NULL
        SET @DateFilter = @DateFilter + ' AND AWARD_END_DATE >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';
    IF @EndDate IS NOT NULL
        SET @DateFilter = @DateFilter + ' AND AWARD_START_DATE <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Three Redshift queries, each under OPENQUERY 8000-char limit
    DECLARE @PgmQuery NVARCHAR(MAX) = '
        SELECT project_number, award_number,
            close_date AS award_close_date,
            LISTAGG(DISTINCT principal_investigator_person_name, ''; '') WITHIN GROUP (ORDER BY 1) AS award_pi,
            billing_cycle, project_burden_schedule_base, project_burden_cost_rate,
            cost_share_required_by_sponsor,
            LISTAGG(DISTINCT grant_administrator, ''; '') WITHIN GROUP (ORDER BY 1) AS grant_administrator,
            postrepperiod AS post_reporting_period, primary_sponsor_name,
            '''' AS project_fund,
            LISTAGG(DISTINCT contractadmin, ''; '') WITHIN GROUP (ORDER BY 1) AS contract_administrator,
            sponsor_award_number
        FROM ae_dwh.pgm_master_data
        WHERE project_number IN (' + @ProjectIdFilter + ')
        GROUP BY project_number, award_number, close_date, billing_cycle,
            project_burden_schedule_base, project_burden_cost_rate,
            cost_share_required_by_sponsor, postrepperiod, primary_sponsor_name,
            sponsor_award_number';

    DECLARE @GLQuery NVARCHAR(MAX) = '
        SELECT tlr.PROJECT, tlr.FUND, tlr.PROGRAM, tlr.ACTIVITY,
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
        GROUP BY tlr.PROJECT, tlr.FUND, tlr.PROGRAM, tlr.ACTIVITY';

    DECLARE @FacultyQuery NVARCHAR(MAX) = '
        SELECT AWARD_NUMBER, AWARD_NAME, AWARD_TYPE,
            AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS,
            PROJECT_NUMBER, PROJECT_NAME, PRJ_OWNING_CD, PRJ_OWNING_ORG,
            PROJECT_TYPE, PROJECT_STATUS_CODE, TASK_NUM, TASK_NAME, TASK_STATUS,
            PM, PA, PI, COPI, EXPENDITURE_CATEGORY_NAME,
            FUND_CD, FUND_DESC, PURPOSE_CD, PURPOSE_DESC,
            PROGRAM_CD, PROGRAM_DESC, ACTIVITY_CD, ACTIVITY_DESC,
            CAT_BUDGET, CAT_ITD_EXP, CAT_COMMITMENTS, CAT_BUD_BAL
        FROM ae_dwh.ucd_faculty_rpt_t
        WHERE PROJECT_NUMBER IN (' + @ProjectIdFilter + ')
          AND TASK_STATUS <> ''Inactive''' + @DateFilter;

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            CONVERT(VARCHAR(10), @StartDate, 120) AS StartDate,
            CONVERT(VARCHAR(10), @EndDate, 120) AS EndDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        -- Build T-SQL: CTEs wrapping each OPENQUERY, then UNION ALL in T-SQL
        SET @TSQLCommand = CAST(N'' AS NVARCHAR(MAX));

        SET @TSQLCommand = @TSQLCommand +
            N';WITH pgm AS (
                SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + N', '''
                + REPLACE(@PgmQuery, '''', '''''') + N''')
            ),
            gl AS (
                SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + N', '''
                + REPLACE(@GLQuery, '''', '''''') + N''')
            ),
            faculty AS (
                SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + N', '''
                + REPLACE(@FacultyQuery, '''', '''''') + N''')
            )
            ';

        -- Sponsored: full detail rows, GL columns = NULL
        SET @TSQLCommand = @TSQLCommand + N'
            SELECT
                CAST(f.AWARD_NUMBER AS NVARCHAR(MAX)) AS AWARD_NUMBER,
                CAST(f.AWARD_NAME AS NVARCHAR(MAX)) AS AWARD_NAME,
                CAST(f.AWARD_TYPE AS NVARCHAR(MAX)) AS AWARD_TYPE,
                f.AWARD_START_DATE, f.AWARD_END_DATE,
                CAST(f.AWARD_STATUS AS NVARCHAR(MAX)) AS AWARD_STATUS,
                CAST(f.PROJECT_NUMBER AS NVARCHAR(MAX)) AS PROJECT_NUMBER,
                CAST(f.PROJECT_NAME AS NVARCHAR(MAX)) AS PROJECT_NAME,
                CAST(f.PRJ_OWNING_CD AS NVARCHAR(MAX)) AS PROJECT_OWNING_ORG_CODE,
                CASE WHEN CHARINDEX('' - '', CAST(f.PRJ_OWNING_ORG AS NVARCHAR(MAX))) > 0
                    THEN STUFF(CAST(f.PRJ_OWNING_ORG AS NVARCHAR(MAX)), 1,
                         CHARINDEX('' - '', CAST(f.PRJ_OWNING_ORG AS NVARCHAR(MAX))) + 2, '''')
                    ELSE CAST(f.PRJ_OWNING_ORG AS NVARCHAR(MAX))
                END AS PROJECT_OWNING_ORG,
                CAST(f.PROJECT_TYPE AS NVARCHAR(MAX)) AS PROJECT_TYPE,
                CAST(f.PROJECT_STATUS_CODE AS NVARCHAR(MAX)) AS PROJECT_STATUS,
                CAST(f.TASK_NUM AS NVARCHAR(MAX)) AS TASK_NUM,
                CAST(f.TASK_NAME AS NVARCHAR(MAX)) AS TASK_NAME,
                CAST(f.TASK_STATUS AS NVARCHAR(MAX)) AS TASK_STATUS,
                CAST(f.PM AS NVARCHAR(MAX)) AS PM,
                CAST(f.PA AS NVARCHAR(MAX)) AS PA,
                CAST(f.PI AS NVARCHAR(MAX)) AS PI,
                CAST(f.COPI AS NVARCHAR(MAX)) AS COPI,
                CAST(f.EXPENDITURE_CATEGORY_NAME AS NVARCHAR(MAX)) AS EXPENDITURE_CATEGORY_NAME,
                CAST(f.FUND_CD AS NVARCHAR(MAX)) AS FUND_CODE,
                CAST(f.FUND_DESC AS NVARCHAR(MAX)) AS FUND_DESC,
                CAST(f.PURPOSE_CD AS NVARCHAR(MAX)) AS PURPOSE_CODE,
                CAST(f.PURPOSE_DESC AS NVARCHAR(MAX)) AS PURPOSE_DESC,
                CAST(f.PROGRAM_CD AS NVARCHAR(MAX)) AS PROGRAM_CODE,
                CAST(f.PROGRAM_DESC AS NVARCHAR(MAX)) AS PROGRAM_DESC,
                CAST(f.ACTIVITY_CD AS NVARCHAR(MAX)) AS ACTIVITY_CODE,
                CAST(f.ACTIVITY_DESC AS NVARCHAR(MAX)) AS ACTIVITY_DESC,
                f.CAT_BUDGET AS PPM_BUDGET, f.CAT_ITD_EXP AS PPM_EXPENSES,
                f.CAT_COMMITMENTS AS PPM_COMMITMENTS, f.CAT_BUD_BAL AS PPM_BUD_BAL,
                CAST(NULL AS DECIMAL) AS GL_BEGINNING_BALANCE,
                CAST(NULL AS DECIMAL) AS GL_REVENUE,
                CAST(NULL AS DECIMAL) AS GL_EXPENSES,
                CAST(p.award_close_date AS NVARCHAR(MAX)) AS AWARD_CLOSE_DATE,
                CAST(p.award_pi AS NVARCHAR(MAX)) AS AWARD_PI,
                CAST(p.billing_cycle AS NVARCHAR(MAX)) AS BILLING_CYCLE,
                CAST(p.project_burden_schedule_base AS NVARCHAR(MAX)) AS PROJECT_BURDEN_SCHEDULE_BASE,
                CAST(p.project_burden_cost_rate AS NVARCHAR(MAX)) AS PROJECT_BURDEN_COST_RATE,
                CAST(p.cost_share_required_by_sponsor AS NVARCHAR(MAX)) AS COST_SHARE_REQUIRED_BY_SPONSOR,
                CAST(p.grant_administrator AS NVARCHAR(MAX)) AS GRANT_ADMINISTRATOR,
                CAST(p.post_reporting_period AS NVARCHAR(MAX)) AS POST_REPORTING_PERIOD,
                CAST(p.primary_sponsor_name AS NVARCHAR(MAX)) AS PRIMARY_SPONSOR_NAME,
                CAST(p.project_fund AS NVARCHAR(MAX)) AS PROJECT_FUND,
                CAST(p.contract_administrator AS NVARCHAR(MAX)) AS CONTRACT_ADMINISTRATOR,
                CAST(p.sponsor_award_number AS NVARCHAR(MAX)) AS SPONSOR_AWARD_NUMBER
            FROM faculty f
            LEFT JOIN pgm p ON f.PROJECT_NUMBER = p.project_number AND f.AWARD_NUMBER = p.award_number
            WHERE CAST(f.PROJECT_TYPE AS NVARCHAR(MAX)) <> ''Internal''
            ';

        -- Internal: chart-string level with GL values
        SET @TSQLCommand = @TSQLCommand + N'
            UNION ALL
            SELECT
                CAST(ppm.AWARD_NUMBER AS NVARCHAR(MAX)) AS AWARD_NUMBER,
                CAST(ppm.AWARD_NAME AS NVARCHAR(MAX)) AS AWARD_NAME,
                CAST(ppm.AWARD_TYPE AS NVARCHAR(MAX)) AS AWARD_TYPE,
                ppm.AWARD_START_DATE, ppm.AWARD_END_DATE,
                CAST(ppm.AWARD_STATUS AS NVARCHAR(MAX)) AS AWARD_STATUS,
                COALESCE(CAST(ppm.PROJECT_NUMBER AS NVARCHAR(MAX)), CAST(g.PROJECT AS NVARCHAR(MAX))) AS PROJECT_NUMBER,
                CAST(ppm.PROJECT_NAME AS NVARCHAR(MAX)) AS PROJECT_NAME,
                CAST(ppm.PRJ_OWNING_CD AS NVARCHAR(MAX)) AS PROJECT_OWNING_ORG_CODE,
                CASE WHEN CHARINDEX('' - '', CAST(ppm.PRJ_OWNING_ORG AS NVARCHAR(MAX))) > 0
                    THEN STUFF(CAST(ppm.PRJ_OWNING_ORG AS NVARCHAR(MAX)), 1,
                         CHARINDEX('' - '', CAST(ppm.PRJ_OWNING_ORG AS NVARCHAR(MAX))) + 2, '''')
                    ELSE CAST(ppm.PRJ_OWNING_ORG AS NVARCHAR(MAX))
                END AS PROJECT_OWNING_ORG,
                CAST(ppm.PROJECT_TYPE AS NVARCHAR(MAX)) AS PROJECT_TYPE,
                CAST(ppm.PROJECT_STATUS_CODE AS NVARCHAR(MAX)) AS PROJECT_STATUS,
                CAST(NULL AS NVARCHAR(MAX)) AS TASK_NUM,
                CAST(NULL AS NVARCHAR(MAX)) AS TASK_NAME,
                CAST(NULL AS NVARCHAR(MAX)) AS TASK_STATUS,
                CAST(ppm.PM AS NVARCHAR(MAX)) AS PM,
                CAST(ppm.PA AS NVARCHAR(MAX)) AS PA,
                CAST(ppm.PI AS NVARCHAR(MAX)) AS PI,
                CAST(ppm.COPI AS NVARCHAR(MAX)) AS COPI,
                CAST(''All Expenditures'' AS NVARCHAR(MAX)) AS EXPENDITURE_CATEGORY_NAME,
                COALESCE(CAST(ppm.FUND_CD AS NVARCHAR(MAX)), CAST(g.FUND AS NVARCHAR(MAX))) AS FUND_CODE,
                CAST(ppm.FUND_DESC AS NVARCHAR(MAX)) AS FUND_DESC,
                CAST(ppm.PURPOSE_CD AS NVARCHAR(MAX)) AS PURPOSE_CODE,
                CAST(ppm.PURPOSE_DESC AS NVARCHAR(MAX)) AS PURPOSE_DESC,
                COALESCE(CAST(ppm.PROGRAM_CD AS NVARCHAR(MAX)), CAST(g.PROGRAM AS NVARCHAR(MAX))) AS PROGRAM_CODE,
                CAST(ppm.PROGRAM_DESC AS NVARCHAR(MAX)) AS PROGRAM_DESC,
                COALESCE(CAST(ppm.ACTIVITY_CD AS NVARCHAR(MAX)), CAST(g.ACTIVITY AS NVARCHAR(MAX))) AS ACTIVITY_CODE,
                CAST(ppm.ACTIVITY_DESC AS NVARCHAR(MAX)) AS ACTIVITY_DESC,
                COALESCE(ppm.PPM_BUDGET, 0) AS PPM_BUDGET,
                COALESCE(ppm.PPM_EXPENSES, 0) AS PPM_EXPENSES,
                COALESCE(ppm.PPM_COMMITMENTS, 0) AS PPM_COMMITMENTS,
                COALESCE(ppm.PPM_BUD_BAL, 0) AS PPM_BUD_BAL,
                -COALESCE(g.BEGINNING_BALANCE, 0) AS GL_BEGINNING_BALANCE,
                -COALESCE(g.REVENUE, 0) AS GL_REVENUE,
                COALESCE(g.EXPENSES, 0) AS GL_EXPENSES,
                CAST(p.award_close_date AS NVARCHAR(MAX)) AS AWARD_CLOSE_DATE,
                CAST(p.award_pi AS NVARCHAR(MAX)) AS AWARD_PI,
                CAST(p.billing_cycle AS NVARCHAR(MAX)) AS BILLING_CYCLE,
                CAST(p.project_burden_schedule_base AS NVARCHAR(MAX)) AS PROJECT_BURDEN_SCHEDULE_BASE,
                CAST(p.project_burden_cost_rate AS NVARCHAR(MAX)) AS PROJECT_BURDEN_COST_RATE,
                CAST(p.cost_share_required_by_sponsor AS NVARCHAR(MAX)) AS COST_SHARE_REQUIRED_BY_SPONSOR,
                CAST(p.grant_administrator AS NVARCHAR(MAX)) AS GRANT_ADMINISTRATOR,
                CAST(p.post_reporting_period AS NVARCHAR(MAX)) AS POST_REPORTING_PERIOD,
                CAST(p.primary_sponsor_name AS NVARCHAR(MAX)) AS PRIMARY_SPONSOR_NAME,
                CAST(p.project_fund AS NVARCHAR(MAX)) AS PROJECT_FUND,
                CAST(p.contract_administrator AS NVARCHAR(MAX)) AS CONTRACT_ADMINISTRATOR,
                CAST(p.sponsor_award_number AS NVARCHAR(MAX)) AS SPONSOR_AWARD_NUMBER
            FROM (
                SELECT PROJECT_NUMBER, FUND_CD, PROGRAM_CD, ACTIVITY_CD,
                    MAX(AWARD_NUMBER) AS AWARD_NUMBER, MAX(AWARD_NAME) AS AWARD_NAME,
                    MAX(AWARD_TYPE) AS AWARD_TYPE,
                    MAX(AWARD_START_DATE) AS AWARD_START_DATE, MAX(AWARD_END_DATE) AS AWARD_END_DATE,
                    MAX(AWARD_STATUS) AS AWARD_STATUS,
                    MAX(PROJECT_NAME) AS PROJECT_NAME,
                    MAX(PRJ_OWNING_CD) AS PRJ_OWNING_CD, MAX(PRJ_OWNING_ORG) AS PRJ_OWNING_ORG,
                    MAX(PROJECT_TYPE) AS PROJECT_TYPE, MAX(PROJECT_STATUS_CODE) AS PROJECT_STATUS_CODE,
                    MAX(PM) AS PM, MAX(PA) AS PA, MAX(PI) AS PI, MAX(COPI) AS COPI,
                    MAX(FUND_DESC) AS FUND_DESC,
                    MAX(PURPOSE_CD) AS PURPOSE_CD, MAX(PURPOSE_DESC) AS PURPOSE_DESC,
                    MAX(PROGRAM_DESC) AS PROGRAM_DESC, MAX(ACTIVITY_DESC) AS ACTIVITY_DESC,
                    SUM(CAT_BUDGET) AS PPM_BUDGET, SUM(CAT_ITD_EXP) AS PPM_EXPENSES,
                    SUM(CAT_COMMITMENTS) AS PPM_COMMITMENTS, SUM(CAT_BUD_BAL) AS PPM_BUD_BAL
                FROM faculty
                WHERE CAST(PROJECT_TYPE AS NVARCHAR(MAX)) = ''Internal''
                GROUP BY PROJECT_NUMBER, FUND_CD, PROGRAM_CD, ACTIVITY_CD
            ) ppm
            FULL OUTER JOIN gl g
                ON ppm.PROJECT_NUMBER = g.PROJECT AND ppm.FUND_CD = g.FUND
                AND ppm.PROGRAM_CD = g.PROGRAM AND ppm.ACTIVITY_CD = g.ACTIVITY
            LEFT JOIN pgm p
                ON COALESCE(ppm.PROJECT_NUMBER, g.PROJECT) = p.project_number
                AND ppm.AWARD_NUMBER = p.award_number;';

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
