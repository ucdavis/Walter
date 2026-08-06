-- Scoped picker options for the college/department financial summary report. Returns the distinct
-- value list for ONE requested facet (@Segment) over dbo.GlSummaryBalances, scoped by the other
-- supplied filters so the options cascade. The hierarchy-aware facets (Dept, Fund, Account) return a
-- flattened list across every level: the leaf plus the six ancestor levels (0 = top rollup ... 5 =
-- nearest parent) sourced from the dbo.Erp*Hierarchy dimension tables joined in the `src` CTE, so a
-- user can pick an ancestor code and filter to its whole subtree. Entity/Purpose/Program/Project/
-- Activity return leaf values only. Hierarchy-aware scoping filters expand supplied codes to their
-- subtree's leaf codes against the dimension tables, then filter the fact rows by leaf code; only
-- the hierarchy facet enumeration itself needs the `src` CTE's joins. Every facet except Period is scoped to the required @PeriodName snapshot; the
-- Period facet itself returns every loaded accounting period, newest first, so clients can default
-- to the current close. Segment keys are whitelist-resolved (injection guard); filter values stay
-- parameterized.
CREATE PROCEDURE dbo.usp_GetGlBalanceSummaryFilterOptions
    @Segment              VARCHAR(50),                -- required: which facet to populate
    @Entities             VARCHAR(MAX) = NULL,
    @FinancialDepartments VARCHAR(MAX) = NULL,
    @Funds                VARCHAR(MAX) = NULL,
    @Accounts             VARCHAR(MAX) = NULL,
    @Purposes             VARCHAR(MAX) = NULL,
    @Programs             VARCHAR(MAX) = NULL,
    @Projects             VARCHAR(MAX) = NULL,
    @Activities           VARCHAR(MAX) = NULL,
    @PeriodName           VARCHAR(10) = NULL,         -- required except for the Period facet, e.g. 'Jul-26'
    @ApplicationName      NVARCHAR(128) = NULL,
    @ApplicationUser      NVARCHAR(256) = NULL,
    @EmulatingUser        NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT, @Duration_MS INT, @ErrorMsg NVARCHAR(MAX), @ParametersJSON NVARCHAR(MAX);

    -- Whitelisted facets. CodeCol/DescCol are only used for the leaf-only segment facets
    -- (Purpose/Project/Activity); the hierarchy facets and Period resolve their columns in
    -- dedicated branches below.
    DECLARE @Allowed TABLE (Segment VARCHAR(50) PRIMARY KEY, CodeCol SYSNAME NULL, DescCol SYSNAME NULL);
    INSERT INTO @Allowed (Segment, CodeCol, DescCol) VALUES
        ('Entity', 'Entity', 'EntityDesc'),
        ('Dept', NULL, NULL),
        ('Fund', NULL, NULL),
        ('Account', NULL, NULL),
        ('Purpose', 'Purpose', 'PurposeDesc'),
        ('Program', 'Program', 'ProgramDesc'),
        ('Project', 'Project', 'ProjectDesc'),
        ('Activity', 'Activity', 'ActivityDesc'),
        ('Period', NULL, NULL);

    IF NOT EXISTS (SELECT 1 FROM @Allowed WHERE Segment = @Segment)
    BEGIN RAISERROR('@Segment is required and must be a known facet key', 16, 1); RETURN; END;

    IF @Segment <> 'Period' AND (@PeriodName IS NULL OR LTRIM(RTRIM(@PeriodName)) = '')
    BEGIN RAISERROR('@PeriodName is required for this segment', 16, 1); RETURN; END;

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Hierarchy-aware scoping filters (Dept/Fund/Account): expand each supplied code list to its
    -- subtree's leaf codes ONCE, into a typed #temp table the dynamic SQL semi-joins against
    -- (mirrors usp_GetGlBalanceSummary; inlining the expansion forced a varchar(max) UNION that
    -- re-scanned the hierarchy table per fact row). The expansion is skipped for the facet being
    -- populated, which is excluded from scoping so it shows every reachable value.
    IF @Segment <> 'Dept' AND @FinancialDepartments IS NOT NULL
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
    IF @Segment <> 'Fund' AND @Funds IS NOT NULL
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
    IF @Segment <> 'Account' AND @Accounts IS NOT NULL
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

    -- Shared scoping predicate (values parameterized; leaf-only segments stay STRING_SPLIT INs).
    -- Excludes the facet being populated so it shows every value still reachable given the other
    -- selections.
    DECLARE @Where NVARCHAR(MAX) = N' WHERE 1 = 1';
    IF @Segment <> 'Period'
        SET @Where += N' AND PeriodName = @p_Period';
    IF @Segment <> 'Entity' AND @Entities IS NOT NULL
        SET @Where += N' AND Entity IN (SELECT value FROM STRING_SPLIT(@p_Entities, '',''))';
    IF @Segment <> 'Dept' AND @FinancialDepartments IS NOT NULL
        SET @Where += N' AND Dept IN (SELECT Code FROM #DeptCodes)';
    IF @Segment <> 'Fund' AND @Funds IS NOT NULL
        SET @Where += N' AND Fund IN (SELECT Code FROM #FundCodes)';
    IF @Segment <> 'Account' AND @Accounts IS NOT NULL
        SET @Where += N' AND Account IN (SELECT Code FROM #AccountCodes)';
    IF @Segment <> 'Purpose' AND @Purposes IS NOT NULL
        SET @Where += N' AND Purpose IN (SELECT value FROM STRING_SPLIT(@p_Purposes, '',''))';
    IF @Segment <> 'Program' AND @Programs IS NOT NULL
        SET @Where += N' AND Program IN (SELECT value FROM STRING_SPLIT(@p_Programs, '',''))';
    IF @Segment <> 'Project' AND @Projects IS NOT NULL
        SET @Where += N' AND Project IN (SELECT value FROM STRING_SPLIT(@p_Projects, '',''))';
    IF @Segment <> 'Activity' AND @Activities IS NOT NULL
        SET @Where += N' AND Activity IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))';

    -- Source CTE for the hierarchy facets only: fact rows joined to the hierarchy dimensions,
    -- ancestor levels surfaced as flat <Segment>ParentLevelN.. code+name columns so the option
    -- lists can flatten every level. The other branches query the fact table directly.
    DECLARE @Src NVARCHAR(MAX) = N'
        WITH src AS (
            SELECT a.*,
                dh.ParentLevel0Code AS DeptParentLevel0Code, dh.ParentLevel0Name AS DeptParentLevel0Name,
                dh.ParentLevel1Code AS DeptParentLevel1Code, dh.ParentLevel1Name AS DeptParentLevel1Name,
                dh.ParentLevel2Code AS DeptParentLevel2Code, dh.ParentLevel2Name AS DeptParentLevel2Name,
                dh.ParentLevel3Code AS DeptParentLevel3Code, dh.ParentLevel3Name AS DeptParentLevel3Name,
                dh.ParentLevel4Code AS DeptParentLevel4Code, dh.ParentLevel4Name AS DeptParentLevel4Name,
                dh.ParentLevel5Code AS DeptParentLevel5Code, dh.ParentLevel5Name AS DeptParentLevel5Name,
                fh.ParentLevel0Code AS FundParentLevel0Code, fh.ParentLevel0Name AS FundParentLevel0Name,
                fh.ParentLevel1Code AS FundParentLevel1Code, fh.ParentLevel1Name AS FundParentLevel1Name,
                fh.ParentLevel2Code AS FundParentLevel2Code, fh.ParentLevel2Name AS FundParentLevel2Name,
                fh.ParentLevel3Code AS FundParentLevel3Code, fh.ParentLevel3Name AS FundParentLevel3Name,
                fh.ParentLevel4Code AS FundParentLevel4Code, fh.ParentLevel4Name AS FundParentLevel4Name,
                fh.ParentLevel5Code AS FundParentLevel5Code, fh.ParentLevel5Name AS FundParentLevel5Name,
                nah.ParentLevel0Code AS AccountParentLevel0Code, nah.ParentLevel0Name AS AccountParentLevel0Name,
                nah.ParentLevel1Code AS AccountParentLevel1Code, nah.ParentLevel1Name AS AccountParentLevel1Name,
                nah.ParentLevel2Code AS AccountParentLevel2Code, nah.ParentLevel2Name AS AccountParentLevel2Name,
                nah.ParentLevel3Code AS AccountParentLevel3Code, nah.ParentLevel3Name AS AccountParentLevel3Name,
                nah.ParentLevel4Code AS AccountParentLevel4Code, nah.ParentLevel4Name AS AccountParentLevel4Name,
                nah.ParentLevel5Code AS AccountParentLevel5Code, nah.ParentLevel5Name AS AccountParentLevel5Name
            FROM dbo.GlSummaryBalances a
            LEFT JOIN dbo.ErpFinDeptHierarchy dh  ON a.Dept    = dh.Code
            LEFT JOIN dbo.ErpFundHierarchy    fh  ON a.Fund    = fh.Code
            LEFT JOIN dbo.ErpAccountHierarchy nah ON a.Account = nah.Code
        )';

    DECLARE @Sql NVARCHAR(MAX);

    IF @Segment IN ('Dept', 'Fund', 'Account')
    BEGIN
        -- Flatten the leaf plus the six ancestor levels into one hierarchy-aware list.
        DECLARE @LeafCode SYSNAME, @LeafDesc SYSNAME, @Pfx SYSNAME;
        SET @LeafCode = @Segment;                               -- fact leaf code column (Dept/Fund/Account)
        SET @LeafDesc = @Segment + N'Desc';                     -- fact leaf description column
        SET @Pfx      = @Segment + N'ParentLevel';              -- flattened ancestor column prefix
        -- A code can surface more than once (as a leaf AND as another leaf's rollup, or at
        -- different rollup depths on different branches), so dedupe by code, preferring the
        -- leaf row. The filter itself is unaffected: a code always subtree-matches.
        SET @Sql = @Src + N'
            SELECT Code, Name, Level
            FROM (
                SELECT Code, Name, Level,
                       ROW_NUMBER() OVER (PARTITION BY Code
                           ORDER BY CASE WHEN Level = ''Leaf'' THEN 0 ELSE 1 END, Level) AS rn
                FROM (
                    SELECT DISTINCT ' + QUOTENAME(@LeafCode) + N' AS Code, ' + QUOTENAME(@LeafDesc) + N' AS Name, ''Leaf'' AS Level FROM src' + @Where + N'
                    UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'0Code') + N', ' + QUOTENAME(@Pfx + N'0Name') + N', ''0'' FROM src' + @Where + N'
                    UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'1Code') + N', ' + QUOTENAME(@Pfx + N'1Name') + N', ''1'' FROM src' + @Where + N'
                    UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'2Code') + N', ' + QUOTENAME(@Pfx + N'2Name') + N', ''2'' FROM src' + @Where + N'
                    UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'3Code') + N', ' + QUOTENAME(@Pfx + N'3Name') + N', ''3'' FROM src' + @Where + N'
                    UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'4Code') + N', ' + QUOTENAME(@Pfx + N'4Name') + N', ''4'' FROM src' + @Where + N'
                    UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'5Code') + N', ' + QUOTENAME(@Pfx + N'5Name') + N', ''5'' FROM src' + @Where + N'
                ) d
                WHERE d.Code IS NOT NULL AND d.Code <> ''''
            ) x
            WHERE x.rn = 1
            ORDER BY x.Level, x.Code;';
    END
    ELSE IF @Segment = 'Period'
    BEGIN
        -- Every loaded accounting period, newest first ('Mon-YY' sorted by real date, not text).
        SET @Sql = N'
            SELECT Code, Name, Level
            FROM (
                SELECT DISTINCT PeriodName AS Code, CAST(PeriodName AS NVARCHAR(MAX)) AS Name, CAST(NULL AS VARCHAR(4)) AS Level
                FROM dbo.GlSummaryBalances' + @Where + N'
            ) p
            ORDER BY TRY_CONVERT(date, ''01 '' + REPLACE(Code, ''-'', '' 20''), 106) DESC;';
    END
    ELSE
    BEGIN
        -- Leaf-only segment facet (Entity/Purpose/Program/Project/Activity): no hierarchy.
        DECLARE @CodeCol SYSNAME, @DescCol SYSNAME;
        SELECT @CodeCol = CodeCol, @DescCol = DescCol FROM @Allowed WHERE Segment = @Segment;
        SET @Sql = N'
            SELECT DISTINCT ' + QUOTENAME(@CodeCol) + N' AS Code, ' + QUOTENAME(@DescCol) + N' AS Name,
                            CAST(NULL AS VARCHAR(4)) AS Level
            FROM dbo.GlSummaryBalances' + @Where + N' ORDER BY Code;';
    END

    SET @ParametersJSON = (
        SELECT @Segment AS Segment, @Entities AS Entities,
               @FinancialDepartments AS FinancialDepartments, @Funds AS Funds,
               @Accounts AS Accounts, @Purposes AS Purposes, @Programs AS Programs,
               @Projects AS Projects, @Activities AS Activities, @PeriodName AS PeriodName,
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
            @ProcedureName = 'dbo.usp_GetGlBalanceSummaryFilterOptions',
            @Duration_MS = @Duration_MS, @RowCount = @RowCount, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGlBalanceSummaryFilterOptions',
            @Duration_MS = @Duration_MS, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 0, @ErrorMessage = @ErrorMsg;
        THROW;
    END CATCH
END;
GO
