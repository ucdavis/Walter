CREATE PROCEDURE [dbo].[usp_HealthCheck_SchemaValidation]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @BaselineID INT;
    DECLARE @LinkedServerName NVARCHAR(128);
    DECLARE @SourceType NVARCHAR(20);
    DECLARE @SchemaName NVARCHAR(128);
    DECLARE @TableName NVARCHAR(128);
    DECLARE @BaselineColumns NVARCHAR(MAX);
    DECLARE @ColumnListCSV NVARCHAR(MAX);
    DECLARE @TestQuery NVARCHAR(1000);
    DECLARE @ErrorMessage NVARCHAR(MAX);
    DECLARE @FailedTables NVARCHAR(MAX) = '';
    DECLARE @SuccessCount INT = 0;
    DECLARE @FailCount INT = 0;

    -- Validate baseline data (check for single quotes)
    IF EXISTS (
        SELECT 1 FROM [dbo].[DataSourceBaseline]
        WHERE ([LinkedServerName] LIKE '%''%' OR [TableName] LIKE '%''%' OR [SchemaName] LIKE '%''%')
        AND [IsActive] = 1
    )
    BEGIN
        RAISERROR('Invalid data: LinkedServerName, TableName, or SchemaName contains single quote character', 16, 1);
        RETURN;
    END;

    -- Cursor to validate each active table
    DECLARE table_cursor CURSOR FOR
        SELECT [BaselineID], [LinkedServerName], [SourceType], [SchemaName], [TableName], [ColumnList]
        FROM [dbo].[DataSourceBaseline]
        WHERE [IsActive] = 1;

    OPEN table_cursor;
    FETCH NEXT FROM table_cursor INTO @BaselineID, @LinkedServerName, @SourceType, @SchemaName, @TableName, @BaselineColumns;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            -- Parse JSON baseline columns into comma-separated list
            SELECT @ColumnListCSV = STRING_AGG(value, ',')
            FROM OPENJSON(@BaselineColumns);

            -- Build fully qualified table name
            DECLARE @FullTableName NVARCHAR(300) =
                CASE WHEN @SchemaName IS NOT NULL THEN @SchemaName + '.' ELSE '' END + @TableName;

            -- Build query to select baseline columns with no rows returned
            SET @TestQuery = 'SELECT ' + @ColumnListCSV + ' FROM ' + @FullTableName + ' WHERE 1=0';

            -- Try to execute - will fail if any column is missing/renamed
            DECLARE @SQL NVARCHAR(MAX) =
                N'SELECT * FROM OPENQUERY(' + QUOTENAME(@LinkedServerName) + N', ''' + @TestQuery + N''')';

            EXEC sp_executesql @SQL;

            SET @SuccessCount = @SuccessCount + 1;
        END TRY
        BEGIN CATCH
            SET @FailCount = @FailCount + 1;
            SET @ErrorMessage = ERROR_MESSAGE();
            SET @FailedTables = @FailedTables +
                @LinkedServerName + '.' + @TableName + ': ' + @ErrorMessage + CHAR(10);
        END CATCH;

        FETCH NEXT FROM table_cursor INTO @BaselineID, @LinkedServerName, @SourceType, @SchemaName, @TableName, @BaselineColumns;
    END;

    CLOSE table_cursor;
    DEALLOCATE table_cursor;

    -- Raise error if any tables failed
    IF @FailCount > 0
    BEGIN
        SET @ErrorMessage =
            'Schema validation FAILED for ' + CAST(@FailCount AS NVARCHAR) +
            ' table(s):' + CHAR(10) + @FailedTables;
        RAISERROR(@ErrorMessage, 16, 1);
    END;

    -- Return success summary
    SELECT
        'Schema validation PASSED' AS [Status],
        @SuccessCount AS [TablesValidated],
        @FailCount AS [TablesFailed];
END;
