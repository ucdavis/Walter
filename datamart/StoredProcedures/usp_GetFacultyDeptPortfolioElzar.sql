-- Temporary sproc using CAES Elzar linked server until we can use the Aggie Enterprise data warehouse in usp_GetFacultyDeptPortfolio.
-- We should delete this sproc once we move to the DWH
CREATE PROCEDURE dbo.usp_GetFacultyDeptPortfolioElzar
    @ProjectIds VARCHAR(MAX) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL
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
    DECLARE @FilterClause NVARCHAR(MAX) = '';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
    DECLARE @PgmRedshiftQuery NVARCHAR(MAX);

    -- Sanitize ApplicationName for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Parse and validate ProjectIds
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    SET @FilterClause = ' WHERE f.Project_Number IN (' + @ProjectIdFilter + ')';

    -- Add date overlap logic
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND f.Award_End_Date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND f.Award_Start_Date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            CONVERT(VARCHAR(10), @StartDate, 120) AS StartDate,
            CONVERT(VARCHAR(10), @EndDate, 120) AS EndDate,
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

        -- Load pgm_master_data into temp table, then LEFT JOIN to Elzar data
        SET @TSQLCommand =
            'SELECT * INTO #PgmMasterData FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@PgmRedshiftQuery, '''', '''''') + ''');
            SELECT f.Award_Number AS AWARD_NUMBER, f.Award_Start_Date AS AWARD_START_DATE, f.Award_End_Date AS AWARD_END_DATE,
                f.Award_Status AS AWARD_STATUS, f.Award_Entity AS AWARD_TYPE,
                f.Project_Number AS PROJECT_NUMBER, f.Project_Name AS PROJECT_NAME,
                f.Project_Owning_Organization AS PROJECT_OWNING_ORG,
                ''All Expenditures'' AS EXPENDITURE_CATEGORY_NAME,
                f.Project_Type AS PROJECT_TYPE, f.Project_Status AS PROJECT_STATUS,
                f.[Task/Subtask_Number] AS TASK_NUM, f.[Task/Subtask_Name] AS TASK_NAME, f.Task_Status AS TASK_STATUS,
                f.Project_Manager AS PM, f.Project_Administrator AS PA,
                f.Project_Principal_Investigator AS PI,
                f.[Project_Co-Principal_Investigator] AS COPI,
                f.Budget AS CAT_BUDGET, f.Expenses AS CAT_ITD_EXP,
                f.Commitments AS CAT_COMMITMENTS,
                f.[Budget_Balance_(Budget_' + NCHAR(8211) + N'_(Comm_&_Exp))] AS CAT_BUD_BAL,
                f.UCD_Fund AS FUND_CODE, f.Task_Fund AS FUND_DESC,
                '''' AS PURPOSE_CODE, f.Task_Purpose AS PURPOSE_DESC,
                f.Program AS PROGRAM_CODE, f.Task_Program AS PROGRAM_DESC,
                f.Activity AS ACTIVITY_CODE, f.Task_Activity AS ACTIVITY_DESC,
                p.award_close_date AS AWARD_CLOSE_DATE, p.award_pi AS AWARD_PI, p.billing_cycle AS BILLING_CYCLE,
                p.project_burden_schedule_base AS PROJECT_BURDEN_SCHEDULE_BASE, p.project_burden_cost_rate AS PROJECT_BURDEN_COST_RATE,
                p.cost_share_required_by_sponsor AS COST_SHARE_REQUIRED_BY_SPONSOR, p.grant_administrator AS GRANT_ADMINISTRATOR,
                p.post_reporting_period AS POST_REPORTING_PERIOD,
                p.primary_sponsor_name AS PRIMARY_SPONSOR_NAME, p.project_fund AS PROJECT_FUND,
                p.contract_administrator AS CONTRACT_ADMINISTRATOR, p.sponsor_award_number AS SPONSOR_AWARD_NUMBER
            FROM CAES_ELZAR.AzureDW.dbo.FacultyAndDepartmentPortfolioReport f
            LEFT JOIN #PgmMasterData p ON f.Project_Number = p.project_number AND f.Award_Number = p.award_number'
            + @FilterClause;

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolioElzar',
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
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolioElzar',
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