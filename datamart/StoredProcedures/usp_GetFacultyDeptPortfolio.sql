CREATE PROCEDURE dbo.usp_GetFacultyDeptPortfolio
    @ProjectIds VARCHAR(MAX),
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: ProjectIds must be provided
    IF @ProjectIds IS NULL OR LEN(LTRIM(RTRIM(@ProjectIds))) = 0
    BEGIN
        RAISERROR('@ProjectIds must be provided', 16, 1);
        RETURN;
    END;

    -- Validate date range if both are provided
    IF @StartDate IS NOT NULL AND @EndDate IS NOT NULL AND @EndDate < @StartDate
    BEGIN
        RAISERROR('EndDate must be greater than or equal to StartDate', 16, 1);
        RETURN;
    END;

    DECLARE @RedshiftQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);
    DECLARE @ExcludedDocNumbers NVARCHAR(MAX);
    DECLARE @DateFilterClause NVARCHAR(MAX) = '';

    -- Sanitize ApplicationName for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Parse and validate ProjectIds
    DECLARE @ProjectIdFilter NVARCHAR(MAX);
    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build comma-separated list of excluded document numbers. These are carryforward balances
    -- that should not be included when calculating GL totals.
    SELECT @ExcludedDocNumbers = STRING_AGG('''' + CAST(DocumentNumber AS VARCHAR(10)) + '''', ', ')
    FROM dbo.CarryforwardDocumentNumbers;

    -- Build date overlap filter for PPM CTE
    IF @StartDate IS NOT NULL
        SET @DateFilterClause = @DateFilterClause + ' AND award_end_date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @DateFilterClause = @DateFilterClause + ' AND award_start_date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build Redshift query with PPM and GL CTEs joined locally
    SET @RedshiftQuery = '
        WITH ppm_data AS (
            SELECT AWARD_NUMBER, AWARD_NAME, AWARD_TYPE, AWARD_ENTITY, AWARD_START_DATE, AWARD_END_DATE, AWARD_STATUS, AWD_PI_NAME,
            FUNDING_SOURCE, PROJECT_NUMBER, PROJECT_NAME, PROJECT_ENTITY, PRJ_OWNING_ORG AS PROJECT_OWNING_ORG,
            PROJECT_TYPE, PROJECT_STATUS_CODE AS PROJECT_STATUS, TASK_NUM, TASK_NAME, TASK_STATUS, PM, PA, PI, COPI, EXPENDITURE_CATEGORY_NAME,
            FUND_DESC, PURPOSE_DESC, PROGRAM_DESC, ACTIVITY_DESC, CAT_BUDGET, CAT_COMMITMENTS, CAT_ITD_EXP, CAT_BUD_BAL
            FROM ae_dwh.ucd_faculty_rpt_t
            WHERE PROJECT_NUMBER IN (' + @ProjectIdFilter + ')' + @DateFilterClause + '
        ),
        gl_totals AS (
            SELECT
                PROJECT,
                SUM(ACTUAL_AMOUNT + COMMITMENT_AMOUNT + OBLIGATION_AMOUNT) AS GL_TOTAL_AMOUNT
            FROM ae_dwh.transactional_listing_report
            WHERE PROJECT IN (' + @ProjectIdFilter + ')'
            + CASE WHEN @ExcludedDocNumbers IS NOT NULL
                   THEN ' AND ACCOUNTING_SEQUENCE_NUMBER NOT IN (' + @ExcludedDocNumbers + ')'
                   ELSE ''
              END + '
            GROUP BY PROJECT
        )
        SELECT
            ppm.AWARD_NUMBER, ppm.AWARD_NAME, ppm.AWARD_TYPE, ppm.AWARD_ENTITY,
            ppm.AWARD_START_DATE, ppm.AWARD_END_DATE, ppm.AWARD_STATUS, ppm.AWD_PI_NAME,
            ppm.FUNDING_SOURCE,
            COALESCE(ppm.PROJECT_NUMBER, gl.PROJECT) AS PROJECT_NUMBER,
            ppm.PROJECT_NAME, ppm.PROJECT_ENTITY, ppm.PROJECT_OWNING_ORG,
            ppm.PROJECT_TYPE, ppm.PROJECT_STATUS, ppm.TASK_NUM, ppm.TASK_NAME, ppm.TASK_STATUS,
            ppm.PM, ppm.PA, ppm.PI, ppm.COPI, ppm.EXPENDITURE_CATEGORY_NAME,
            ppm.FUND_DESC, ppm.PURPOSE_DESC, ppm.PROGRAM_DESC, ppm.ACTIVITY_DESC,
            ppm.CAT_BUDGET, ppm.CAT_COMMITMENTS, ppm.CAT_ITD_EXP, ppm.CAT_BUD_BAL,
            COALESCE(gl.GL_TOTAL_AMOUNT, 0) AS GL_TOTAL_AMOUNT
        FROM ppm_data ppm
        FULL OUTER JOIN gl_totals gl ON ppm.PROJECT_NUMBER = gl.PROJECT';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            CONVERT(VARCHAR(10), @StartDate, 120) AS StartDate,
            CONVERT(VARCHAR(10), @EndDate, 120) AS EndDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Execute via OPENQUERY
    BEGIN TRY
        SET @TSQLCommand =
            'SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@RedshiftQuery, '''', '''''') + ''')';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolio',
            @Duration_MS = @Duration_MS,
            @RowCount = @RowCount,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();

        -- Log failed execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolio',
            @Duration_MS = @Duration_MS,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO