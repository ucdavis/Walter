-- Flexible GL summary for college/department financial reporting. Returns aggregate income,
-- expense, and net over dbo.GlSegmentMonthlyActuals, grouped by a caller-selected set of chart
-- string segments (@Dimensions) and constrained by optional per-segment, fiscal year, and period
-- filters. The financial department, fund, activity, and natural-account filters are hierarchy-aware:
-- a code matches at whichever level it occupies (dept levels D-G are denormalized on the fact; the
-- fund/activity/account ancestor levels come from the dbo.Erp*Hierarchy dimension tables joined here
-- and surfaced as flat FundParentLevelN.. columns). Dimension keys are resolved through a whitelist so
-- only known column names reach the dynamic SQL; filter values stay parameterized.
CREATE PROCEDURE dbo.usp_GetGlSegmentSummary
    @Dimensions           VARCHAR(MAX),               -- required: CSV of segment keys
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

    -- Whitelist of group-by dimensions -> physical columns (bare names that exist in the `src` CTE
    -- below: fact columns plus the flattened Fund/Activity/NaturalAccount ancestor columns).
    -- Only known column names ever reach the dynamic SQL (injection guard).
    DECLARE @AllowedDims TABLE (DimKey VARCHAR(50) PRIMARY KEY, CodeCol SYSNAME, NameCol SYSNAME, SortOrder INT);
    INSERT INTO @AllowedDims (DimKey, CodeCol, NameCol, SortOrder) VALUES
        ('FinancialDeptD','FinancialDeptDCode','FinancialDeptDName',1),
        ('FinancialDeptE','FinancialDeptECode','FinancialDeptEName',2),
        ('FinancialDeptF','FinancialDeptFCode','FinancialDeptFName',3),
        ('FinancialDeptG','FinancialDeptGCode','FinancialDeptGName',4),
        ('Fund','Fund','FundName',5),
        ('Program','Program','ProgramName',6),
        ('Activity','Activity','ActivityName',7),
        ('Project','Project','ProjectName',8),
        ('NaturalAccount','NaturalAccount','NaturalAccountName',9),
        ('FundParentLevel0','FundParentLevel0Code','FundParentLevel0Name',10),
        ('FundParentLevel1','FundParentLevel1Code','FundParentLevel1Name',11),
        ('FundParentLevel2','FundParentLevel2Code','FundParentLevel2Name',12),
        ('FundParentLevel3','FundParentLevel3Code','FundParentLevel3Name',13),
        ('FundParentLevel4','FundParentLevel4Code','FundParentLevel4Name',14),
        ('FundParentLevel5','FundParentLevel5Code','FundParentLevel5Name',15),
        ('ActivityParentLevel0','ActivityParentLevel0Code','ActivityParentLevel0Name',16),
        ('ActivityParentLevel1','ActivityParentLevel1Code','ActivityParentLevel1Name',17),
        ('ActivityParentLevel2','ActivityParentLevel2Code','ActivityParentLevel2Name',18),
        ('ActivityParentLevel3','ActivityParentLevel3Code','ActivityParentLevel3Name',19),
        ('ActivityParentLevel4','ActivityParentLevel4Code','ActivityParentLevel4Name',20),
        ('ActivityParentLevel5','ActivityParentLevel5Code','ActivityParentLevel5Name',21),
        ('NaturalAccountParentLevel0','NaturalAccountParentLevel0Code','NaturalAccountParentLevel0Name',22),
        ('NaturalAccountParentLevel1','NaturalAccountParentLevel1Code','NaturalAccountParentLevel1Name',23),
        ('NaturalAccountParentLevel2','NaturalAccountParentLevel2Code','NaturalAccountParentLevel2Name',24),
        ('NaturalAccountParentLevel3','NaturalAccountParentLevel3Code','NaturalAccountParentLevel3Name',25),
        ('NaturalAccountParentLevel4','NaturalAccountParentLevel4Code','NaturalAccountParentLevel4Name',26),
        ('NaturalAccountParentLevel5','NaturalAccountParentLevel5Code','NaturalAccountParentLevel5Name',27),
        -- Time dimensions: single-column facets, so CodeCol = NameCol (the label collapses client-side).
        ('Period','PeriodName','PeriodName',28),
        ('FiscalYear','FiscalYear','FiscalYear',29);

    DECLARE @SelectedDims TABLE (CodeCol SYSNAME, NameCol SYSNAME, SortOrder INT);
    INSERT INTO @SelectedDims (CodeCol, NameCol, SortOrder)
    SELECT a.CodeCol, a.NameCol, a.SortOrder
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

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Grouped column list (safe: names sourced from the whitelist)
    DECLARE @Cols NVARCHAR(MAX);
    SELECT @Cols = STRING_AGG(CAST(QUOTENAME(CodeCol) + N', ' + QUOTENAME(NameCol) AS NVARCHAR(MAX)), N', ')
                   WITHIN GROUP (ORDER BY SortOrder)
    FROM @SelectedDims;

    -- Optional filters (values remain parameterized). Dept/Fund/Activity/NaturalAccount are
    -- hierarchy-aware: a supplied code matches the leaf OR any ancestor level.
    DECLARE @Where NVARCHAR(MAX) = N' WHERE 1 = 1';
    IF @FinancialDepartments IS NOT NULL
        SET @Where += N' AND (FinancialDeptDCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptECode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptFCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptGCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '','')))';
    IF @Funds IS NOT NULL
        SET @Where += N' AND (Fund IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))
                           OR FundParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@p_Funds, '','')))';
    IF @Programs IS NOT NULL
        SET @Where += N' AND Program IN (SELECT value FROM STRING_SPLIT(@p_Programs, '',''))';
    IF @Activities IS NOT NULL
        SET @Where += N' AND (Activity IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))
                           OR ActivityParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@p_Activities, '','')))';
    IF @Projects IS NOT NULL
        SET @Where += N' AND Project IN (SELECT value FROM STRING_SPLIT(@p_Projects, '',''))';
    IF @NaturalAccounts IS NOT NULL
        SET @Where += N' AND (NaturalAccount IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel0Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel1Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel2Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel3Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel4Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))
                           OR NaturalAccountParentLevel5Code IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '','')))';
    IF @FiscalYears IS NOT NULL
        SET @Where += N' AND FiscalYear IN (SELECT TRY_CAST(value AS SMALLINT) FROM STRING_SPLIT(@p_FiscalYears, '',''))';
    IF @Periods IS NOT NULL
        SET @Where += N' AND PeriodName IN (SELECT value FROM STRING_SPLIT(@p_Periods, '',''))';

    -- Source CTE: fact rows joined to the chart-string hierarchy dimensions, with each segment's
    -- ancestor levels surfaced as flat <Segment>ParentLevelN.. columns so the whitelist/QUOTENAME
    -- and filter logic operate on a single flat namespace.
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

    DECLARE @Sql NVARCHAR(MAX) = @Src + N'
        SELECT ' + @Cols + N',
                 SUM(IncomeAmount)  AS Income,
                 SUM(ExpenseAmount) AS Expense,
                 SUM(IncomeAmount) - SUM(ExpenseAmount) AS Net
          FROM src' + @Where +
        N' GROUP BY ' + @Cols + N' ORDER BY ' + @Cols + N';';

    SET @ParametersJSON = (
        SELECT @Dimensions AS Dimensions, @FinancialDepartments AS FinancialDepartments,
               @Funds AS Funds, @Programs AS Programs, @Activities AS Activities, @Projects AS Projects,
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
            @ProcedureName = 'dbo.usp_GetGlSegmentSummary',
            @Duration_MS = @Duration_MS, @RowCount = @RowCount, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGlSegmentSummary',
            @Duration_MS = @Duration_MS, @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName, @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser, @Success = 0, @ErrorMessage = @ErrorMsg;
        THROW;
    END CATCH
END;
GO
