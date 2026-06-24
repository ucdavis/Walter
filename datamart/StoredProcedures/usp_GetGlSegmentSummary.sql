-- Flexible GL summary for college/department financial reporting. Returns aggregate income,
-- expense, and net over dbo.GlSegmentMonthlyActuals, grouped by a caller-selected set of chart
-- string segments (@Dimensions) and constrained by optional per-segment, fiscal year, and period
-- filters. The financial department filter is hierarchy-aware: a code matches at whichever level
-- D-G it occupies. Dimension keys are resolved through a whitelist so only known column names
-- reach the dynamic SQL; filter values stay parameterized.
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

    -- Whitelist of group-by dimensions -> physical columns.
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
        ('NaturalAccount','NaturalAccount','NaturalAccountName',9);

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

    -- Optional filters (values remain parameterized)
    DECLARE @Where NVARCHAR(MAX) = N' WHERE 1 = 1';
    IF @FinancialDepartments IS NOT NULL
        SET @Where += N' AND (FinancialDeptDCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptECode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptFCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '',''))
                           OR FinancialDeptGCode IN (SELECT value FROM STRING_SPLIT(@p_Depts, '','')))';
    IF @Funds IS NOT NULL
        SET @Where += N' AND Fund IN (SELECT value FROM STRING_SPLIT(@p_Funds, '',''))';
    IF @Programs IS NOT NULL
        SET @Where += N' AND Program IN (SELECT value FROM STRING_SPLIT(@p_Programs, '',''))';
    IF @Activities IS NOT NULL
        SET @Where += N' AND Activity IN (SELECT value FROM STRING_SPLIT(@p_Activities, '',''))';
    IF @Projects IS NOT NULL
        SET @Where += N' AND Project IN (SELECT value FROM STRING_SPLIT(@p_Projects, '',''))';
    IF @NaturalAccounts IS NOT NULL
        SET @Where += N' AND NaturalAccount IN (SELECT value FROM STRING_SPLIT(@p_NaturalAccounts, '',''))';
    IF @FiscalYears IS NOT NULL
        SET @Where += N' AND FiscalYear IN (SELECT TRY_CAST(value AS SMALLINT) FROM STRING_SPLIT(@p_FiscalYears, '',''))';
    IF @Periods IS NOT NULL
        SET @Where += N' AND PeriodName IN (SELECT value FROM STRING_SPLIT(@p_Periods, '',''))';

    DECLARE @Sql NVARCHAR(MAX) =
        N'SELECT ' + @Cols + N',
                 SUM(IncomeAmount)  AS Income,
                 SUM(ExpenseAmount) AS Expense,
                 SUM(IncomeAmount) - SUM(ExpenseAmount) AS Net
          FROM dbo.GlSegmentMonthlyActuals' + @Where +
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
