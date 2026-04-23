CREATE PROCEDURE dbo.usp_GetGLPPMReconciliation
    @ProjectIds VARCHAR(MAX),
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
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

    -- Build Redshift query for GL data (transactional_listing_report is still remote)
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
        WHERE PROJECT IN (' + @ProjectIdFilter + ') AND PERIOD_NAME <> ''Jun-23'''
        + CASE WHEN @ExcludedDocNumbers IS NOT NULL
               THEN ' AND ACCOUNTING_SEQUENCE_NUMBER NOT IN (' + @ExcludedDocNumbers + ')'
               ELSE ''
          END + '
        GROUP BY FINANCIAL_DEPARTMENT, PROJECT, PROJECT_DESCRIPTION, FUND, FUND_DESCRIPTION, PROGRAM, PROGRAM_DESCRIPTION, ACTIVITY, ACTIVITY_DESCRIPTION';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        -- Fetch GL data from Redshift into temp table, then join with local FacultyDeptPortfolio
        SET @TSQLCommand = '
            SELECT * INTO #gl_summary FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@RedshiftQuery, '''', '''''') + ''');

            SELECT
                COALESCE(gl.FINANCIAL_DEPARTMENT, ppm.ProjectOwningOrgCode) AS FINANCIAL_DEPARTMENT,
                COALESCE(gl.PROJECT, ppm.ProjectNumber) AS PROJECT,
                COALESCE(gl.PROJECT_DESCRIPTION, ppm.ProjectName) AS PROJECT_DESCRIPTION,
                COALESCE(gl.FUND, ppm.FundCode) AS FUND_CODE,
                COALESCE(gl.FUND_DESCRIPTION, ppm.FundDesc) AS FUND_DESCRIPTION,
                COALESCE(ppm.FundCode, ''Not in PPM'') AS PPM_FUND_CODE,
                ppm.FundDesc AS PPM_FUND_DESCRIPTION,
                COALESCE(gl.PROGRAM, ppm.ProgramCode) AS PROGRAM_CODE,
                COALESCE(gl.PROGRAM_DESCRIPTION, ppm.ProgramDesc) AS PROGRAM_DESCRIPTION,
                COALESCE(gl.ACTIVITY, ppm.ActivityCode) AS ACTIVITY_CODE,
                COALESCE(gl.ACTIVITY_DESCRIPTION, ppm.ActivityDesc) AS ACTIVITY_DESCRIPTION,
                COALESCE(gl.GL_ACTUAL_AMOUNT, 0) AS GL_ACTUAL_AMOUNT,
                COALESCE(ppm.PPM_BUDGET, 0) AS PPM_BUDGET,
                COALESCE(ppm.PPM_ITD_EXP, 0) AS PPM_ITD_EXP,
                COALESCE(ppm.PPM_BUD_BAL, 0) AS PPM_BUD_BAL,
                COALESCE(gl.GL_ACTUAL_AMOUNT, 0) + (COALESCE(ppm.PPM_BUDGET, 0) - COALESCE(ppm.PPM_ITD_EXP, 0)) AS REMAINING_BALANCE,
                CASE
                    WHEN ppm.ProjectNumber IS NOT NULL THEN ''Both''
                    ELSE ''GL Only''
                END AS DATA_SOURCE
            FROM #gl_summary gl
            LEFT OUTER JOIN (
                SELECT
                    ProjectOwningOrgCode,
                    ProjectNumber,
                    MAX(ProjectName) AS ProjectName,
                    FundCode,
                    MAX(FundDesc) AS FundDesc,
                    ProgramCode,
                    MAX(ProgramDesc) AS ProgramDesc,
                    ActivityCode,
                    MAX(ActivityDesc) AS ActivityDesc,
                    SUM(PpmBudget) AS PPM_BUDGET,
                    SUM(PpmExpenses) AS PPM_ITD_EXP,
                    SUM(PpmBudget) - SUM(PpmExpenses) AS PPM_BUD_BAL
                FROM dbo.FacultyDeptPortfolio
                WHERE ProjectNumber IN (' + @ProjectIdFilter + ')
                GROUP BY ProjectOwningOrgCode, ProjectNumber, FundCode, ProgramCode, ActivityCode
            ) ppm ON gl.FINANCIAL_DEPARTMENT = ppm.ProjectOwningOrgCode
                AND gl.PROJECT = ppm.ProjectNumber
                AND gl.FUND = ppm.FundCode
                AND gl.PROGRAM = ppm.ProgramCode
                AND gl.ACTIVITY = ppm.ActivityCode
            ORDER BY PROJECT, FUND_CODE, PROGRAM_CODE, ACTIVITY_CODE';

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
            @EmulatingUser = @EmulatingUser,
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
            @EmulatingUser = @EmulatingUser,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO
