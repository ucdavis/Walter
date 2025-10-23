CREATE PROCEDURE dbo.usp_GetLaborLedgerData
    @Emplid VARCHAR(10) = NULL,
    @FinancialDept VARCHAR(10) = NULL,
    @Fund VARCHAR(10) = NULL,
    @NaturalAccount VARCHAR(10) = NULL,
    @ProjectId VARCHAR(15) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate: at least one of Emplid, FinancialDept, or ProjectId is required
    IF @Emplid IS NULL
       AND @FinancialDept IS NULL
       AND @ProjectId IS NULL
    BEGIN
        RAISERROR('At least one of Emplid, FinancialDept, or ProjectId is required', 16, 1);
        RETURN;
    END;

    -- Validate input formats to prevent SQL injection
    IF @Emplid IS NOT NULL AND (@Emplid LIKE '%[^0-9]%' OR LEN(@Emplid) > 10)
    BEGIN
        RAISERROR('Invalid Emplid format (10 digits max)', 16, 1);
        RETURN;
    END;

    IF @FinancialDept IS NOT NULL AND (@FinancialDept LIKE '%[^A-Z0-9-]%' OR @FinancialDept LIKE '%-%-%' OR LEN(@FinancialDept) > 10)
    BEGIN
        RAISERROR('Invalid Financial Dept format (alphanumeric with single hyphen allowed, 10 chars max)', 16, 1);
        RETURN;
    END;

    IF @Fund IS NOT NULL AND (@Fund LIKE '%[^A-Z0-9-]%' OR @Fund LIKE '%--%' OR LEN(@Fund) > 10)
    BEGIN
        RAISERROR('Invalid Fund format (alphanumeric with hyphens, 10 chars max)', 16, 1);
        RETURN;
    END;

    IF @NaturalAccount IS NOT NULL AND (@NaturalAccount LIKE '%[^A-Z0-9]%' OR LEN(@NaturalAccount) > 10)
    BEGIN
        RAISERROR('Invalid Natural Account format (alphanumeric, 10 chars max)', 16, 1);
        RETURN;
    END;

    IF @ProjectId IS NOT NULL AND (@ProjectId LIKE '%[^A-Z0-9_-]%' OR LEN(@ProjectId) > 15)
    BEGIN
        RAISERROR('Invalid Project ID format (alphanumeric with hyphen or underscore, 15 chars max)', 16, 1);
        RETURN;
    END;

    DECLARE @OracleQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @LinkedServerName SYSNAME = '[AIT_BISTG_PRD-CAESAPP_HCMODS_APPUSER]';
    DECLARE @FilterClause NVARCHAR(MAX) = '';
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Build filter clause for CTEs
    IF @Emplid IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND EMPLID = ''' + @Emplid + '''';

    IF @FinancialDept IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND DEPTID_CF = ''' + @FinancialDept + '''';

    IF @Fund IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND FUND_CODE = ''' + @Fund + '''';

    IF @NaturalAccount IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND ACCOUNT = ''' + @NaturalAccount + '''';

    IF @ProjectId IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND PROJECT_ID = ''' + @ProjectId + '''';

    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND PAY_END_DT >= TO_DATE(''' + CONVERT(VARCHAR(10), @StartDate, 120) + ''', ''YYYY-MM-DD'')';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND PAY_END_DT <= TO_DATE(''' + CONVERT(VARCHAR(10), @EndDate, 120) + ''', ''YYYY-MM-DD'')';

    -- Build Oracle query
    SET @OracleQuery = '
        WITH SalaryData AS (
            SELECT
                sal.EMPLID,
                sal.POSITION_NBR,
                sal.DEPTID_CF,
                sal.FUND_CODE,
                sal.ACCOUNT,
                sal.PROJECT_ID,
                sal.PAY_END_DT,
                sal.MONETARY_AMOUNT,
                ''SALARY'' AS SOURCE_TYPE
            FROM caes_hcmods.PS_UC_LL_SAL_DTL_V sal
            WHERE sal.DML_IND != ''D'' ' + @FilterClause + '
        ),
        FringeData AS (
            SELECT
                frg.EMPLID,
                frg.POSITION_NBR,
                frg.DEPTID_CF,
                frg.FUND_CODE,
                frg.ACCOUNT,
                frg.PROJECT_ID,
                frg.PAY_END_DT,
                frg.MONETARY_AMOUNT,
                ''FRINGE'' AS SOURCE_TYPE
            FROM caes_hcmods.PS_UC_LL_FRNG_DTL_V frg
            WHERE frg.DML_IND != ''D'' ' + @FilterClause + '
        ),
        AllPayrollData AS (
            SELECT * FROM SalaryData
            UNION ALL
            SELECT * FROM FringeData
        ),
        LatestPositionDesc AS (
            SELECT POSITION_NBR, DESCR,
                   ROW_NUMBER() OVER (PARTITION BY POSITION_NBR ORDER BY EFFDT DESC) AS RN
            FROM caes_hcmods.PS_POSITION_DATA_V
            WHERE DML_IND != ''D''
                AND POSITION_NBR IN (SELECT DISTINCT POSITION_NBR FROM AllPayrollData)
        )
        SELECT
            base.EMPLID,
            base.POSITION_NBR,
            pos.DESCR AS POSITION_DESCR,
            base.DEPTID_CF AS FINANCIAL_DEPT,
            base.FUND_CODE AS FUND,
            base.ACCOUNT AS NATURAL_ACCOUNT,
            base.PROJECT_ID,
            base.SOURCE_TYPE,
            base.PAY_END_DT AS PAY_DATE,
            TO_CHAR(base.PAY_END_DT, ''YYYY-MM'') AS PAY_MONTH,
            base.MONETARY_AMOUNT AS AMOUNT
        FROM AllPayrollData base
        LEFT JOIN LatestPositionDesc pos
            ON base.POSITION_NBR = pos.POSITION_NBR
            AND pos.RN = 1
        ORDER BY base.EMPLID, base.POSITION_NBR, base.PAY_END_DT
    ';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @Emplid AS Emplid,
            @FinancialDept AS FinancialDept,
            @Fund AS Fund,
            @NaturalAccount AS NaturalAccount,
            @ProjectId AS ProjectId,
            CONVERT(VARCHAR(10), @StartDate, 120) AS StartDate,
            CONVERT(VARCHAR(10), @EndDate, 120) AS EndDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Execute via OPENQUERY
    BEGIN TRY
        SET @TSQLCommand =
            'SELECT * FROM OPENQUERY(' + @LinkedServerName + ', ''' + REPLACE(@OracleQuery, '''', '''''') + ''')';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetLaborLedgerData',
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
            @ProcedureName = 'dbo.usp_GetLaborLedgerData',
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