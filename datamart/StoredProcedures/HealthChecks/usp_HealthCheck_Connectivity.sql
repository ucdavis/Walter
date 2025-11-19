CREATE PROCEDURE [dbo].[usp_HealthCheck_Connectivity]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @LinkedServerName NVARCHAR(128);
    DECLARE @SourceType NVARCHAR(20);
    DECLARE @TestQuery NVARCHAR(500);
    DECLARE @ErrorMessage NVARCHAR(MAX);
    DECLARE @FailedSources NVARCHAR(MAX) = '';
    DECLARE @SuccessCount INT = 0;
    DECLARE @FailCount INT = 0;

    -- Validate baseline data (check for single quotes)
    IF EXISTS (SELECT 1 FROM [dbo].[DataSourceBaseline] WHERE [LinkedServerName] LIKE '%''%' AND [IsActive] = 1)
    BEGIN
        RAISERROR('Invalid data: LinkedServerName contains single quote character', 16, 1);
        RETURN;
    END;

    -- Cursor to test each active linked server
    DECLARE source_cursor CURSOR FOR
        SELECT DISTINCT [LinkedServerName], [SourceType]
        FROM [dbo].[DataSourceBaseline]
        WHERE [IsActive] = 1;

    OPEN source_cursor;
    FETCH NEXT FROM source_cursor INTO @LinkedServerName, @SourceType;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            -- Build test query based on source type
            IF @SourceType = 'Oracle'
                SET @TestQuery = 'SELECT 1 FROM DUAL';
            ELSE IF @SourceType IN ('Redshift', 'SQLServer')
                SET @TestQuery = 'SELECT 1';
            ELSE
                RAISERROR('Unknown SourceType: %s', 16, 1, @SourceType);

            -- Execute connectivity test with QUOTENAME for security
            DECLARE @SQL NVARCHAR(MAX) =
                N'SELECT * FROM OPENQUERY(' + QUOTENAME(@LinkedServerName) + N', ''' + @TestQuery + N''')';

            EXEC sp_executesql @SQL;

            SET @SuccessCount = @SuccessCount + 1;
        END TRY
        BEGIN CATCH
            SET @FailCount = @FailCount + 1;
            SET @ErrorMessage = ERROR_MESSAGE();
            SET @FailedSources = @FailedSources +
                @LinkedServerName + ' (' + @SourceType + '): ' + @ErrorMessage + CHAR(10);
        END CATCH;

        FETCH NEXT FROM source_cursor INTO @LinkedServerName, @SourceType;
    END;

    CLOSE source_cursor;
    DEALLOCATE source_cursor;

    -- Raise error if any sources failed
    IF @FailCount > 0
    BEGIN
        SET @ErrorMessage =
            'Connectivity check FAILED for ' + CAST(@FailCount AS NVARCHAR) +
            ' source(s):' + CHAR(10) + @FailedSources;
        RAISERROR(@ErrorMessage, 16, 1);
    END;

    -- Return success summary
    SELECT
        'Connectivity check PASSED' AS [Status],
        @SuccessCount AS [SourcesTested],
        @FailCount AS [SourcesFailed];
END;
