CREATE PROCEDURE dbo.usp_GetGLTransactionListings
    @FinancialDept VARCHAR(7) = NULL,
    @ProjectIds VARCHAR(MAX) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
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

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Sanitize FinancialDept for SQL injection protection (defense in depth)
    IF @FinancialDept IS NOT NULL
        EXEC dbo.usp_SanitizeInputString @FinancialDept OUTPUT;

    -- Parse and validate ProjectIds if provided
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    IF @ProjectIds IS NOT NULL
        EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build filter clause based on which parameter was provided
    IF @FinancialDept IS NOT NULL
        SET @FilterClause = ' WHERE tlr.financial_department = ''' + @FinancialDept + '''';
    ELSE
        SET @FilterClause = ' WHERE tlr.PROJECT IN (' + @ProjectIdFilter + ')';

    -- Add date filters
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND tlr.journal_acct_date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND tlr.journal_acct_date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Exclude carryforward 3XXXXXX activity with two exceptions:
    --   1. Jul-23 one-time UCD conversion ASNs (initial rollover from legacy financial system)
    --   2. Apr-24 UCD Conversion journal entries (balance correction adjustments)
    -- Same exclusion logic as usp_GetGLPPMReconciliation.
    SET @FilterClause = @FilterClause + ' AND (
            acc.parent_level_0_code NOT LIKE ''3%''
            OR (tlr.PERIOD_NAME = ''Jul-23'' AND tlr.ACCOUNTING_SEQUENCE_NUMBER IN (''100009'',''100010'',''100307'',''103283'',''103284''))
            OR (tlr.PERIOD_NAME = ''Apr-24'' AND tlr.JOURNAL_SOURCE = ''UCD Conversion'' AND tlr.JOURNAL_CATEGORY = ''UCD Conversion'')
        )';

    SET @FilterClause = @FilterClause + ' AND tlr.PERIOD_NAME <> ''Jun-23''';

    -- Build Redshift query with explicit column list
    SET @RedshiftQuery = '
        SELECT
            tlr.ENTITY, tlr.ENTITY_DESCRIPTION, tlr.FUND, tlr.FUND_DESCRIPTION,
            tlr.FINANCIAL_DEPARTMENT, tlr.FINANCIAL_DEPARTMENT_DESCRIPTION,
            tlr.ACCOUNT, tlr.ACCOUNT_DESCRIPTION, tlr.PURPOSE, tlr.PURPOSE_DESCRIPTION,
            tlr.PROGRAM, tlr.PROGRAM_DESCRIPTION, tlr.PROJECT, tlr.PROJECT_DESCRIPTION,
            tlr.ACTIVITY, tlr.ACTIVITY_DESCRIPTION, tlr.DOCUMENT_TYPE,
            tlr.ACCOUNTING_SEQUENCE_NUMBER, tlr.TRACKING_NO, tlr.REFERENCE,
            tlr.JOURNAL_LINE_DESCRIPTION, tlr.JOURNAL_ACCT_DATE, tlr.JOURNAL_NAME,
            tlr.JOURNAL_REFERENCE, tlr.PERIOD_NAME, tlr.JOURNAL_BATCH_NAME,
            tlr.JOURNAL_SOURCE, tlr.JOURNAL_CATEGORY, tlr.BATCH_STATUS, tlr.ACTUAL_FLAG,
            tlr.ENCUMBRANCE_TYPE_CODE, tlr.ACTUAL_AMOUNT, tlr.COMMITMENT_AMOUNT,
            tlr.OBLIGATION_AMOUNT,
            acc.parent_level_0_code AS NATURAL_ACCOUNT_TYPE
        FROM ae_dwh.transactional_listing_report tlr
        LEFT JOIN ae_dwh.erp_account acc ON tlr.ACCOUNT = acc.code
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
            @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser,
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
            @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO