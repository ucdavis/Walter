-- Scoped picker options for the college/department financial summary report. Returns the distinct
-- value list for ONE requested facet (@Segment), scoped by the other supplied filters so the options
-- cascade and the full table is never scanned unbounded. The FinancialDept facet returns the flattened
-- D-G department list (bounded, the cascading entry point); every other facet must be scoped by a
-- chosen department. Period rows carry a SortKey ('YYYY-MM') so the client can order chronologically
-- rather than by the 'Mon-YY' string. Segment keys are whitelist-resolved (injection guard); filter
-- values stay parameterized.
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

    -- Whitelisted facets. CodeCol/NameCol are only used for the single-column segment facets.
    DECLARE @Allowed TABLE (Segment VARCHAR(50) PRIMARY KEY, CodeCol SYSNAME NULL, NameCol SYSNAME NULL);
    INSERT INTO @Allowed (Segment, CodeCol, NameCol) VALUES
        ('FinancialDept', NULL, NULL),
        ('Fund','Fund','FundName'),
        ('Program','Program','ProgramName'),
        ('Activity','Activity','ActivityName'),
        ('Project','Project','ProjectName'),
        ('NaturalAccount','NaturalAccount','NaturalAccountName'),
        ('FiscalYear', NULL, NULL),
        ('Period', NULL, NULL);

    IF NOT EXISTS (SELECT 1 FROM @Allowed WHERE Segment = @Segment)
    BEGIN RAISERROR('@Segment is required and must be a known facet key', 16, 1); RETURN; END;

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Shared scoping predicate (values parameterized). Excludes the facet being populated so it shows
    -- every value still reachable given the other selections.
    DECLARE @Where NVARCHAR(MAX) = N' WHERE 1 = 1';
    IF @Segment <> 'FinancialDept' AND @FinancialDepartments IS NOT NULL
        SET @Where += N' AND (FinancialDeptDCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptECode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptFCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptGCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '','')))';
    IF @Segment <> 'Fund' AND @Funds IS NOT NULL
        SET @Where += N' AND Fund IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))';
    IF @Segment <> 'Program' AND @Programs IS NOT NULL
        SET @Where += N' AND Program IN (SELECT value FROM STRING_SPLIT(@p_Programs, '',''))';
    IF @Segment <> 'Activity' AND @Activities IS NOT NULL
        SET @Where += N' AND Activity IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))';
    IF @Segment <> 'Project' AND @Projects IS NOT NULL
        SET @Where += N' AND Project IN (SELECT value FROM STRING_SPLIT(@p_Projects, '',''))';
    IF @Segment <> 'NaturalAccount' AND @NaturalAccounts IS NOT NULL
        SET @Where += N' AND NaturalAccount IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))';
    IF @Segment <> 'FiscalYear' AND @FiscalYears IS NOT NULL
        SET @Where += N' AND FiscalYear IN (SELECT TRY_CAST(value AS SMALLINT) FROM STRING_SPLIT(@p_FiscalYears, '',''))';
    IF @Segment <> 'Period' AND @Periods IS NOT NULL
        SET @Where += N' AND PeriodName IN (SELECT value FROM STRING_SPLIT(@p_Periods, '',''))';

    DECLARE @Sql NVARCHAR(MAX);

    IF @Segment = 'FinancialDept'
    BEGIN
        -- Flatten levels D-G into one searchable list; the user picks a value without choosing a level.
        SET @Sql = N'
            SELECT Code, Name, Level, NULL AS SortKey
            FROM (
                SELECT DISTINCT FinancialDeptDCode AS Code, FinancialDeptDName AS Name, ''D'' AS Level FROM dbo.GlSegmentMonthlyActuals' + @Where + N'
                UNION SELECT DISTINCT FinancialDeptECode, FinancialDeptEName, ''E'' FROM dbo.GlSegmentMonthlyActuals' + @Where + N'
                UNION SELECT DISTINCT FinancialDeptFCode, FinancialDeptFName, ''F'' FROM dbo.GlSegmentMonthlyActuals' + @Where + N'
                UNION SELECT DISTINCT FinancialDeptGCode, FinancialDeptGName, ''G'' FROM dbo.GlSegmentMonthlyActuals' + @Where + N'
            ) d
            ORDER BY Level, Code;';
    END
    ELSE IF @Segment = 'FiscalYear'
    BEGIN
        SET @Sql = N'SELECT DISTINCT CAST(FiscalYear AS VARCHAR(20)) AS Code, CAST(FiscalYear AS NVARCHAR(MAX)) AS Name,
                            NULL AS Level, CAST(FiscalYear AS NVARCHAR(20)) AS SortKey
                     FROM dbo.GlSegmentMonthlyActuals' + @Where + N' ORDER BY SortKey DESC;';
    END
    ELSE IF @Segment = 'Period'
    BEGIN
        -- SortKey = 'YYYY-MM' parsed from 'Mon-YY' so the client orders Apr-25 before May-26.
        SET @Sql = N'SELECT DISTINCT PeriodName AS Code, CAST(PeriodName AS NVARCHAR(MAX)) AS Name, NULL AS Level,
                            CONVERT(VARCHAR(7), TRY_CONVERT(date, ''01-'' + PeriodName, 6), 126) AS SortKey
                     FROM dbo.GlSegmentMonthlyActuals' + @Where + N' ORDER BY SortKey;';
    END
    ELSE
    BEGIN
        -- Single code/name segment facet (Fund/Program/Activity/Project/NaturalAccount).
        DECLARE @CodeCol SYSNAME, @NameCol SYSNAME;
        SELECT @CodeCol = CodeCol, @NameCol = NameCol FROM @Allowed WHERE Segment = @Segment;
        SET @Sql = N'SELECT DISTINCT ' + QUOTENAME(@CodeCol) + N' AS Code, ' + QUOTENAME(@NameCol) + N' AS Name,
                            NULL AS Level, NULL AS SortKey
                     FROM dbo.GlSegmentMonthlyActuals' + @Where + N' ORDER BY Code;';
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
