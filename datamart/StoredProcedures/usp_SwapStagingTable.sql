/*
<summary>
Performs a full snapshot replacement from an allowlisted staging table into its
corresponding final table.
</summary>
<remarks>
This procedure is intended for ETL-managed tables where dbo.<TableName>_Staging
has already been fully loaded and validated by the pipeline. Empty staging tables
are rejected so an upstream load failure cannot wipe the final table. Future
tables should be added to the allowlist only after confirming that final/staging
schemas match and replace-all semantics are correct.
</remarks>
*/
CREATE PROCEDURE [dbo].[usp_SwapStagingTable]
    @TableName SYSNAME
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @AllowedTables TABLE
    (
        [TableName] SYSNAME NOT NULL PRIMARY KEY
    );

    INSERT INTO @AllowedTables ([TableName])
    VALUES
        (N'People'),
        (N'PpmAwards'),
        (N'PpmPeople'),
        (N'PpmPersonRoles'),
        (N'PpmProjects'),
        (N'PpmProjectAwards');

    IF NOT EXISTS
    (
        SELECT 1
        FROM @AllowedTables
        WHERE [TableName] = @TableName
    )
    BEGIN
        THROW 51000, 'The requested table is not allowlisted for staging swaps.', 1;
    END;

    DECLARE @SchemaName SYSNAME = N'dbo';
    DECLARE @StagingTableName SYSNAME = @TableName + N'_Staging';
    DECLARE @TargetTable NVARCHAR(517) = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName);
    DECLARE @StagingTable NVARCHAR(517) = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@StagingTableName);
    DECLARE @TargetObjectId INT = OBJECT_ID(@TargetTable, N'U');
    DECLARE @StagingObjectId INT = OBJECT_ID(@StagingTable, N'U');
    DECLARE @ColumnList NVARCHAR(MAX);
    DECLARE @Sql NVARCHAR(MAX);
    DECLARE @StagingRowCount BIGINT;
    DECLARE @InsertedRows BIGINT;
    DECLARE @LockResult INT;
    DECLARE @LockResource NVARCHAR(255) = N'usp_SwapStagingTable:' + @TargetTable;

    IF @TargetObjectId IS NULL OR @StagingObjectId IS NULL
    BEGIN
        THROW 51001, 'The target table or staging table does not exist.', 1;
    END;

    IF EXISTS
    (
        SELECT 1
        FROM
        (
            SELECT
                [name],
                [system_type_id],
                [user_type_id],
                [max_length],
                [precision],
                [scale],
                [collation_name],
                [is_nullable],
                [is_identity],
                [is_computed]
            FROM sys.columns
            WHERE [object_id] = @TargetObjectId
        ) AS target_columns
        FULL OUTER JOIN
        (
            SELECT
                [name],
                [system_type_id],
                [user_type_id],
                [max_length],
                [precision],
                [scale],
                [collation_name],
                [is_nullable],
                [is_identity],
                [is_computed]
            FROM sys.columns
            WHERE [object_id] = @StagingObjectId
        ) AS staging_columns
            ON target_columns.[name] = staging_columns.[name]
        WHERE target_columns.[name] IS NULL
           OR staging_columns.[name] IS NULL
           OR target_columns.[system_type_id] <> staging_columns.[system_type_id]
           OR target_columns.[user_type_id] <> staging_columns.[user_type_id]
           OR target_columns.[max_length] <> staging_columns.[max_length]
           OR target_columns.[precision] <> staging_columns.[precision]
           OR target_columns.[scale] <> staging_columns.[scale]
           OR ISNULL(target_columns.[collation_name], N'') <> ISNULL(staging_columns.[collation_name], N'')
           OR target_columns.[is_nullable] <> staging_columns.[is_nullable]
           OR target_columns.[is_identity] <> 0
           OR staging_columns.[is_identity] <> 0
           OR target_columns.[is_computed] <> 0
           OR staging_columns.[is_computed] <> 0
    )
    BEGIN
        THROW 51002, 'The target table and staging table schemas are not compatible.', 1;
    END;

    SELECT @ColumnList =
        STRING_AGG(CAST(QUOTENAME([name]) AS NVARCHAR(MAX)), N', ')
            WITHIN GROUP (ORDER BY [column_id])
    FROM sys.columns
    WHERE [object_id] = @TargetObjectId;

    IF @ColumnList IS NULL
    BEGIN
        THROW 51003, 'The target table does not have any insertable columns.', 1;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Serialize swaps by table so two pipeline runs cannot interleave replacements.
        EXEC @LockResult = sys.sp_getapplock
            @Resource = @LockResource,
            @LockMode = N'Exclusive',
            @LockOwner = N'Transaction',
            @LockTimeout = 60000;

        IF @LockResult < 0
        BEGIN
            ROLLBACK TRANSACTION;
            THROW 51004, 'Could not acquire the staging swap lock for the requested table.', 1;
        END;

        SET @Sql = N'SELECT @Rows = COUNT_BIG(*) FROM ' + @StagingTable + N';';

        EXEC sys.sp_executesql
            @Sql,
            N'@Rows BIGINT OUTPUT',
            @Rows = @StagingRowCount OUTPUT;

        IF @StagingRowCount = 0
        BEGIN
            ROLLBACK TRANSACTION;
            THROW 51005, 'The staging table is empty; target table was not changed.', 1;
        END;

        SET @Sql =
            N'DELETE FROM ' + @TargetTable + N';
INSERT INTO ' + @TargetTable + N' (' + @ColumnList + N')
SELECT ' + @ColumnList + N'
FROM ' + @StagingTable + N';
SET @Rows = @@ROWCOUNT;';

        EXEC sys.sp_executesql
            @Sql,
            N'@Rows BIGINT OUTPUT',
            @Rows = @InsertedRows OUTPUT;

        COMMIT TRANSACTION;

        SELECT
            @TableName AS [TableName],
            @StagingTableName AS [StagingTableName],
            @InsertedRows AS [InsertedRowCount];
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        THROW;
    END CATCH;
END;
GO
