-- Scoped picker options for the college/department financial summary report. Returns the distinct
-- value list for ONE requested facet (@Segment), scoped by the other supplied filters so the options
-- cascade and the full table is never scanned unbounded. The hierarchy-aware facets return a flattened
-- list across every level: FinancialDept flattens fact levels D-G; Fund/Activity/NaturalAccount flatten
-- the leaf plus the six ancestor levels (0=top rollup .. 5=nearest parent) sourced from the
-- dbo.Erp*Hierarchy dimension tables joined in the `src` CTE. Period rows carry a SortKey ('YYYY-MM') so
-- the client can order chronologically rather than by the 'Mon-YY' string. Segment keys are
-- whitelist-resolved (injection guard); filter values stay parameterized.
CREATE PROCEDURE dbo.usp_GetGlSegmentSummaryFilterOptions
    @Segment              VARCHAR(50),                -- required: which facet to populate
    @FinancialDepartments VARCHAR(MAX) = NULL,
    @Funds                VARCHAR(MAX) = NULL,
    @Programs             VARCHAR(MAX) = NULL,
    @Activities           VARCHAR(MAX) = NULL,
    @Projects             VARCHAR(MAX) = NULL,
    @NaturalAccounts      VARCHAR(MAX) = NULL,
    @FiscalYears          VARCHAR(MAX) = NULL,
    @Periods              VARCHAR(MAX) = NULL,
    @ApplicationName      NVARCHAR(128) = NULL,
    @ApplicationUser      NVARCHAR(256) = NULL,
    @EmulatingUser        NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT, @Duration_MS INT, @ErrorMsg NVARCHAR(MAX), @ParametersJSON NVARCHAR(MAX);

    -- Whitelisted facets. CodeCol/NameCol are only used for the single-column segment facets
    -- (Program, Project); the hierarchy facets resolve their columns in dedicated branches below.
    DECLARE @Allowed TABLE (Segment VARCHAR(50) PRIMARY KEY, CodeCol SYSNAME NULL, NameCol SYSNAME NULL);
    INSERT INTO @Allowed (Segment, CodeCol, NameCol) VALUES
        ('FinancialDept', NULL, NULL),
        ('Fund', NULL, NULL),
        ('Program','Program','ProgramName'),
        ('Activity', NULL, NULL),
        ('Project','Project','ProjectName'),
        ('NaturalAccount', NULL, NULL),
        ('FiscalYear', NULL, NULL),
        ('Period', NULL, NULL);

    IF NOT EXISTS (SELECT 1 FROM @Allowed WHERE Segment = @Segment)
    BEGIN RAISERROR('@Segment is required and must be a known facet key', 16, 1); RETURN; END;

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Shared scoping predicate (values parameterized). Excludes the facet being populated so it shows
    -- every value still reachable given the other selections. Dept/Fund/Activity/NaturalAccount are
    -- hierarchy-aware: a supplied code matches the leaf OR any ancestor level.
    DECLARE @Where NVARCHAR(MAX) = N' WHERE 1 = 1';
    IF @Segment <> 'FinancialDept' AND @FinancialDepartments IS NOT NULL
        SET @Where += N' AND (FinancialDeptDCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptECode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptFCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptGCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '','')))';
    IF @Segment <> 'Fund' AND @Funds IS NOT NULL
        SET @Where += N' AND (Fund IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '','')))';
    IF @Segment <> 'Program' AND @Programs IS NOT NULL
        SET @Where += N' AND Program IN (SELECT value FROM STRING_SPLIT(@p_Programs, '',''))';
    IF @Segment <> 'Activity' AND @Activities IS NOT NULL
        SET @Where += N' AND (Activity IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '','')))';
    IF @Segment <> 'Project' AND @Projects IS NOT NULL
        SET @Where += N' AND Project IN (SELECT value FROM STRING_SPLIT(@p_Projects, '',''))';
    IF @Segment <> 'NaturalAccount' AND @NaturalAccounts IS NOT NULL
        SET @Where += N' AND (NaturalAccount IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '','')))';
    IF @Segment <> 'FiscalYear' AND @FiscalYears IS NOT NULL
        SET @Where += N' AND FiscalYear IN (SELECT TRY_CAST(value AS SMALLINT) FROM STRING_SPLIT(@p_FiscalYears, '',''))';
    IF @Segment <> 'Period' AND @Periods IS NOT NULL
        SET @Where += N' AND PeriodName IN (SELECT value FROM STRING_SPLIT(@p_Periods, '',''))';

    -- Source CTE: fact rows joined to the chart-string hierarchy dimensions, ancestor levels surfaced
    -- as flat <Segment>ParentLevelN.. columns (same shape as usp_GetGlSegmentSummary).
    DECLARE @Src NVARCHAR(MAX) = N'
        WITH src AS (
            SELECT a.*,
                fh.ParentLevel0Code AS FundParentLevel0Code, fh.ParentLevel0Name AS FundParentLevel0Name,
                fh.ParentLevel1Code AS FundParentLevel1Code, fh.ParentLevel1Name AS FundParentLevel1Name,
                fh.ParentLevel2Code AS FundParentLevel2Code, fh.ParentLevel2Name AS FundParentLevel2Name,
                fh.ParentLevel3Code AS FundParentLevel3Code, fh.ParentLevel3Name AS FundParentLevel3Name,
                fh.ParentLevel4Code AS FundParentLevel4Code, fh.ParentLevel4Name AS FundParentLevel4Name,
                fh.ParentLevel5Code AS FundParentLevel5Code, fh.ParentLevel5Name AS FundParentLevel5Name,
                ah.ParentLevel0Code AS ActivityParentLevel0Code, ah.ParentLevel0Name AS ActivityParentLevel0Name,
                ah.ParentLevel1Code AS ActivityParentLevel1Code, ah.ParentLevel1Name AS ActivityParentLevel1Name,
                ah.ParentLevel2Code AS ActivityParentLevel2Code, ah.ParentLevel2Name AS ActivityParentLevel2Name,
                ah.ParentLevel3Code AS ActivityParentLevel3Code, ah.ParentLevel3Name AS ActivityParentLevel3Name,
                ah.ParentLevel4Code AS ActivityParentLevel4Code, ah.ParentLevel4Name AS ActivityParentLevel4Name,
                ah.ParentLevel5Code AS ActivityParentLevel5Code, ah.ParentLevel5Name AS ActivityParentLevel5Name,
                nah.ParentLevel0Code AS NaturalAccountParentLevel0Code, nah.ParentLevel0Name AS NaturalAccountParentLevel0Name,
                nah.ParentLevel1Code AS NaturalAccountParentLevel1Code, nah.ParentLevel1Name AS NaturalAccountParentLevel1Name,
                nah.ParentLevel2Code AS NaturalAccountParentLevel2Code, nah.ParentLevel2Name AS NaturalAccountParentLevel2Name,
                nah.ParentLevel3Code AS NaturalAccountParentLevel3Code, nah.ParentLevel3Name AS NaturalAccountParentLevel3Name,
                nah.ParentLevel4Code AS NaturalAccountParentLevel4Code, nah.ParentLevel4Name AS NaturalAccountParentLevel4Name,
                nah.ParentLevel5Code AS NaturalAccountParentLevel5Code, nah.ParentLevel5Name AS NaturalAccountParentLevel5Name
            FROM dbo.GlSegmentMonthlyActuals a
            LEFT JOIN dbo.ErpFundHierarchy     fh  ON a.Fund           = fh.Code
            LEFT JOIN dbo.ErpActivityHierarchy ah  ON a.Activity       = ah.Code
            LEFT JOIN dbo.ErpAccountHierarchy  nah ON a.NaturalAccount = nah.Code
        )';

    DECLARE @Sql NVARCHAR(MAX);

    IF @Segment = 'FinancialDept'
    BEGIN
        -- Flatten levels D-G into one searchable list; the user picks a value without choosing a level.
        SET @Sql = @Src + N'
            SELECT Code, Name, Level, CAST(NULL AS VARCHAR(7)) AS SortKey
            FROM (
                SELECT DISTINCT FinancialDeptDCode AS Code, FinancialDeptDName AS Name, ''D'' AS Level FROM src' + @Where + N'
                UNION SELECT DISTINCT FinancialDeptECode, FinancialDeptEName, ''E'' FROM src' + @Where + N'
                UNION SELECT DISTINCT FinancialDeptFCode, FinancialDeptFName, ''F'' FROM src' + @Where + N'
                UNION SELECT DISTINCT FinancialDeptGCode, FinancialDeptGName, ''G'' FROM src' + @Where + N'
            ) d
            WHERE d.Code IS NOT NULL AND d.Code <> ''''
            ORDER BY d.Level, d.Code;';
    END
    ELSE IF @Segment IN ('Fund', 'Activity', 'NaturalAccount')
    BEGIN
        -- Flatten the leaf plus the six ancestor levels into one hierarchy-aware list.
        DECLARE @LeafCode SYSNAME, @LeafName SYSNAME, @Pfx SYSNAME;
        SET @LeafCode = @Segment;                               -- fact leaf code column (Fund/Activity/NaturalAccount)
        SET @LeafName = @Segment + N'Name';                     -- fact leaf name column
        SET @Pfx      = @Segment + N'ParentLevel';              -- flattened ancestor column prefix
        SET @Sql = @Src + N'
            SELECT Code, Name, Level, CAST(NULL AS VARCHAR(7)) AS SortKey
            FROM (
                SELECT DISTINCT ' + QUOTENAME(@LeafCode) + N' AS Code, ' + QUOTENAME(@LeafName) + N' AS Name, ''Leaf'' AS Level FROM src' + @Where + N'
                UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'0Code') + N', ' + QUOTENAME(@Pfx + N'0Name') + N', ''0'' FROM src' + @Where + N'
                UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'1Code') + N', ' + QUOTENAME(@Pfx + N'1Name') + N', ''1'' FROM src' + @Where + N'
                UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'2Code') + N', ' + QUOTENAME(@Pfx + N'2Name') + N', ''2'' FROM src' + @Where + N'
                UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'3Code') + N', ' + QUOTENAME(@Pfx + N'3Name') + N', ''3'' FROM src' + @Where + N'
                UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'4Code') + N', ' + QUOTENAME(@Pfx + N'4Name') + N', ''4'' FROM src' + @Where + N'
                UNION SELECT DISTINCT ' + QUOTENAME(@Pfx + N'5Code') + N', ' + QUOTENAME(@Pfx + N'5Name') + N', ''5'' FROM src' + @Where + N'
            ) d
            WHERE d.Code IS NOT NULL AND d.Code <> ''''
            ORDER BY d.Level, d.Code;';
    END
    ELSE IF @Segment = 'FiscalYear'
    BEGIN
        SET @Sql = @Src + N'
            SELECT DISTINCT CAST(FiscalYear AS VARCHAR(20)) AS Code, CAST(FiscalYear AS NVARCHAR(MAX)) AS Name,
                            CAST(NULL AS VARCHAR(1)) AS Level, CAST(FiscalYear AS VARCHAR(7)) AS SortKey
            FROM src' + @Where + N' ORDER BY SortKey DESC;';
    END
    ELSE IF @Segment = 'Period'
    BEGIN
        -- SortKey = ''YYYY-MM'' parsed from ''Mon-YY'' so the client orders Apr-25 before May-26.
        SET @Sql = @Src + N'
            SELECT DISTINCT PeriodName AS Code, CAST(PeriodName AS NVARCHAR(MAX)) AS Name, CAST(NULL AS VARCHAR(1)) AS Level,
                            CONVERT(VARCHAR(7), TRY_CONVERT(date, ''01-'' + PeriodName, 6), 126) AS SortKey
            FROM src' + @Where + N' ORDER BY SortKey;';
    END
    ELSE
    BEGIN
        -- Single code/name segment facet (Program/Project): no hierarchy, leaf values only.
        DECLARE @CodeCol SYSNAME, @NameCol SYSNAME;
        SELECT @CodeCol = CodeCol, @NameCol = NameCol FROM @Allowed WHERE Segment = @Segment;
        SET @Sql = @Src + N'
            SELECT DISTINCT ' + QUOTENAME(@CodeCol) + N' AS Code, ' + QUOTENAME(@NameCol) + N' AS Name,
                            CAST(NULL AS VARCHAR(1)) AS Level, CAST(NULL AS VARCHAR(7)) AS SortKey
            FROM src' + @Where + N' ORDER BY Code;';
    END

    SET @ParametersJSON = (
        SELECT @Segment AS Segment, @FinancialDepartments AS FinancialDepartments, @Funds AS Funds,
               @Programs AS Programs, @Activities AS Activities, @Projects AS Projects,
               @NaturalAccounts AS NaturalAccounts, @FiscalYears AS FiscalYears, @Periods AS Periods,
               COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    BEGIN TRY
        EXEC sp_executesql @Sql,
            N'@p_Depts VARCHAR(MAX), @p_Funds VARCHAR(MAX), @p_Programs VARCHAR(MAX),
              @p_Activities VARCHAR(MAX), @p_Projects VARCHAR(MAX), @p_NaturalAccounts VARCHAR(MAX),
              @p_FiscalYears VARCHAR(MAX), @p_Periods VARCHAR(MAX)',
            @p_Depts = @FinancialDepartments, @p_Funds = @Funds, @p_Programs = @Programs,
            @p_Activities = @Activities, @p_Projects = @Projects, @p_NaturalAccounts = @NaturalAccounts,
            @p_FiscalYears = @FiscalYears, @p_Periods = @Periods;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGlSegmentSummaryFilterOptions',
            @Duration_MS = @Duration_MS, @RowCount = @RowCount, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGlSegmentSummaryFilterOptions',
            @Duration_MS = @Duration_MS, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 0, @ErrorMessage = @ErrorMsg;
        THROW;
    END CATCH
END;
GO
