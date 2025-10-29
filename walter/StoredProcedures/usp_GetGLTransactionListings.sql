CREATE PROCEDURE dbo.usp_GetGLTransactionListings
    @FinancialDept VARCHAR(7),
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: FinancialDept is required
    IF @FinancialDept IS NULL
    BEGIN
        RAISERROR('FinancialDept is required', 16, 1);
        RETURN;
    END;

    -- Validate input format: exactly 7 alphanumeric characters
    IF LEN(@FinancialDept) != 7 OR @FinancialDept LIKE '%[^A-Z0-9]%'
    BEGIN
        RAISERROR('Invalid Financial Dept format (must be exactly 7 alphanumeric characters)', 16, 1);
        RETURN;
    END;

    -- Validate date range if both are provided
    IF @StartDate IS NOT NULL AND @EndDate IS NOT NULL AND @EndDate < @StartDate
    BEGIN
        RAISERROR('EndDate must be greater than or equal to StartDate', 16, 1);
        RETURN;
    END;

    -- Validate that FinancialDept belongs to ANR or CAES hierarchy
    DECLARE @IsValidDept INT;
    DECLARE @ValidationQuery NVARCHAR(MAX);
    DECLARE @ValidationTSQL NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';

    SET @ValidationQuery = '
        SELECT COUNT(*) AS cnt
        FROM ae_dwh.erp_fin_dept
        WHERE code = ''' + @FinancialDept + '''
          AND (parent_level_2_code = ''AAES00C'' OR parent_level_3_code = ''9AAES0D'')
          AND hierarchy_depth = 6
    ';

    SET @ValidationTSQL =
        'SELECT TOP 1 @Count = cnt FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@ValidationQuery, '''', '''''') + ''')';

    EXEC sp_executesql @ValidationTSQL, N'@Count INT OUTPUT', @Count = @IsValidDept OUTPUT;

    IF @IsValidDept = 0
    BEGIN
        RAISERROR('Financial Department must belong to ANR or CAES hierarchy', 16, 1);
        RETURN;
    END;

    DECLARE @RedshiftQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @FilterClause NVARCHAR(MAX) = '';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Build filter clause
    SET @FilterClause = ' WHERE financial_department = ''' + @FinancialDept + '''';

    -- Add date filters
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND journal_acct_date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND journal_acct_date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build Redshift query with explicit column list
    SET @RedshiftQuery = '
        SELECT
            entity, entity_description, fund, fund_description,
            financial_department, financial_department_description,
            account, account_description, purpose, purpose_description,
            program, program_description, project, project_description,
            activity, activity_description, document_type,
            accounting_sequence_number, tracking_no, reference,
            journal_line_description, journal_acct_date, journal_name,
            journal_reference, period_name, journal_batch_name,
            journal_source, journal_category, batch_status, actual_flag,
            encumbrance_type_code, actual_amount, commitment_amount,
            obligation_amount
        FROM ae_dwh.transactional_listing_report
        ' + @FilterClause;

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @FinancialDept AS FinancialDept,
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