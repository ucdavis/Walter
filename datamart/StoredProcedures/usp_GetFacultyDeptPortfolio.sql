CREATE PROCEDURE dbo.usp_GetFacultyDeptPortfolio
    @FinancialDept VARCHAR(7) = NULL,
    @ProjectIds VARCHAR(MAX) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: exactly one filter must be provided
    IF (@FinancialDept IS NULL AND @ProjectIds IS NULL)
    BEGIN
        RAISERROR('Either @FinancialDept or @ProjectIds must be provided', 16, 1);
        RETURN;
    END;

    IF (@FinancialDept IS NOT NULL AND @ProjectIds IS NOT NULL)
    BEGIN
        RAISERROR('Cannot specify both @FinancialDept and @ProjectIds', 16, 1);
        RETURN;
    END;

    -- Validate FinancialDept if provided
    IF @FinancialDept IS NOT NULL
        EXEC dbo.usp_ValidateFinancialDept @FinancialDept;

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

    -- Sanitize FinancialDept for SQL injection protection
    IF @FinancialDept IS NOT NULL
        EXEC dbo.usp_SanitizeInputString @FinancialDept OUTPUT;

    -- Parse and validate ProjectIds if provided
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    IF @ProjectIds IS NOT NULL
        EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build filter clause based on which parameter was provided
    IF @FinancialDept IS NOT NULL
        SET @FilterClause = ' WHERE prj_owning_cd = ''' + @FinancialDept + '''';
    ELSE
        SET @FilterClause = ' WHERE PROJECT_NUMBER IN (' + @ProjectIdFilter + ')';

    -- Add date overlap logic
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND award_end_date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND award_start_date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build Redshift query
    SET @RedshiftQuery = '
        SELECT AWARD_NUMBER, AWARD_NAME, AWARD_TYPE, AWARD_ENTITY, AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS, AWD_PI_NAME,
        FUNDING_SOURCE, PROJECT_NUMBER, PROJECT_NAME, PROJECT_ENTITY, PRJ_OWNING_ORG AS PROJECT_OWNING_ORG,
        PROJECT_TYPE, PROJECT_STATUS_CODE AS PROJECT_STATUS, TASK_NUM, TASK_NAME, TASK_STATUS, PM, PA, PI, COPI, EXPENDITURE_CATEGORY_NAME,
        FUND_CD AS FUND_CODE, FUND_DESC, PURPOSE_CD AS PURPOSE_CODE, PURPOSE_DESC,
        PROGRAM_CD AS PROGRAM_CODE, PROGRAM_DESC, ACTIVITY_CD AS ACTIVITY_CODE, ACTIVITY_DESC,
        CAT_BUDGET, CAT_COMMITMENTS, CAT_ITD_EXP, CAT_BUD_BAL
        FROM ae_dwh.ucd_faculty_rpt_t
        ' + @FilterClause;

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @FinancialDept AS FinancialDept,
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