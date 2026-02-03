CREATE PROCEDURE dbo.usp_GetPositionBudgets
    @FinancialDept VARCHAR(7) = NULL,
    @ProjectIds VARCHAR(MAX) = NULL,
    @FiscalYear VARCHAR(4) = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: exactly one filter must be
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
    DECLARE @RedshiftQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @LinkedServerName SYSNAME = '[AIT_BISTG_PRD-CAES_HCMODS_APPUSER]';
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Sanitize ApplicationName for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;

    -- Sanitize ApplicationUser for injection protection
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Sanitize FinancialDept for SQL injection protection
    IF @FinancialDept IS NOT NULL
        EXEC dbo.usp_SanitizeInputString @FinancialDept OUTPUT;

    -- Sanitize FiscalYear for SQL injection protection
    IF @FiscalYear IS NOT NULL
        EXEC dbo.usp_SanitizeInputString @FiscalYear OUTPUT;

    -- Parse and validate ProjectIds if provided
    DECLARE @ProjectIdFilter NVARCHAR(MAX);

    IF @ProjectIds IS NOT NULL
        EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    -- Build Oracle query joining budget and position data
    SET @OracleQuery = '
        WITH RankedBudget AS (
            SELECT
                budget.FISCAL_YEAR,
                budget.POSITION_NBR,
                budget.ACCT_CD,
                budget.DIST_PCT,
                budget.FUNDING_END_DT,
                budget.UC_PERCENT_PAY,
                budget.EFFDT AS FUNDING_EFFDT,
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
              AND acct.DML_IND != ''D''' +
              CASE
                    WHEN @FiscalYear IS NOT NULL
                    THEN ' AND budget.FISCAL_YEAR = ''' + @FiscalYear + ''''
                    ELSE ''
              END + '
        ),
        LatestBudget AS (
            SELECT * FROM RankedBudget
            WHERE rnk = 1
              ' + CASE
                    WHEN @FinancialDept IS NOT NULL
                    THEN 'AND DEPTID_CF = ''' + @FinancialDept + ''''
                    ELSE 'AND PROJECT_ID IN (' + @ProjectIdFilter + ')'
                END + '
        ),
        LatestPosition AS (
            SELECT
                POSITION_NBR,
                EFFDT,
                EFFSEQ,
                CASE WHEN EMPL_STATUS NOT IN (''T'', ''R'') THEN EMPLID END AS EMPLID,
                CASE WHEN EMPL_STATUS NOT IN (''T'', ''R'') THEN MONTHLY_RT END AS MONTHLY_RT,
                CASE WHEN EMPL_STATUS NOT IN (''T'', ''R'') THEN EXPECTED_END_DATE END AS EXPECTED_END_DATE,
                CASE WHEN EMPL_STATUS NOT IN (''T'', ''R'') THEN FTE END AS FTE,
                CASE WHEN EMPL_STATUS NOT IN (''T'', ''R'') THEN TERMINATION_DT END AS TERMINATION_DT,
                CASE WHEN EMPL_STATUS NOT IN (''T'', ''R'') THEN 1 ELSE 0 END AS IS_ACTIVE,
                DENSE_RANK() OVER(
                    PARTITION BY POSITION_NBR
                    ORDER BY EFFDT DESC, EFFSEQ DESC
                ) AS rnk
            FROM caes_hcmods.PS_JOB_V
            WHERE DML_IND != ''D''
              AND EFFDT <= TRUNC(SYSDATE)
              AND NOT (AUTO_END_FLG = ''Y'' AND EXPECTED_END_DATE < TRUNC(SYSDATE))
              AND POSITION_NBR IN (SELECT DISTINCT POSITION_NBR FROM LatestBudget)
        ),
        LatestEmployee AS (
            SELECT
                EMPLID,
                NAME
            FROM caes_hcmods.UCD_PS_NAMES_V
            WHERE EMPLID IN (
                SELECT DISTINCT EMPLID FROM LatestPosition
                WHERE EMPLID IS NOT NULL AND rnk = 1 AND IS_ACTIVE = 1
            )
        ),
        LatestPositionDesc AS (
            SELECT
                POSITION_NBR,
                DESCR,
                JOBCODE,
                EFF_STATUS,
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
            b.FUNDING_EFFDT,
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
            CASE WHEN p.IS_ACTIVE = 1 THEN e.NAME END AS NAME,
            pd.DESCR AS POSITION_DESCR,
            pd.JOBCODE
        FROM LatestBudget b
        LEFT JOIN LatestPosition p
            ON b.POSITION_NBR = p.POSITION_NBR
            AND p.rnk = 1
        LEFT JOIN LatestEmployee e
            ON p.EMPLID = e.EMPLID
        JOIN LatestPositionDesc pd
            ON b.POSITION_NBR = pd.POSITION_NBR
            AND pd.rnk = 1
            AND pd.EFF_STATUS = ''A''
        WHERE b.rnk = 1
        ORDER BY b.POSITION_NBR
    ';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @FinancialDept AS FinancialDept,
            @ProjectIds AS ProjectIds,
            @FiscalYear AS FiscalYear,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Execute via OPENQUERY, join with CompositeBenefitRates and Redshift project names
    BEGIN TRY
        -- Create temp table for Oracle results
        CREATE TABLE #PositionBudgets (
            FISCAL_YEAR VARCHAR(4),
            POSITION_NBR VARCHAR(8),
            ACCT_CD VARCHAR(25),
            DIST_PCT DECIMAL(6,3),
            FUNDING_END_DT DATE,
            FUNDING_EFFDT DATE,
            UC_PERCENT_PAY DECIMAL(6,3),
            NATURAL_ACCOUNT VARCHAR(6),
            FINANCIAL_DEPT VARCHAR(10),
            PROJECT_ID VARCHAR(15),
            TASK VARCHAR(10),
            FUND_CODE VARCHAR(5),
            PROGRAM_CODE VARCHAR(6),
            PURPOSE VARCHAR(6),
            ACTIVITY VARCHAR(6),
            AWARD VARCHAR(10),
            POSITION_EFFDT DATE,
            POSITION_EFFSEQ INT,
            EMPLID VARCHAR(11),
            MONTHLY_RT DECIMAL(18,6),
            EXPECTED_END_DATE DATE,
            FTE DECIMAL(7,6),
            TERMINATION_DT DATE,
            NAME VARCHAR(100),
            POSITION_DESCR VARCHAR(100),
            JOBCODE VARCHAR(6)
        );

        -- Insert Oracle data into temp table
        SET @TSQLCommand =
            'INSERT INTO #PositionBudgets
             SELECT oq.*
             FROM OPENQUERY(' + @LinkedServerName + ', ''' + REPLACE(@OracleQuery, '''', '''''') + ''') oq';

        EXEC sp_executesql @TSQLCommand;

        -- TODO: Replace this temp table approach with a local Projects table populated via ETL
        -- Create temp table for project names from Redshift
        CREATE TABLE #ProjectNames (
            CODE VARCHAR(15),
            DESCRIPTION VARCHAR(255)
        );

        -- Query Redshift for project names
        SET @RedshiftQuery = '
            SELECT code, description
            FROM ae_dwh.erp_project
        ';

        SET @TSQLCommand =
            'INSERT INTO #ProjectNames
             SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@RedshiftQuery, '''', '''''') + ''')';

        EXEC sp_executesql @TSQLCommand;

        -- Return final results joining all data sources
        SELECT
            pb.FISCAL_YEAR,
            pb.POSITION_NBR AS POSITION_NUMBER,
            pb.ACCT_CD AS ACCOUNT_CODE,
            pb.DIST_PCT AS DISTRIBUTION_PERCENT,
            pb.FUNDING_END_DT AS FUNDING_END_DATE,
            pb.FUNDING_EFFDT AS FUNDING_EFFECTIVE_DATE,
            pb.UC_PERCENT_PAY,
            pb.NATURAL_ACCOUNT,
            pb.FINANCIAL_DEPT,
            pb.PROJECT_ID,
            pn.DESCRIPTION AS PROJECT_DESCRIPTION,
            pb.TASK,
            pb.FUND_CODE,
            pb.PROGRAM_CODE,
            pb.PURPOSE,
            pb.ACTIVITY,
            pb.AWARD,
            pb.POSITION_EFFDT AS POSITION_EFFECTIVE_DATE,
            pb.POSITION_EFFSEQ AS POSITION_SEQUENCE,
            pb.EMPLID AS EMPLOYEE_ID,
            pb.MONTHLY_RT AS MONTHLY_RATE,
            pb.EXPECTED_END_DATE,
            pb.FTE,
            pb.TERMINATION_DT AS JOB_END_DATE,
            pb.NAME,
            pb.POSITION_DESCR AS POSITION_DESCRIPTION,
            pb.JOBCODE AS JOB_CODE,
            cbr.VacationAccrual AS VACATION_ACCRUAL,
            cbr.CBR AS COMPOSITE_BENEFIT_RATE
        FROM #PositionBudgets pb
        LEFT JOIN #ProjectNames pn ON pb.PROJECT_ID = pn.CODE
        LEFT JOIN dbo.CompositeBenefitRates cbr ON pb.JOBCODE = cbr.JobCode
        ORDER BY pb.POSITION_NBR;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Clean up temp tables
        DROP TABLE #PositionBudgets;
        DROP TABLE #ProjectNames;

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetPositionBudgets',
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

        -- Clean up temp tables if they exist
        IF OBJECT_ID('tempdb..#PositionBudgets') IS NOT NULL
            DROP TABLE #PositionBudgets;
        IF OBJECT_ID('tempdb..#ProjectNames') IS NOT NULL
            DROP TABLE #ProjectNames;

        -- Log failed execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetPositionBudgets',
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