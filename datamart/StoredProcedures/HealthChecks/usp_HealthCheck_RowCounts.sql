CREATE PROCEDURE [dbo].[usp_HealthCheck_RowCounts]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @BaselineID INT;
    DECLARE @LinkedServerName NVARCHAR(128);
    DECLARE @SourceType NVARCHAR(20);
    DECLARE @SchemaName NVARCHAR(128);
    DECLARE @TableName NVARCHAR(128);
    DECLARE @BaselineRowCount BIGINT;
    DECLARE @CurrentRowCount BIGINT;
    DECLARE @FullTableName NVARCHAR(300);
    DECLARE @CountQuery NVARCHAR(500);
    DECLARE @SQL NVARCHAR(MAX);
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
        SELECT [BaselineID], [LinkedServerName], [SourceType], [SchemaName], [TableName], [BaselineRowCount]
        FROM [dbo].[DataSourceBaseline]
        WHERE [IsActive] = 1;

    OPEN table_cursor;
    FETCH NEXT FROM table_cursor INTO @BaselineID, @LinkedServerName, @SourceType, @SchemaName, @TableName, @BaselineRowCount;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            -- Build fully qualified table name
            SET @FullTableName = CASE WHEN @SchemaName IS NOT NULL THEN @SchemaName + '.' ELSE '' END + @TableName;

            -- Build count query
            SET @CountQuery = 'SELECT COUNT(*) FROM ' + @FullTableName;

            -- Execute count query
            SET @SQL = N'SELECT @CurrentRowCount = * FROM OPENQUERY(' + QUOTENAME(@LinkedServerName) + N', ''' + @CountQuery + N''')';

            EXEC sp_executesql @SQL, N'@CurrentRowCount BIGINT OUTPUT', @CurrentRowCount OUTPUT;

            -- Check if baseline needs to be initialized
            IF @BaselineRowCount IS NULL
            BEGIN
                -- First run - set baseline
                UPDATE [dbo].[DataSourceBaseline]
                SET [BaselineRowCount] = @CurrentRowCount,
                    [UpdatedAt] = SYSDATETIME()
                WHERE [BaselineID] = @BaselineID;

                SET @SuccessCount = @SuccessCount + 1;
            END
            ELSE IF @CurrentRowCount < @BaselineRowCount
            BEGIN
                -- Row count decreased - potential data loss
                SET @FailCount = @FailCount + 1;
                SET @FailedTables = @FailedTables +
                    @LinkedServerName + '.' + @TableName + ': Row count decreased' + CHAR(10) +
                    '  Baseline: ' + CAST(@BaselineRowCount AS NVARCHAR) + CHAR(10) +
                    '  Current: ' + CAST(@CurrentRowCount AS NVARCHAR) + CHAR(10);
            END
            ELSE
            BEGIN
                -- Row count increased or stayed same - update baseline
                UPDATE [dbo].[DataSourceBaseline]
                SET [BaselineRowCount] = @CurrentRowCount,
                    [UpdatedAt] = SYSDATETIME()
                WHERE [BaselineID] = @BaselineID;

                SET @SuccessCount = @SuccessCount + 1;
            END
        END TRY
        BEGIN CATCH
            SET @FailCount = @FailCount + 1;
            SET @ErrorMessage = ERROR_MESSAGE();
            SET @FailedTables = @FailedTables +
                @LinkedServerName + '.' + @TableName + ': ' + @ErrorMessage + CHAR(10);
        END CATCH;

        FETCH NEXT FROM table_cursor INTO @BaselineID, @LinkedServerName, @SourceType, @SchemaName, @TableName, @BaselineRowCount;
    END;

    CLOSE table_cursor;
    DEALLOCATE table_cursor;

    IF @FailCount > 0
    BEGIN
        SET @ErrorMessage =
            'Row count validation FAILED for ' + CAST(@FailCount AS NVARCHAR) +
            ' table(s):' + CHAR(10) + @FailedTables;
        RAISERROR(@ErrorMessage, 16, 1);
    END;

    SELECT
        'Row count validation PASSED' AS [Status],
        @SuccessCount AS [TablesValidated],
        @FailCount AS [TablesFailed];
END;