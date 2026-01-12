CREATE PROCEDURE dbo.usp_GetGLTransactionListings
    @FinancialDept VARCHAR(7) = NULL,
    @ProjectIds VARCHAR(MAX) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL
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

    -- Sanitize ApplicationName for injection protection (whitelist: alphanumeric + spaces only)
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize FinancialDept for SQL injection protection (defense in depth)
    IF @FinancialDept IS NOT NULL
        EXEC dbo.usp_SanitizeInputString @FinancialDept OUTPUT;

    -- Parse and validate ProjectIds if provided
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    IF @ProjectIds IS NOT NULL
        EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build filter clause based on which parameter was provided
    IF @FinancialDept IS NOT NULL
        SET @FilterClause = ' WHERE financial_department = ''' + @FinancialDept + '''';
    ELSE
        SET @FilterClause = ' WHERE PROJECT IN (' + @ProjectIdFilter + ')';

    -- Add date filters
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND journal_acct_date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND journal_acct_date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build Redshift query with explicit column list
    SET @RedshiftQuery = '
        SELECT
            ENTITY, ENTITY_DESCRIPTION, FUND, FUND_DESCRIPTION,
            FINANCIAL_DEPARTMENT, FINANCIAL_DEPARTMENT_DESCRIPTION,
            ACCOUNT, ACCOUNT_DESCRIPTION, PURPOSE, PURPOSE_DESCRIPTION,
            PROGRAM, PROGRAM_DESCRIPTION, PROJECT, PROJECT_DESCRIPTION,
            ACTIVITY, ACTIVITY_DESCRIPTION, DOCUMENT_TYPE,
            ACCOUNTING_SEQUENCE_NUMBER, TRACKING_NO, REFERENCE,
            JOURNAL_LINE_DESCRIPTION, JOURNAL_ACCT_DATE, JOURNAL_NAME,
            JOURNAL_REFERENCE, PERIOD_NAME, JOURNAL_BATCH_NAME,
            JOURNAL_SOURCE, JOURNAL_CATEGORY, BATCH_STATUS, ACTUAL_FLAG,
            ENCUMBRANCE_TYPE_CODE, ACTUAL_AMOUNT, COMMITMENT_AMOUNT,
            OBLIGATION_AMOUNT
        FROM ae_dwh.transactional_listing_report
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
            @ProcedureName = 'dbo.usp_GetGLTransactionListings',
            @Duration_MS = @Duration_MS,
            @RowCount = @RowCount,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();

        -- Log failed execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGLTransactionListings',
            @Duration_MS = @Duration_MS,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO