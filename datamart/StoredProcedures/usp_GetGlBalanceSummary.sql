-- Flexible balance summary for college/department financial reporting. Returns balance measures
-- (assets, liabilities, net position, revenue, expenses, ending balance) summed over
-- dbo.GlSummaryBalances for the required @PeriodName snapshot (the table holds one snapshot per
-- accounting period), grouped by a caller-selected set of chart string segments (@Dimensions,
-- child level only) and constrained by optional per-segment filters. The Dept, Fund, and Account
-- filters are hierarchy-aware: supplied codes are expanded to their whole subtree against the
-- dbo.Erp*Hierarchy dimension tables (a code matches directly or via any ancestor level), then the
-- fact rows are filtered by a plain leaf-code semi-join. Entity, Purpose, Program, Project, and
-- Activity filters match the leaf code exactly. Dimension keys are resolved through a whitelist so
-- only known column names reach the dynamic SQL; filter values stay parameterized. Every result
-- row also carries PeriodName, echoing the requested period for "balances as of <period>" display.
CREATE PROCEDURE dbo.usp_GetGlBalanceSummary
    @Dimensions           VARCHAR(MAX),               -- required: CSV of segment keys
    @Entities             VARCHAR(MAX) = NULL,
    @FinancialDepartments VARCHAR(MAX) = NULL,
    @Funds                VARCHAR(MAX) = NULL,
    @Accounts             VARCHAR(MAX) = NULL,
    @Purposes             VARCHAR(MAX) = NULL,
    @Programs             VARCHAR(MAX) = NULL,
    @Projects             VARCHAR(MAX) = NULL,
    @Activities           VARCHAR(MAX) = NULL,
    @PeriodName           VARCHAR(10),                -- required: accounting period, e.g. 'Jul-26'
    @ApplicationName      NVARCHAR(128) = NULL,
    @ApplicationUser      NVARCHAR(256) = NULL,
    @EmulatingUser        NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT, @Duration_MS INT, @ErrorMsg NVARCHAR(MAX), @ParametersJSON NVARCHAR(MAX);

    -- Whitelist of group-by dimensions -> physical fact columns (child/leaf level only; the
    -- hierarchies participate in filtering, never grouping). Only known column names ever reach
    -- the dynamic SQL (injection guard).
    DECLARE @AllowedDims TABLE (DimKey VARCHAR(50) PRIMARY KEY, CodeCol SYSNAME, DescCol SYSNAME, SortOrder INT);
    INSERT INTO @AllowedDims (DimKey, CodeCol, DescCol, SortOrder) VALUES
        ('Entity',   'Entity',   'EntityDesc',   1),
        ('Fund',     'Fund',     'FundDesc',     2),
        ('Dept',     'Dept',     'DeptDesc',     3),
        ('Account',  'Account',  'AccountDesc',  4),
        ('Purpose',  'Purpose',  'PurposeDesc',  5),
        ('Program',  'Program',  'ProgramDesc',  6),
        ('Project',  'Project',  'ProjectDesc',  7),
        ('Activity', 'Activity', 'ActivityDesc', 8);

    DECLARE @SelectedDims TABLE (CodeCol SYSNAME, DescCol SYSNAME, SortOrder INT);
    INSERT INTO @SelectedDims (CodeCol, DescCol, SortOrder)
    SELECT a.CodeCol, a.DescCol, a.SortOrder
    FROM (SELECT DISTINCT LTRIM(RTRIM(value)) AS DimKey
          FROM STRING_SPLIT(@Dimensions, ',')
          WHERE LTRIM(RTRIM(value)) <> '') t
    JOIN @AllowedDims a ON a.DimKey = t.DimKey;

    DECLARE @InputCount INT =
        (SELECT COUNT(DISTINCT LTRIM(RTRIM(value)))
         FROM STRING_SPLIT(@Dimensions, ',') WHERE LTRIM(RTRIM(value)) <> '');

    IF @InputCount = 0
    BEGIN RAISERROR('@Dimensions is required: supply at least one segment key', 16, 1); RETURN; END;
    IF @InputCount <> (SELECT COUNT(*) FROM @SelectedDims)
    BEGIN RAISERROR('@Dimensions contains one or more invalid segment keys', 16, 1); RETURN; END;

    IF @PeriodName IS NULL OR LTRIM(RTRIM(@PeriodName)) = ''
    BEGIN RAISERROR('@PeriodName is required', 16, 1); RETURN; END;

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Select/group column lists (safe: names sourced from the whitelist). Descriptions are
    -- functionally dependent on codes within a snapshot; MAX() tolerates source inconsistency
    -- without changing the grain.
    DECLARE @SelectCols NVARCHAR(MAX), @GroupCols NVARCHAR(MAX);
    SELECT @SelectCols = STRING_AGG(
               CAST(QUOTENAME(CodeCol) + N', MAX(' + QUOTENAME(DescCol) + N') AS ' + QUOTENAME(DescCol) AS NVARCHAR(MAX)),
               N', ') WITHIN GROUP (ORDER BY SortOrder),
           @GroupCols  = STRING_AGG(CAST(QUOTENAME(CodeCol) AS NVARCHAR(MAX)), N', ')
               WITHIN GROUP (ORDER BY SortOrder)
    FROM @SelectedDims;

    -- Hierarchy-aware filters (Dept/Fund/Account): expand each supplied code list to its
    -- subtree's leaf codes ONCE, into a typed #temp table the dynamic SQL semi-joins against.
    -- The direct STRING_SPLIT arm keeps codes that are absent from the hierarchy table matching
    -- their own fact rows. Inlining this expansion in the WHERE clause instead forced a
    -- varchar(max) UNION (STRING_SPLIT's output type) that re-scanned the hierarchy table per
    -- fact row.
    IF @FinancialDepartments IS NOT NULL
    BEGIN
        CREATE TABLE #DeptCodes (Code VARCHAR(20) NOT NULL PRIMARY KEY);
        INSERT INTO #DeptCodes (Code)
        SELECT CAST(value AS VARCHAR(20)) FROM STRING_SPLIT(@FinancialDepartments, ',')
        UNION
        SELECT Code FROM dbo.ErpFinDeptHierarchy
        WHERE ParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@FinancialDepartments, ','))
           OR ParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@FinancialDepartments, ','))
           OR ParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@FinancialDepartments, ','))
           OR ParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@FinancialDepartments, ','))
           OR ParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@FinancialDepartments, ','))
           OR ParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@FinancialDepartments, ','));
    END;
    IF @Funds IS NOT NULL
    BEGIN
        CREATE TABLE #FundCodes (Code VARCHAR(20) NOT NULL PRIMARY KEY);
        INSERT INTO #FundCodes (Code)
        SELECT CAST(value AS VARCHAR(20)) FROM STRING_SPLIT(@Funds, ',')
        UNION
        SELECT Code FROM dbo.ErpFundHierarchy
        WHERE ParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@Funds, ','))
           OR ParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@Funds, ','))
           OR ParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@Funds, ','))
           OR ParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@Funds, ','))
           OR ParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@Funds, ','))
           OR ParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@Funds, ','));
    END;
    IF @Accounts IS NOT NULL
    BEGIN
        CREATE TABLE #AccountCodes (Code VARCHAR(20) NOT NULL PRIMARY KEY);
        INSERT INTO #AccountCodes (Code)
        SELECT CAST(value AS VARCHAR(20)) FROM STRING_SPLIT(@Accounts, ',')
        UNION
        SELECT Code FROM dbo.ErpAccountHierarchy
        WHERE ParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@Accounts, ','))
           OR ParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@Accounts, ','))
           OR ParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@Accounts, ','))
           OR ParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@Accounts, ','))
           OR ParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@Accounts, ','))
           OR ParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@Accounts, ','));
    END;

    -- Optional filters (values remain parameterized; leaf-only segments stay STRING_SPLIT INs).
    DECLARE @Where NVARCHAR(MAX) = N' WHERE PeriodName = @p_Period';
    IF @Entities IS NOT NULL
        SET @Where += N' AND Entity IN (SELECT value FROM STRING_SPLIT(@p_Entities, '',''))';
    IF @FinancialDepartments IS NOT NULL
        SET @Where += N' AND Dept IN (SELECT Code FROM #DeptCodes)';
    IF @Funds IS NOT NULL
        SET @Where += N' AND Fund IN (SELECT Code FROM #FundCodes)';
    IF @Accounts IS NOT NULL
        SET @Where += N' AND Account IN (SELECT Code FROM #AccountCodes)';
    IF @Purposes IS NOT NULL
        SET @Where += N' AND Purpose IN (SELECT value FROM STRING_SPLIT(@p_Purposes, '',''))';
    IF @Programs IS NOT NULL
        SET @Where += N' AND Program IN (SELECT value FROM STRING_SPLIT(@p_Programs, '',''))';
    IF @Projects IS NOT NULL
        SET @Where += N' AND Project IN (SELECT value FROM STRING_SPLIT(@p_Projects, '',''))';
    IF @Activities IS NOT NULL
        SET @Where += N' AND Activity IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))';

    -- Credit-normal measures (liabilities, net position, revenue, ending balance) are stored with
    -- raw GL signs (credits negative); they are negated here so every measure reads naturally:
    -- positive = funds available, negative ending balance = overdraft. The hierarchy tables are
    -- only touched by the #temp expansions above; grouping is leaf-only, so the fact table needs
    -- no joins.
    DECLARE @Sql NVARCHAR(MAX) = N'
        SELECT ' + @SelectCols + N',
                 MAX(PeriodName)       AS PeriodName,
                 SUM(AssetAmt)         AS Assets,
                 SUM(-LiabAmt)         AS Liabilities,
                 SUM(-OwnersEquityAmt) AS NetPosition,
                 SUM(-RevenueAmt)      AS Revenue,
                 SUM(ExpenseAmt)       AS Expenses,
                 SUM(-EndBal)          AS EndingBalance
          FROM dbo.GlSummaryBalances' + @Where +
        N' GROUP BY ' + @GroupCols + N' ORDER BY ' + @GroupCols + N';';

    SET @ParametersJSON = (
        SELECT @Dimensions AS Dimensions, @Entities AS Entities,
               @FinancialDepartments AS FinancialDepartments,
               @Funds AS Funds, @Accounts AS Accounts, @Purposes AS Purposes,
               @Programs AS Programs, @Projects AS Projects, @Activities AS Activities,
               @PeriodName AS PeriodName,
               COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    BEGIN TRY
        EXEC sp_executesql @Sql,
            N'@p_Entities VARCHAR(MAX), @p_Purposes VARCHAR(MAX), @p_Programs VARCHAR(MAX),
              @p_Projects VARCHAR(MAX), @p_Activities VARCHAR(MAX),
              @p_Period VARCHAR(10)',
            @p_Entities = @Entities, @p_Purposes = @Purposes, @p_Programs = @Programs,
            @p_Projects = @Projects, @p_Activities = @Activities,
            @p_Period = @PeriodName;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGlBalanceSummary',
            @Duration_MS = @Duration_MS, @RowCount = @RowCount, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGlBalanceSummary',
            @Duration_MS = @Duration_MS, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 0, @ErrorMessage = @ErrorMsg;
        THROW;
    END CATCH
END;
GO
