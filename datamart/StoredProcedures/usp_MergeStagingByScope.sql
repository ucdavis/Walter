/*
<summary>
Applies an incremental load from an allowlisted staging table into its final
table by replacing the scopes present in staging: every final-table row whose
scope-column values match a row in staging is deleted, then all of staging is
inserted, in one transaction.
</summary>
<remarks>
Companion to usp_SwapStagingTable for tables that accumulate history and receive
only a window of it each run (for example PPM costs for the open accounting
periods). The staging table holds one run's rows; the scope columns identify
which slices of the final table those rows fully replace. Rows in scopes absent
from staging are never touched, so closed periods survive once they leave the
source window. The same rule is applied upstream in the Fabric silver table, so
final and silver stay identical without ever being compared.

Only allowlisted tables may be merged. The scope columns are the caller's
choice (comma-separated), but each must exist on the target table and be NOT
NULL, and the dynamic SQL uses only those verified, QUOTENAME'd column names.
Empty staging tables are rejected so an upstream load failure cannot silently
no-op. Final/staging schemas must match exactly, as for the swap proc.
</remarks>
*/
CREATE PROCEDURE [dbo].[usp_MergeStagingByScope]
    @TableName SYSNAME,
    @ScopeColumns NVARCHAR(400)
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
        (N'PPMProjectCosts');

    IF NOT EXISTS
    (
        SELECT 1
        FROM @AllowedTables
        WHERE [TableName] = @TableName
    )
    BEGIN
        THROW 52000, 'The requested table is not allowlisted for scoped merges.', 1;
    END;

    -- Normalize the caller's list: trim spaces, drop empty entries.
    SET @ScopeColumns = REPLACE(@ScopeColumns, N' ', N'');

    IF @ScopeColumns IS NULL OR @ScopeColumns = N'' OR @ScopeColumns LIKE N'%,,%'
        OR @ScopeColumns LIKE N',%' OR @ScopeColumns LIKE N'%,'
    BEGIN
        THROW 52007, 'At least one scope column is required (comma-separated, no empty entries).', 1;
    END;

    DECLARE @SchemaName SYSNAME = N'dbo';
    DECLARE @StagingTableName SYSNAME = @TableName + N'_Staging';
    DECLARE @TargetTable NVARCHAR(517) = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName);
    DECLARE @StagingTable NVARCHAR(517) = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@StagingTableName);
    DECLARE @TargetObjectId INT = OBJECT_ID(@TargetTable, N'U');
    DECLARE @StagingObjectId INT = OBJECT_ID(@StagingTable, N'U');
    DECLARE @ColumnList NVARCHAR(MAX);
    DECLARE @ScopeList NVARCHAR(MAX);      -- [c1], [c2]
    DECLARE @JoinPredicate NVARCHAR(MAX);  -- s.[c1] = t.[c1] AND s.[c2] = t.[c2]
    DECLARE @Sql NVARCHAR(MAX);
    DECLARE @StagingRowCount BIGINT;
    DECLARE @ScopeCount BIGINT;
    DECLARE @DeletedRows BIGINT;
    DECLARE @InsertedRows BIGINT;
    DECLARE @LockResult INT;
    DECLARE @LockResource NVARCHAR(255) = N'usp_MergeStagingByScope:' + @TargetTable;

    IF @TargetObjectId IS NULL OR @StagingObjectId IS NULL
    BEGIN
        THROW 52001, 'The target table or staging table does not exist.', 1;
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
        THROW 52002, 'The target table and staging table schemas are not compatible.', 1;
    END;

    -- Scope columns must exist on the target and be NOT NULL (a NULL scope value
    -- would never match and its rows could never be replaced). This is also the
    -- injection guard: only names found in sys.columns reach the dynamic SQL,
    -- and they are QUOTENAME'd below.
    IF EXISTS
    (
        SELECT 1
        FROM STRING_SPLIT(@ScopeColumns, N',') AS sc
        LEFT JOIN sys.columns AS c
            ON c.[object_id] = @TargetObjectId
           AND c.[name] = sc.[value]
        WHERE c.[name] IS NULL
           OR c.[is_nullable] = 1
    )
    BEGIN
        THROW 52003, 'Every scope column must exist on the target table and be NOT NULL.', 1;
    END;

    SELECT @ColumnList =
        STRING_AGG(CAST(QUOTENAME([name]) AS NVARCHAR(MAX)), N', ')
            WITHIN GROUP (ORDER BY [column_id])
    FROM sys.columns
    WHERE [object_id] = @TargetObjectId;

    SELECT
        @ScopeList = STRING_AGG(CAST(QUOTENAME(sc.[value]) AS NVARCHAR(MAX)), N', '),
        @JoinPredicate = STRING_AGG(
            CAST(N's.' + QUOTENAME(sc.[value]) + N' = t.' + QUOTENAME(sc.[value]) AS NVARCHAR(MAX)),
            N' AND ')
    FROM STRING_SPLIT(@ScopeColumns, N',') AS sc;

    IF @ColumnList IS NULL OR @ScopeList IS NULL
    BEGIN
        THROW 52004, 'The target table does not have any insertable columns or scope columns.', 1;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Serialize merges by table so two pipeline runs cannot interleave replacements.
        EXEC @LockResult = sys.sp_getapplock
            @Resource = @LockResource,
            @LockMode = N'Exclusive',
            @LockOwner = N'Transaction',
            @LockTimeout = 60000;

        IF @LockResult < 0
        BEGIN
            ROLLBACK TRANSACTION;
            THROW 52005, 'Could not acquire the scoped merge lock for the requested table.', 1;
        END;

        SET @Sql = N'SELECT @Rows = COUNT_BIG(*) FROM ' + @StagingTable + N';';

        EXEC sys.sp_executesql
            @Sql,
            N'@Rows BIGINT OUTPUT',
            @Rows = @StagingRowCount OUTPUT;

        IF @StagingRowCount = 0
        BEGIN
            ROLLBACK TRANSACTION;
            THROW 52006, 'The staging table is empty; target table was not changed.', 1;
        END;

        SET @Sql =
            N'SELECT @Scopes = COUNT_BIG(*) FROM (SELECT DISTINCT ' + @ScopeList
            + N' FROM ' + @StagingTable + N') AS s;';

        EXEC sys.sp_executesql
            @Sql,
            N'@Scopes BIGINT OUTPUT',
            @Scopes = @ScopeCount OUTPUT;

        SET @Sql =
            N'DELETE t
FROM ' + @TargetTable + N' AS t
JOIN (SELECT DISTINCT ' + @ScopeList + N' FROM ' + @StagingTable + N') AS s
  ON ' + @JoinPredicate + N';
SET @Deleted = @@ROWCOUNT;
INSERT INTO ' + @TargetTable + N' (' + @ColumnList + N')
SELECT ' + @ColumnList + N'
FROM ' + @StagingTable + N';
SET @Inserted = @@ROWCOUNT;';

        EXEC sys.sp_executesql
            @Sql,
            N'@Deleted BIGINT OUTPUT, @Inserted BIGINT OUTPUT',
            @Deleted = @DeletedRows OUTPUT,
            @Inserted = @InsertedRows OUTPUT;

        COMMIT TRANSACTION;

        SELECT
            @TableName AS [TableName],
            @ScopeColumns AS [ScopeColumns],
            @ScopeCount AS [ScopeCount],
            @DeletedRows AS [DeletedRowCount],
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
