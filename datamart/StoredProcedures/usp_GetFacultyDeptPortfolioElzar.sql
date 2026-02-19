-- Temporary sproc using CAES Elzar linked server until we can use the Aggie Enterprise data warehouse in usp_GetFacultyDeptPortfolio.
-- We should delete this sproc once we move to the DWH
CREATE PROCEDURE dbo.usp_GetFacultyDeptPortfolioElzar
    @ProjectIds VARCHAR(MAX) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: ProjectIds must be provided
    IF @ProjectIds IS NULL
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

    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @FilterClause NVARCHAR(MAX) = '';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Sanitize ApplicationName for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Parse and validate ProjectIds
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    SET @FilterClause = ' WHERE Project_Number IN (' + @ProjectIdFilter + ')';

    -- Add date overlap logic
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND Award_End_Date >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND Award_Start_Date <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            CONVERT(VARCHAR(10), @StartDate, 120) AS StartDate,
            CONVERT(VARCHAR(10), @EndDate, 120) AS EndDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Query linked server table
    BEGIN TRY
        SET @TSQLCommand =
            'SELECT Award_Number, Award_Start_Date, Award_End_Date,
                Project_Number, Project_Name,
                Project_Owning_Organization AS Project_Owning_Org,
                Project_Owning_Organization AS Expenditure_Category_Name,
                Project_Type, Project_Status,
                [Task/Subtask_Number] AS Task_Num, [Task/Subtask_Name] AS Task_Name, Task_Status,
                Project_Manager AS PM, Project_Administrator AS PA,
                Project_Principal_Investigator AS PI,
                [Project_Co-Principal_Investigator] AS COPI,
                Budget AS Cat_Budget, Expenses AS Cat_ITD_Exp,
                Commitments AS Cat_Commitments,
                [Budget_Balance_(Budget_' + NCHAR(8211) + N'_(Comm_&_Exp))] AS Cat_Bud_Bal,
                UCD_Fund AS Fund_Code, Task_Fund AS Fund_Desc,
                '''' AS Purpose_Code, Task_Purpose AS Purpose_Desc,
                Program AS Program_Code, Task_Program AS Program_Desc,
                Activity AS Activity_Code, Task_Activity AS Activity_Desc
            FROM CAES_ELZAR.AzureDW.dbo.FacultyAndDepartmentPortfolioReport'
            + @FilterClause;

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolioElzar',
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
            @ProcedureName = 'dbo.usp_GetFacultyDeptPortfolioElzar',
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