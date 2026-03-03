-- Temporary sproc using CAES Elzar linked server for PPM data until we can use the Aggie Enterprise data warehouse in usp_GetGLPPMReconciliation.
-- We should delete this sproc once we move to the DWH
CREATE PROCEDURE dbo.usp_GetGLPPMReconciliationElzar
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

    -- Build Redshift GL query
    SET @RedshiftQuery = '
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
            SUM(ACTUAL_AMOUNT) AS GL_ACTUAL_AMOUNT
        FROM ae_dwh.transactional_listing_report
        WHERE PROJECT IN (' + @ProjectIdFilter + ')
          AND PROJECT NOT LIKE ''DKO%'''
          + CASE WHEN @ExcludedDocNumbers IS NOT NULL
               THEN ' AND ACCOUNTING_SEQUENCE_NUMBER NOT IN (' + @ExcludedDocNumbers + ')'
               ELSE ''
          END + '
        GROUP BY FINANCIAL_DEPARTMENT, PROJECT, PROJECT_DESCRIPTION, FUND, FUND_DESCRIPTION, PROGRAM, PROGRAM_DESCRIPTION, ACTIVITY, ACTIVITY_DESCRIPTION';

    -- Build T-SQL command: GL from Redshift, PPM from Elzar, then JOIN
    SET @TSQLCommand =
        'SELECT * INTO #gl_summary FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@RedshiftQuery, '''', '''''') + ''');

        SELECT
            Department AS PRJ_OWNING_CD,
            Project_Number AS PROJECT_NUMBER,
            Project_Name AS PROJECT_NAME,
            UCD_Fund AS FUND_CD,
            MAX(Task_Fund) AS FUND_DESC,
            Program AS PROGRAM_CD,
            MAX(Task_Program) AS PROGRAM_DESC,
            Activity AS ACTIVITY_CD,
            MAX(Task_Activity) AS ACTIVITY_DESC,
            SUM(Budget) AS PPM_BUDGET,
            SUM(Commitments) AS PPM_COMMITMENTS,
            SUM(Expenses) AS PPM_ITD_EXP
        INTO #ppm_summary
        FROM CAES_ELZAR.AzureDW.dbo.FacultyAndDepartmentPortfolioReport
        WHERE Project_Number IN (' + @ProjectIdFilter + ')
          AND Project_Number NOT LIKE ''DKO%''
        GROUP BY Department, Project_Number, Project_Name, UCD_Fund, Program, Activity;

        SELECT
            COALESCE(gl.FINANCIAL_DEPARTMENT, ppm.PRJ_OWNING_CD) AS FINANCIAL_DEPARTMENT,
            COALESCE(gl.PROJECT, ppm.PROJECT_NUMBER) AS PROJECT,
            COALESCE(gl.PROJECT_DESCRIPTION, ppm.PROJECT_NAME) AS PROJECT_DESCRIPTION,
            COALESCE(gl.FUND, ppm.FUND_CD) AS FUND_CODE,
            COALESCE(gl.FUND_DESCRIPTION, ppm.FUND_DESC) AS FUND_DESCRIPTION,
            COALESCE(ppm.FUND_CD, ''Not in PPM'') AS PPM_FUND_CODE,
            COALESCE(gl.PROGRAM, ppm.PROGRAM_CD) AS PROGRAM_CODE,
            COALESCE(gl.PROGRAM_DESCRIPTION, ppm.PROGRAM_DESC) AS PROGRAM_DESCRIPTION,
            COALESCE(gl.ACTIVITY, ppm.ACTIVITY_CD) AS ACTIVITY_CODE,
            COALESCE(gl.ACTIVITY_DESCRIPTION, ppm.ACTIVITY_DESC) AS ACTIVITY_DESCRIPTION,
            COALESCE(gl.GL_ACTUAL_AMOUNT, 0) AS GL_ACTUAL_AMOUNT,
            COALESCE(ppm.PPM_BUDGET, 0) AS PPM_BUDGET,
            COALESCE(ppm.PPM_COMMITMENTS, 0) AS PPM_COMMITMENTS,
            COALESCE(ppm.PPM_ITD_EXP, 0) AS PPM_ITD_EXP,
            COALESCE(ppm.PPM_BUDGET, 0) - COALESCE(ppm.PPM_ITD_EXP, 0) AS PPM_BUD_BAL,
            CASE
                WHEN ppm.PROJECT_NUMBER IS NOT NULL THEN ''Both''
                ELSE ''GL Only''
            END AS DATA_SOURCE
        FROM #gl_summary gl
        LEFT OUTER JOIN #ppm_summary ppm
            ON gl.FINANCIAL_DEPARTMENT = ppm.PRJ_OWNING_CD
            AND gl.PROJECT = ppm.PROJECT_NUMBER
            AND gl.FUND = ppm.FUND_CD
            AND gl.PROGRAM = ppm.PROGRAM_CD
            AND gl.ACTIVITY = ppm.ACTIVITY_CD
        ORDER BY PROJECT, FUND_CODE, PROGRAM_CODE, ACTIVITY_CODE;

        DROP TABLE #gl_summary;
        DROP TABLE #ppm_summary;';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Execute
    BEGIN TRY
        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGLPPMReconciliationElzar',
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
            @ProcedureName = 'dbo.usp_GetGLPPMReconciliationElzar',
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