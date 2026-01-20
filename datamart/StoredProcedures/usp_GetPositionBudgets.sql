CREATE PROCEDURE dbo.usp_GetPositionBudgets
    @FinancialDept VARCHAR(7) = NULL,
    @ProjectIds VARCHAR(MAX) = NULL,
    @ApplicationName NVARCHAR(128) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: exactly one filter must be provided
    IF (@FinancialDept IS NULL AND @ProjectIds IS NULL)
    BEGIN
        RAISERROR('Either @FinancialDept or @ProjectIds must be provided', 16, 1);
        RETURN;
    END;

    IF (@FinancialDept IS NOT NULL AND @ProjectIds IS NOT NULL)
    BEGIN
        RAISERROR('Cannot specify both @FinancialDept and @ProjectIds', 16, 1);
        RETURN;
    END;

    -- Validate FinancialDept if provided
    IF @FinancialDept IS NOT NULL
        EXEC dbo.usp_ValidateFinancialDept @FinancialDept;

    DECLARE @OracleQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @LinkedServerName SYSNAME = '[AIT_BISTG_PRD-CAES_HCMODS_APPUSER]';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Sanitize ApplicationName for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize FinancialDept for SQL injection protection
    IF @FinancialDept IS NOT NULL
        EXEC dbo.usp_SanitizeInputString @FinancialDept OUTPUT;

    -- Parse and validate ProjectIds if provided
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    IF @ProjectIds IS NOT NULL
        EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build Oracle query joining budget and position data
    SET @OracleQuery = '
        WITH LatestBudget AS (
            SELECT
                budget.FISCAL_YEAR,
                budget.POSITION_NBR,
                budget.ACCT_CD,
                budget.DIST_PCT,
                budget.FUNDING_END_DT,
                budget.UC_PERCENT_PAY,
                acct.ACCOUNT AS NATURAL_ACCOUNT,
                acct.DEPTID_CF,
                acct.PROJECT_ID,
                acct.PRODUCT AS TASK,
                acct.FUND_CODE,
                acct.PROGRAM_CODE,
                acct.CLASS_FLD AS PURPOSE,
                acct.CHARTFIELD1 AS ACTIVITY,
                acct.CHARTFIELD2 AS AWARD,
                DENSE_RANK() OVER(
                    PARTITION BY budget.POSITION_NBR
                    ORDER BY budget.EFFDT DESC, budget.EFFSEQ DESC
                ) AS rnk
            FROM caes_hcmods.PS_DEPT_BUDGET_ERN_V budget
            JOIN caes_hcmods.PS_ACCT_CD_TBL_V acct
                ON budget.ACCT_CD = acct.ACCT_CD
            WHERE budget.DML_IND != ''D''
              AND acct.DML_IND != ''D''
              ' + CASE
                    WHEN @FinancialDept IS NOT NULL
                    THEN 'AND acct.DEPTID_CF = ''' + @FinancialDept + ''''
                    ELSE 'AND acct.PROJECT_ID IN (' + @ProjectIdFilter + ')'
                END + '
        ),
        LatestPosition AS (
            SELECT
                POSITION_NBR,
                EFFDT,
                EFFSEQ,
                EMPLID,
                MONTHLY_RT,
                EXPECTED_END_DATE,
                FTE,
                TERMINATION_DT,
                DENSE_RANK() OVER(
                    PARTITION BY POSITION_NBR
                    ORDER BY EFFDT DESC, EFFSEQ DESC
                ) AS rnk
            FROM caes_hcmods.PS_JOB_V
            WHERE DML_IND != ''D''
              AND POSITION_NBR IN (SELECT DISTINCT POSITION_NBR FROM LatestBudget)
        ),
        LatestEmployee AS (
            SELECT
                EMPLID,
                NAME
            FROM caes_hcmods.UCD_PS_NAMES_V
            WHERE EMPLID IN (SELECT DISTINCT EMPLID FROM LatestPosition WHERE EMPLID IS NOT NULL)
        ),
        LatestPositionDesc AS (
            SELECT
                POSITION_NBR,
                DESCR,
                JOBCODE,
                ROW_NUMBER() OVER(
                    PARTITION BY POSITION_NBR
                    ORDER BY EFFDT DESC
                ) AS rnk
            FROM caes_hcmods.PS_POSITION_DATA_V
            WHERE DML_IND != ''D''
              AND POSITION_NBR IN (SELECT DISTINCT POSITION_NBR FROM LatestBudget)
        )
        SELECT
            b.FISCAL_YEAR,
            b.POSITION_NBR,
            b.ACCT_CD,
            b.DIST_PCT,
            b.FUNDING_END_DT,
            b.UC_PERCENT_PAY,
            b.NATURAL_ACCOUNT,
            b.DEPTID_CF AS FINANCIAL_DEPT,
            b.PROJECT_ID,
            b.TASK,
            b.FUND_CODE,
            b.PROGRAM_CODE,
            b.PURPOSE,
            b.ACTIVITY,
            b.AWARD,
            p.EFFDT AS POSITION_EFFDT,
            p.EFFSEQ AS POSITION_EFFSEQ,
            p.EMPLID,
            p.MONTHLY_RT,
            p.EXPECTED_END_DATE,
            p.FTE,
            p.TERMINATION_DT,
            e.NAME,
            pd.DESCR AS POSITION_DESCR,
            pd.JOBCODE
        FROM LatestBudget b
        LEFT JOIN LatestPosition p
            ON b.POSITION_NBR = p.POSITION_NBR
            AND p.rnk = 1
        LEFT JOIN LatestEmployee e
            ON p.EMPLID = e.EMPLID
        LEFT JOIN LatestPositionDesc pd
            ON b.POSITION_NBR = pd.POSITION_NBR
            AND pd.rnk = 1
        WHERE b.rnk = 1
        ORDER BY b.POSITION_NBR
    ';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @FinancialDept AS FinancialDept,
            @ProjectIds AS ProjectIds,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Execute via OPENQUERY and join with local CompositeBenefitRates table
    BEGIN TRY
        SET @TSQLCommand =
            'SELECT oq.*, cbr.VacationAccrual, cbr.CBR
             FROM OPENQUERY(' + @LinkedServerName + ', ''' + REPLACE(@OracleQuery, '''', '''''') + ''') oq
             LEFT JOIN dbo.CompositeBenefitRates cbr ON oq.JOBCODE = cbr.JobCode';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetPositionBudgets',
            @Duration_MS = @Duration_MS,
            @RowCount = @RowCount,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @Success = 1;
    END TRY
    BEGIN CATCH
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());
        SET @ErrorMsg = ERROR_MESSAGE();

        -- Log failed execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetPositionBudgets',
            @Duration_MS = @Duration_MS,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        -- Re-throw the error
        THROW;
    END CATCH
END;
GO