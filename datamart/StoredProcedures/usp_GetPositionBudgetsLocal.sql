-- Local-table version of dbo.usp_GetPositionBudgets.
-- Returns the same result set, but sources position-budget rows from the local
-- dbo.PositionBudgets table (populated by ETL via usp_SwapPositionBudgets) instead of
-- the Oracle OPENQUERY/EXEC...AT path. PROJECT_DESCRIPTION comes from the local
-- dbo.Projects table. No linked-server calls are made.
CREATE PROCEDURE dbo.usp_GetPositionBudgetsLocal
    @ProjectIds VARCHAR(MAX),
    @FiscalYear VARCHAR(4) = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);
    DECLARE @FiscalYearNum SMALLINT = NULL;
    DECLARE @ValidatedProjects TABLE (ProjectId VARCHAR(15));
    DECLARE @ProjectId VARCHAR(15);

    -- Sanitize ApplicationName / ApplicationUser for logging
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    BEGIN TRY
        -- Build parameters JSON first so input/validation failures are logged by the CATCH below
        SET @ParametersJSON = (
            SELECT
                @ProjectIds AS ProjectIds,
                @FiscalYear AS FiscalYear,
                COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- Validate: ProjectIds is required
        IF @ProjectIds IS NULL
            RAISERROR('@ProjectIds must be provided', 16, 1);

        -- Convert FiscalYear to SMALLINT to match the column type; only applied when supplied
        IF @FiscalYear IS NOT NULL AND LEN(LTRIM(RTRIM(@FiscalYear))) > 0
            SET @FiscalYearNum = CAST(@FiscalYear AS SMALLINT);

        -- Parse and validate ProjectIds (mirrors usp_ParseProjectIdFilter, but kept as a
        -- table for a static join -- no dynamic SQL is needed for the local query).
        -- DISTINCT so duplicate ids in @ProjectIds cannot multiply the joined budget rows.
        INSERT INTO @ValidatedProjects (ProjectId)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(@ProjectIds, ',')
        WHERE TRIM(value) <> '' AND LOWER(TRIM(value)) <> 'null';

        IF NOT EXISTS (SELECT 1 FROM @ValidatedProjects)
            RAISERROR('No valid project IDs provided', 16, 1);

        -- LOCAL cursor: auto-deallocated when the proc unwinds (incl. via THROW), so a
        -- mid-loop validation failure cannot leak it across calls.
        DECLARE ProjectCursor CURSOR LOCAL FOR
            SELECT ProjectId FROM @ValidatedProjects;
        OPEN ProjectCursor;
        FETCH NEXT FROM ProjectCursor INTO @ProjectId;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC dbo.usp_ValidateAggieEnterpriseProject @ProjectId;
            FETCH NEXT FROM ProjectCursor INTO @ProjectId;
        END;
        CLOSE ProjectCursor;
        DEALLOCATE ProjectCursor;

        SELECT
            pb.FiscalYear AS FISCAL_YEAR,
            pb.PositionNumber AS POSITION_NUMBER,
            pb.AccountCode AS ACCOUNT_CODE,
            pb.DistributionPercent AS DISTRIBUTION_PERCENT,
            pb.FundingEndDate AS FUNDING_END_DATE,
            pb.FundingEffectiveDate AS FUNDING_EFFECTIVE_DATE,
            pb.UcPercentPay AS UC_PERCENT_PAY,
            pb.NaturalAccount AS NATURAL_ACCOUNT,
            pb.FinancialDept AS FINANCIAL_DEPT,
            pb.ProjectId AS PROJECT_ID,
            p.Description AS PROJECT_DESCRIPTION,
            pb.Task AS TASK,
            pb.FundCode AS FUND_CODE,
            pb.ProgramCode AS PROGRAM_CODE,
            pb.Purpose AS PURPOSE,
            pb.Activity AS ACTIVITY,
            pb.Award AS AWARD,
            pb.JobEffectiveDate AS JOB_EFFECTIVE_DATE,
            pb.JobEffectiveSequence AS JOB_SEQUENCE,
            pb.EmployeeId AS EMPLOYEE_ID,
            -- MonthlyRate is stored as-loaded from PS_JOB_V and is inconsistent across comp
            -- frequencies:
            --   Hourly (H): already the 1.0 FTE monthly equivalent (hourly_rate * std_hours)
            --   All others (UC_FY, UC_9M, M, etc.): FTE-adjusted (actual pay, not 1.0 FTE rate)
            -- Normalize to 1.0 FTE so the client can compute actual salary as MONTHLY_RATE * FTE
            CASE
                WHEN pb.CompFrequency = 'H' THEN pb.MonthlyRate
                ELSE pb.MonthlyRate / NULLIF(pb.Fte, 0)
            END AS MONTHLY_RATE,
            pb.ExpectedEndDate AS JOB_END_DATE,
            pb.Fte AS FTE,
            pb.Name AS NAME,
            pb.PositionDescription AS POSITION_DESCRIPTION,
            pb.JobCode AS JOB_CODE,
            cbr.VacationAccrual AS VACATION_ACCRUAL,
            cbr.CBR AS COMPOSITE_BENEFIT_RATE
        FROM dbo.PositionBudgets pb
        JOIN @ValidatedProjects vp ON pb.ProjectId = vp.ProjectId
        LEFT JOIN dbo.Projects p ON pb.ProjectId = p.Code
        LEFT JOIN dbo.CompositeBenefitRates cbr ON pb.JobCode = cbr.JobCode
        WHERE (@FiscalYearNum IS NULL OR pb.FiscalYear = @FiscalYearNum)
        ORDER BY pb.PositionNumber;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetPositionBudgetsLocal',
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
            @ProcedureName = 'dbo.usp_GetPositionBudgetsLocal',
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
