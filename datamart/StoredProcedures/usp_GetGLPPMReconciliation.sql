CREATE PROCEDURE dbo.usp_GetGLPPMReconciliation
    @ProjectIds VARCHAR(MAX),
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate ProjectIds is provided
    IF @ProjectIds IS NULL OR LEN(LTRIM(RTRIM(@ProjectIds))) = 0
    BEGIN
        RAISERROR('@ProjectIds must be provided', 16, 1);
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

    -- Sanitize ApplicationName for injection protection (whitelist: alphanumeric + spaces only)
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Parse and validate ProjectIds
    DECLARE @ProjectIdFilter NVARCHAR(MAX);
    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build comma-separated list of excluded document numbers from local table
    SELECT @ExcludedDocNumbers = STRING_AGG('''' + CAST(DocumentNumber AS VARCHAR(10)) + '''', ', ')
    FROM dbo.CarryforwardDocumentNumbers;

    -- Build Redshift query
    SET @RedshiftQuery = '
        WITH gl_summary AS (
            SELECT
                FINANCIAL_DEPARTMENT,
                PROJECT,
                PROJECT_DESCRIPTION,
                FUND,
                FUND_DESCRIPTION,
                PROGRAM,
                PROGRAM_DESCRIPTION,
                ACTIVITY,
                ACTIVITY_DESCRIPTION,
                SUM(ACTUAL_AMOUNT) AS GL_ACTUAL_AMOUNT,
                SUM(COMMITMENT_AMOUNT) AS GL_COMMITMENT_AMOUNT,
                SUM(OBLIGATION_AMOUNT) AS GL_OBLIGATION_AMOUNT,
                SUM(ACTUAL_AMOUNT + COMMITMENT_AMOUNT + OBLIGATION_AMOUNT) AS GL_TOTAL_AMOUNT
            FROM ae_dwh.transactional_listing_report
            WHERE PROJECT IN (' + @ProjectIdFilter + ')'
            + CASE WHEN @ExcludedDocNumbers IS NOT NULL
                   THEN ' AND ACCOUNTING_SEQUENCE_NUMBER NOT IN (' + @ExcludedDocNumbers + ')'
                   ELSE ''
              END + '
            GROUP BY FINANCIAL_DEPARTMENT, PROJECT, PROJECT_DESCRIPTION, FUND, FUND_DESCRIPTION, PROGRAM, PROGRAM_DESCRIPTION, ACTIVITY, ACTIVITY_DESCRIPTION
        ),
        ppm_summary AS (
            SELECT
                PRJ_OWNING_CD,
                PROJECT_NUMBER,
                PROJECT_NAME,
                FUND_CD,
                MAX(FUND_DESC) AS FUND_DESC,
                PROGRAM_CD,
                MAX(PROGRAM_DESC) AS PROGRAM_DESC,
                ACTIVITY_CD,
                MAX(ACTIVITY_DESC) AS ACTIVITY_DESC,
                SUM(CAT_BUDGET) AS PPM_BUDGET,
                SUM(CAT_COMMITMENTS) AS PPM_COMMITMENTS,
                SUM(CAT_ITD_EXP) AS PPM_ITD_EXP,
                SUM(CAT_BUD_BAL) AS PPM_BUD_BAL
            FROM ae_dwh.ucd_faculty_rpt_t
            WHERE PROJECT_NUMBER IN (' + @ProjectIdFilter + ')
            GROUP BY PRJ_OWNING_CD, PROJECT_NUMBER, PROJECT_NAME, FUND_CD, PROGRAM_CD, ACTIVITY_CD
        )
        SELECT
            COALESCE(gl.FINANCIAL_DEPARTMENT, ppm.PRJ_OWNING_CD) AS FINANCIAL_DEPARTMENT,
            COALESCE(gl.PROJECT, ppm.PROJECT_NUMBER) AS PROJECT,
            COALESCE(gl.PROJECT_DESCRIPTION, ppm.PROJECT_NAME) AS PROJECT_DESCRIPTION,
            COALESCE(gl.FUND, ppm.FUND_CD) AS FUND_CODE,
            COALESCE(gl.FUND_DESCRIPTION, ppm.FUND_DESC) AS FUND_DESCRIPTION,
            COALESCE(gl.PROGRAM, ppm.PROGRAM_CD) AS PROGRAM_CODE,
            COALESCE(gl.PROGRAM_DESCRIPTION, ppm.PROGRAM_DESC) AS PROGRAM_DESCRIPTION,
            COALESCE(gl.ACTIVITY, ppm.ACTIVITY_CD) AS ACTIVITY_CODE,
            COALESCE(gl.ACTIVITY_DESCRIPTION, ppm.ACTIVITY_DESC) AS ACTIVITY_DESCRIPTION,
            COALESCE(gl.GL_ACTUAL_AMOUNT, 0) AS GL_ACTUAL_AMOUNT,
            COALESCE(gl.GL_COMMITMENT_AMOUNT, 0) AS GL_COMMITMENT_AMOUNT,
            COALESCE(gl.GL_OBLIGATION_AMOUNT, 0) AS GL_OBLIGATION_AMOUNT,
            COALESCE(gl.GL_TOTAL_AMOUNT, 0) AS GL_TOTAL_AMOUNT,
            COALESCE(ppm.PPM_BUDGET, 0) AS PPM_BUDGET,
            COALESCE(ppm.PPM_COMMITMENTS, 0) AS PPM_COMMITMENTS,
            COALESCE(ppm.PPM_ITD_EXP, 0) AS PPM_ITD_EXP,
            COALESCE(ppm.PPM_BUD_BAL, 0) AS PPM_BUD_BAL,
            COALESCE(ppm.PPM_BUD_BAL, 0) - COALESCE(gl.GL_TOTAL_AMOUNT, 0) AS REMAINING_BALANCE,
            CASE
                WHEN gl.PROJECT IS NOT NULL AND ppm.PROJECT_NUMBER IS NOT NULL THEN ''Both''
                WHEN gl.PROJECT IS NOT NULL THEN ''GL Only''
                WHEN ppm.PROJECT_NUMBER IS NOT NULL THEN ''PPM Only''
                ELSE ''Unknown''
            END AS DATA_SOURCE
        FROM gl_summary gl
        FULL OUTER JOIN ppm_summary ppm
            ON gl.FINANCIAL_DEPARTMENT = ppm.PRJ_OWNING_CD
            AND gl.PROJECT = ppm.PROJECT_NUMBER
            AND gl.FUND = ppm.FUND_CD
            AND gl.PROGRAM = ppm.PROGRAM_CD
            AND gl.ACTIVITY = ppm.ACTIVITY_CD
        ORDER BY PROJECT, FUND_CODE, PROGRAM_CODE, ACTIVITY_CODE';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
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
            @ProcedureName = 'dbo.usp_GetGLPPMReconciliation',
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
            @ProcedureName = 'dbo.usp_GetGLPPMReconciliation',
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