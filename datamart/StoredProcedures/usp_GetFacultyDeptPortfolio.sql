CREATE PROCEDURE dbo.usp_GetFacultyDeptPortfolio
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

    DECLARE @RedshiftQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
    DECLARE @FilterClause NVARCHAR(MAX) = '';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Sanitize ApplicationName for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Parse and validate ProjectIds
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    SET @FilterClause = ' WHERE f.PROJECT_NUMBER IN (' + @ProjectIdFilter + ')';

    -- Add date overlap logic
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND f.award_end_date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND f.award_start_date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build Redshift query with LEFT JOIN to pgm_master_data
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
        )
        SELECT f.AWARD_NUMBER, f.AWARD_NAME, f.AWARD_TYPE, f.AWARD_ENTITY, f.AWARD_START_DATE, f.AWARD_END_DATE, f.AWARD_STATUS, f.AWD_PI_NAME,
        f.FUNDING_SOURCE, f.PROJECT_NUMBER, f.PROJECT_NAME, f.PROJECT_ENTITY, f.PRJ_OWNING_ORG AS PROJECT_OWNING_ORG,
        f.PROJECT_TYPE, f.PROJECT_STATUS_CODE AS PROJECT_STATUS, f.TASK_NUM, f.TASK_NAME, f.TASK_STATUS, f.PM, f.PA, f.PI, f.COPI, f.EXPENDITURE_CATEGORY_NAME,
        f.FUND_CD AS FUND_CODE, f.FUND_DESC, f.PURPOSE_CD AS PURPOSE_CODE, f.PURPOSE_DESC,
        f.PROGRAM_CD AS PROGRAM_CODE, f.PROGRAM_DESC, f.ACTIVITY_CD AS ACTIVITY_CODE, f.ACTIVITY_DESC,
        f.CAT_BUDGET, f.CAT_COMMITMENTS, f.CAT_ITD_EXP, f.CAT_BUD_BAL,
        p.award_close_date AS AWARD_CLOSE_DATE, p.award_pi AS AWARD_PI, p.billing_cycle AS BILLING_CYCLE,
        p.project_burden_schedule_base AS PROJECT_BURDEN_SCHEDULE_BASE, p.project_burden_cost_rate AS PROJECT_BURDEN_COST_RATE,
        p.cost_share_required_by_sponsor AS COST_SHARE_REQUIRED_BY_SPONSOR, p.grant_administrator AS GRANT_ADMINISTRATOR,
        p.post_reporting_period AS POST_REPORTING_PERIOD,
        p.primary_sponsor_name AS PRIMARY_SPONSOR_NAME, p.project_fund AS PROJECT_FUND,
        p.contract_administrator AS CONTRACT_ADMINISTRATOR, p.sponsor_award_number AS SPONSOR_AWARD_NUMBER
        FROM ae_dwh.ucd_faculty_rpt_t f
        LEFT JOIN pgm p ON f.project_number = p.project_number AND f.award_number = p.award_number
        ' + @FilterClause;

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
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO