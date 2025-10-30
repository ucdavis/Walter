CREATE PROCEDURE dbo.usp_ValidateFinancialDept
    @FinancialDept VARCHAR(7)
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

    -- Validate that FinancialDept belongs to ANR or CAES at hierarchy level G (6)
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
        RAISERROR('Financial Department ''%s'' must be a level G code under CA&ES or ANR', 16, 1, @FinancialDept);
        RETURN;
    END;
END;
GO