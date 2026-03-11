-- Temporary sproc using CAES Elzar linked server until we can use the Aggie Enterprise data warehouse in usp_GetProjectSummary.
-- We should delete this sproc once we move to the DWH
CREATE PROCEDURE dbo.usp_GetProjectSummaryElzar
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

    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
    DECLARE @PgmRedshiftQuery NVARCHAR(MAX);
    DECLARE @GLRedshiftQuery NVARCHAR(MAX);
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

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Query linked server tables
    BEGIN TRY
        -- Build pgm_master_data Redshift query
        SET @PgmRedshiftQuery = '
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
        ';

        -- Build GL summary Redshift query
        -- Beginning balance = all 3XXXXX transactions (all time)
        -- Revenue/Expenses = current FY only (4XXXXX/5XXXXX)
        SET @GLRedshiftQuery = '
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
            WHERE tlr.PROJECT IN (' + @ProjectIdFilter + ')
            GROUP BY tlr.PROJECT, tlr.FUND, tlr.PROGRAM, tlr.ACTIVITY
        ';

        -- Build single CTE-based query: pgm from Redshift, portfolio from Elzar, GL from Redshift
        -- CAST required on Elzar linked server columns to avoid text/ntext GROUP BY errors
        -- Build command incrementally to avoid NVARCHAR concatenation truncation
        SET @TSQLCommand = CAST(N'' AS NVARCHAR(MAX));

        -- CTE 1: pgm_master_data from Redshift (award-level metadata)
        SET @TSQLCommand = @TSQLCommand +
            N';WITH pgm_master_data AS (
                SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + N', ''' + REPLACE(@PgmRedshiftQuery, '''', '''''') + N''')
            ),
            ';

        -- CTE 2: portfolio from Elzar joined with pgm_master_data (PPM financials + project metadata)
        SET @TSQLCommand = @TSQLCommand +
            N'portfolio AS (
                SELECT CAST(f.Award_Number AS NVARCHAR(MAX)) AS AWARD_NUMBER, f.Award_Start_Date AS AWARD_START_DATE,
                    f.Award_End_Date AS AWARD_END_DATE,
                    CAST(f.Award_Status AS NVARCHAR(MAX)) AS AWARD_STATUS, CAST(f.Award_Entity AS NVARCHAR(MAX)) AS AWARD_TYPE,
                    CAST(f.Project_Number AS NVARCHAR(MAX)) AS PROJECT_NUMBER, CAST(f.Project_Name AS NVARCHAR(MAX)) AS PROJECT_NAME,
                    CAST(f.Project_Owning_Organization AS NVARCHAR(MAX)) AS PROJECT_OWNING_ORG,
                    CAST(f.Project_Type AS NVARCHAR(MAX)) AS PROJECT_TYPE, CAST(f.Project_Status AS NVARCHAR(MAX)) AS PROJECT_STATUS,
                    CAST(f.Project_Manager AS NVARCHAR(MAX)) AS PM, CAST(f.Project_Administrator AS NVARCHAR(MAX)) AS PA,
                    CAST(f.Project_Principal_Investigator AS NVARCHAR(MAX)) AS PI,
                    CAST(f.[Project_Co-Principal_Investigator] AS NVARCHAR(MAX)) AS COPI,
                    SUM(f.Budget) AS PPM_BUDGET, SUM(f.Expenses) AS PPM_EXPENSES,
                    SUM(f.Commitments) AS PPM_COMMITMENTS,
                    SUM(f.[Budget_Balance_(Budget_' + NCHAR(8211) + N'_(Comm_&_Exp))]) AS PPM_BUD_BAL,
                    CAST(f.UCD_Fund AS NVARCHAR(MAX)) AS FUND_CODE, CAST(f.Task_Fund AS NVARCHAR(MAX)) AS FUND_DESC,
                    '''' AS PURPOSE_CODE, CAST(f.Task_Purpose AS NVARCHAR(MAX)) AS PURPOSE_DESC,
                    CAST(f.Program AS NVARCHAR(MAX)) AS PROGRAM_CODE, CAST(f.Task_Program AS NVARCHAR(MAX)) AS PROGRAM_DESC,
                    CAST(f.Activity AS NVARCHAR(MAX)) AS ACTIVITY_CODE, CAST(f.Task_Activity AS NVARCHAR(MAX)) AS ACTIVITY_DESC,
                    CAST(p.award_close_date AS NVARCHAR(MAX)) AS AWARD_CLOSE_DATE, CAST(p.award_pi AS NVARCHAR(MAX)) AS AWARD_PI, CAST(p.billing_cycle AS NVARCHAR(MAX)) AS BILLING_CYCLE,
                    CAST(p.project_burden_schedule_base AS NVARCHAR(MAX)) AS PROJECT_BURDEN_SCHEDULE_BASE, CAST(p.project_burden_cost_rate AS NVARCHAR(MAX)) AS PROJECT_BURDEN_COST_RATE,
                    CAST(p.cost_share_required_by_sponsor AS NVARCHAR(MAX)) AS COST_SHARE_REQUIRED_BY_SPONSOR, CAST(p.grant_administrator AS NVARCHAR(MAX)) AS GRANT_ADMINISTRATOR,
                    CAST(p.post_reporting_period AS NVARCHAR(MAX)) AS POST_REPORTING_PERIOD,
                    CAST(p.primary_sponsor_name AS NVARCHAR(MAX)) AS PRIMARY_SPONSOR_NAME, CAST(p.project_fund AS NVARCHAR(MAX)) AS PROJECT_FUND,
                    CAST(p.contract_administrator AS NVARCHAR(MAX)) AS CONTRACT_ADMINISTRATOR, CAST(p.sponsor_award_number AS NVARCHAR(MAX)) AS SPONSOR_AWARD_NUMBER
                FROM CAES_ELZAR.AzureDW.dbo.FacultyAndDepartmentPortfolioReport f
                LEFT JOIN pgm_master_data p ON f.Project_Number = p.project_number AND f.Award_Number = p.award_number
                WHERE f.Project_Number IN (' + @ProjectIdFilter + N')
                  AND f.Task_Status <> ''Inactive''
                GROUP BY CAST(f.Award_Number AS NVARCHAR(MAX)), f.Award_Start_Date, f.Award_End_Date,
                    CAST(f.Award_Status AS NVARCHAR(MAX)), CAST(f.Award_Entity AS NVARCHAR(MAX)),
                    CAST(f.Project_Number AS NVARCHAR(MAX)), CAST(f.Project_Name AS NVARCHAR(MAX)),
                    CAST(f.Project_Owning_Organization AS NVARCHAR(MAX)),
                    CAST(f.Project_Type AS NVARCHAR(MAX)), CAST(f.Project_Status AS NVARCHAR(MAX)),
                    CAST(f.Project_Manager AS NVARCHAR(MAX)), CAST(f.Project_Administrator AS NVARCHAR(MAX)),
                    CAST(f.Project_Principal_Investigator AS NVARCHAR(MAX)),
                    CAST(f.[Project_Co-Principal_Investigator] AS NVARCHAR(MAX)),
                    CAST(f.UCD_Fund AS NVARCHAR(MAX)), CAST(f.Task_Fund AS NVARCHAR(MAX)),
                    CAST(f.Task_Purpose AS NVARCHAR(MAX)),
                    CAST(f.Program AS NVARCHAR(MAX)), CAST(f.Task_Program AS NVARCHAR(MAX)),
                    CAST(f.Activity AS NVARCHAR(MAX)), CAST(f.Task_Activity AS NVARCHAR(MAX)),
                    CAST(p.award_close_date AS NVARCHAR(MAX)), CAST(p.award_pi AS NVARCHAR(MAX)), CAST(p.billing_cycle AS NVARCHAR(MAX)),
                    CAST(p.project_burden_schedule_base AS NVARCHAR(MAX)), CAST(p.project_burden_cost_rate AS NVARCHAR(MAX)),
                    CAST(p.cost_share_required_by_sponsor AS NVARCHAR(MAX)), CAST(p.grant_administrator AS NVARCHAR(MAX)),
                    CAST(p.post_reporting_period AS NVARCHAR(MAX)), CAST(p.primary_sponsor_name AS NVARCHAR(MAX)), CAST(p.project_fund AS NVARCHAR(MAX)),
                    CAST(p.contract_administrator AS NVARCHAR(MAX)), CAST(p.sponsor_award_number AS NVARCHAR(MAX))
            ),
            ';

        -- CTE 3: GL summary from Redshift (beginning balance, revenue, expenses by chart string)
        SET @TSQLCommand = @TSQLCommand +
            N'gl_summary AS (
                SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + N', ''' + REPLACE(@GLRedshiftQuery, '''', '''''') + N''')
            ),
            ';

        -- CTE 4: project-level metadata for internal projects
        SET @TSQLCommand = @TSQLCommand +
            N'internal_meta AS (
                SELECT DISTINCT PROJECT_NUMBER, PROJECT_NAME, PROJECT_OWNING_ORG, PROJECT_TYPE, PROJECT_STATUS,
                    PM, PA, PI, COPI,
                    AWARD_NUMBER, AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS, AWARD_TYPE,
                    AWARD_CLOSE_DATE, AWARD_PI, BILLING_CYCLE,
                    PROJECT_BURDEN_SCHEDULE_BASE, PROJECT_BURDEN_COST_RATE,
                    COST_SHARE_REQUIRED_BY_SPONSOR, GRANT_ADMINISTRATOR,
                    POST_REPORTING_PERIOD, PRIMARY_SPONSOR_NAME, PROJECT_FUND,
                    CONTRACT_ADMINISTRATOR, SPONSOR_AWARD_NUMBER
                FROM portfolio
                WHERE PROJECT_TYPE = ''Internal''
            ),
            ';

        -- CTE 5: PPM balances for internal projects at chart string level
        SET @TSQLCommand = @TSQLCommand +
            N'ppm_balances AS (
                SELECT PROJECT_NUMBER, FUND_CODE, PROGRAM_CODE, ACTIVITY_CODE,
                    MAX(FUND_DESC) AS FUND_DESC, MAX(PURPOSE_CODE) AS PURPOSE_CODE,
                    MAX(PURPOSE_DESC) AS PURPOSE_DESC, MAX(PROGRAM_DESC) AS PROGRAM_DESC,
                    MAX(ACTIVITY_DESC) AS ACTIVITY_DESC,
                    SUM(PPM_BUDGET) AS PPM_BUDGET, SUM(PPM_EXPENSES) AS PPM_EXPENSES,
                    SUM(PPM_COMMITMENTS) AS PPM_COMMITMENTS, SUM(PPM_BUD_BAL) AS PPM_BUD_BAL
                FROM portfolio
                WHERE PROJECT_TYPE = ''Internal''
                GROUP BY PROJECT_NUMBER, FUND_CODE, PROGRAM_CODE, ACTIVITY_CODE
            )
            ';

        -- Final SELECT: sponsored from portfolio, internal from FULL OUTER JOIN of PPM + GL
        SET @TSQLCommand = @TSQLCommand + N'
            SELECT AWARD_NUMBER, AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS, AWARD_TYPE,
                PROJECT_NUMBER, PROJECT_NAME, PROJECT_OWNING_ORG, PROJECT_TYPE, PROJECT_STATUS,
                PM, PA, PI, COPI,
                PPM_BUDGET, PPM_EXPENSES, PPM_COMMITMENTS, PPM_BUD_BAL,
                NULL AS GL_BEGINNING_BALANCE, NULL AS GL_REVENUE, NULL AS GL_EXPENSES,
                FUND_CODE, FUND_DESC, PURPOSE_CODE, PURPOSE_DESC,
                PROGRAM_CODE, PROGRAM_DESC, ACTIVITY_CODE, ACTIVITY_DESC,
                AWARD_CLOSE_DATE, AWARD_PI, BILLING_CYCLE,
                PROJECT_BURDEN_SCHEDULE_BASE, PROJECT_BURDEN_COST_RATE,
                COST_SHARE_REQUIRED_BY_SPONSOR, GRANT_ADMINISTRATOR,
                POST_REPORTING_PERIOD, PRIMARY_SPONSOR_NAME, PROJECT_FUND,
                CONTRACT_ADMINISTRATOR, SPONSOR_AWARD_NUMBER
            FROM portfolio
            WHERE PROJECT_TYPE <> ''Internal''

            UNION ALL

            SELECT m.AWARD_NUMBER, m.AWARD_START_DATE, m.AWARD_END_DATE, m.AWARD_STATUS, m.AWARD_TYPE,
                m.PROJECT_NUMBER, m.PROJECT_NAME, m.PROJECT_OWNING_ORG, m.PROJECT_TYPE, m.PROJECT_STATUS,
                m.PM, m.PA, m.PI, m.COPI,
                COALESCE(p.PPM_BUDGET, 0) AS PPM_BUDGET,
                COALESCE(p.PPM_EXPENSES, 0) AS PPM_EXPENSES,
                COALESCE(p.PPM_COMMITMENTS, 0) AS PPM_COMMITMENTS,
                COALESCE(p.PPM_BUD_BAL, 0) AS PPM_BUD_BAL,
                -COALESCE(g.BEGINNING_BALANCE, 0) AS GL_BEGINNING_BALANCE,
                -COALESCE(g.REVENUE, 0) AS GL_REVENUE,
                COALESCE(g.EXPENSES, 0) AS GL_EXPENSES,
                COALESCE(p.FUND_CODE, g.FUND) AS FUND_CODE,
                COALESCE(p.FUND_DESC, '''') AS FUND_DESC,
                COALESCE(p.PURPOSE_CODE, '''') AS PURPOSE_CODE,
                COALESCE(p.PURPOSE_DESC, '''') AS PURPOSE_DESC,
                COALESCE(p.PROGRAM_CODE, g.PROGRAM) AS PROGRAM_CODE,
                COALESCE(p.PROGRAM_DESC, '''') AS PROGRAM_DESC,
                COALESCE(p.ACTIVITY_CODE, g.ACTIVITY) AS ACTIVITY_CODE,
                COALESCE(p.ACTIVITY_DESC, '''') AS ACTIVITY_DESC,
                m.AWARD_CLOSE_DATE, m.AWARD_PI, m.BILLING_CYCLE,
                m.PROJECT_BURDEN_SCHEDULE_BASE, m.PROJECT_BURDEN_COST_RATE,
                m.COST_SHARE_REQUIRED_BY_SPONSOR, m.GRANT_ADMINISTRATOR,
                m.POST_REPORTING_PERIOD, m.PRIMARY_SPONSOR_NAME, m.PROJECT_FUND,
                m.CONTRACT_ADMINISTRATOR, m.SPONSOR_AWARD_NUMBER
            FROM ppm_balances p
            FULL OUTER JOIN gl_summary g ON p.PROJECT_NUMBER = g.PROJECT
                AND p.FUND_CODE = g.FUND
                AND p.PROGRAM_CODE = g.PROGRAM
                AND p.ACTIVITY_CODE = g.ACTIVITY
            JOIN internal_meta m ON COALESCE(p.PROJECT_NUMBER, g.PROJECT) = m.PROJECT_NUMBER;';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectSummaryElzar',
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
            @ProcedureName = 'dbo.usp_GetProjectSummaryElzar',
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