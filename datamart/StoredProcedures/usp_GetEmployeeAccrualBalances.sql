CREATE PROCEDURE dbo.usp_GetEmployeeAccrualBalances
    @AsOfDates VARCHAR(MAX) = NULL,        -- Comma-separated dates (e.g., '2026-02-28,2026-03-14')
    @AsOfMinDate DATE = NULL,              -- Minimum as-of date (alternative to @AsOfDates)
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Fixed query scope
    DECLARE @BusinessUnit   NVARCHAR(20) = N'DVCMP';
    DECLARE @SchoolDivision NVARCHAR(20) = N'01';
    DECLARE @PinNumber      INT          = 260259;   -- Vacation
    DECLARE @TypeLabel      NVARCHAR(50) = N'Vacation';

    -- Exactly one date filter must be provided
    IF (@AsOfDates IS NULL AND @AsOfMinDate IS NULL)
       OR (@AsOfDates IS NOT NULL AND @AsOfMinDate IS NOT NULL)
    BEGIN
        RAISERROR('Provide exactly one of @AsOfDates or @AsOfMinDate', 16, 1);
        RETURN;
    END;

    -- Sanitize inputs
    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    -- Build Oracle date filter clause safely
    DECLARE @AsOfFilter NVARCHAR(MAX);

    IF @AsOfMinDate IS NOT NULL
    BEGIN
        SET @AsOfFilter = N'>= DATE ''' + CONVERT(VARCHAR(10), @AsOfMinDate, 120) + N'''';
    END
    ELSE
    BEGIN
        DECLARE @DateList NVARCHAR(MAX) = N'';
        DECLARE @DateValue VARCHAR(10);
        DECLARE @ParsedDate DATE;
        DECLARE @Pos INT;
        DECLARE @Input VARCHAR(MAX) = @AsOfDates;

        WHILE LEN(@Input) > 0
        BEGIN
            SET @Pos = CHARINDEX(',', @Input);
            IF @Pos = 0
            BEGIN
                SET @DateValue = LTRIM(RTRIM(@Input));
                SET @Input = '';
            END
            ELSE
            BEGIN
                SET @DateValue = LTRIM(RTRIM(LEFT(@Input, @Pos - 1)));
                SET @Input = SUBSTRING(@Input, @Pos + 1, LEN(@Input));
            END;

            BEGIN TRY
                SET @ParsedDate = CAST(@DateValue AS DATE);
            END TRY
            BEGIN CATCH
                RAISERROR('Invalid date in @AsOfDates: %s', 16, 1, @DateValue);
                RETURN;
            END CATCH;

            IF @DateList <> N''
                SET @DateList = @DateList + N', ';
            SET @DateList = @DateList + N'DATE ''' + CONVERT(VARCHAR(10), @ParsedDate, 120) + N'''';
        END;

        IF @DateList = N''
        BEGIN
            RAISERROR('@AsOfDates must contain at least one valid date', 16, 1);
            RETURN;
        END;

        SET @AsOfFilter = N'IN (' + @DateList + N')';
    END;

    DECLARE @OracleQuery      NVARCHAR(MAX) = N'';
    DECLARE @StartTime        DATETIME2 = SYSDATETIME();
    DECLARE @RowCount         INT;
    DECLARE @Duration_MS      INT;
    DECLARE @ErrorMsg         NVARCHAR(MAX);
    DECLARE @ParametersJSON   NVARCHAR(MAX);

    -- ============================================================
    -- Oracle Query: Employee, organization, and accrual balances
    -- ============================================================
    SET @OracleQuery = @OracleQuery + N'
WITH
busn_email AS (
    SELECT
        employee_id,
        email_address
    FROM (
        SELECT
            e.emplid AS employee_id,
            e.email_addr AS email_address,
            ROW_NUMBER() OVER (
                PARTITION BY e.emplid
                ORDER BY
                    CASE WHEN e.pref_email_flag = ''Y'' THEN 1 ELSE 2 END,
                    e.upd_bt_dtm DESC NULLS LAST,
                    e.email_addr
            ) AS rn
        FROM caes_hcmods.ps_email_addresses_v e
        WHERE e.dml_ind <> ''D''
          AND e.e_addr_type = ''BUSN''
          AND e.email_addr IS NOT NULL
    )
    WHERE rn = 1
),
empl_type AS (
    SELECT
        xlat_field_name,
        xlat_field_value,
        xlat_long_name,
        xlat_short_name
    FROM (
        SELECT
            x.fieldname AS xlat_field_name,
            x.fieldvalue AS xlat_field_value,
            x.xlatlongname AS xlat_long_name,
            x.xlatshortname AS xlat_short_name,
            ROW_NUMBER() OVER (
                PARTITION BY x.fieldname, x.fieldvalue
                ORDER BY x.effdt DESC
            ) AS rn
        FROM caes_hcmods.psxlatitem_v x
        WHERE x.fieldname = ''EMPL_TYPE''
          AND x.effdt <= SYSDATE
          AND x.eff_status = ''A''
          AND x.dml_ind <> ''D''
    )
    WHERE rn = 1
),';

    SET @OracleQuery = @OracleQuery + N'
job_current AS (
    SELECT DISTINCT
        j.emplid AS employee_id,
        j.empl_status AS employee_status,
        j.empl_class AS employee_class,
        j.empl_type AS employee_type,
        j.deptid AS department_id,
        j.hr_status AS hr_status,
        j.jobcode AS job_code,
        j.position_nbr AS position_number,
        j.reports_to AS reports_to,
        j.union_cd AS union_code,
        ud.descr AS union_description,
        ec.descr AS employee_class_description,
        jc.descr AS job_code_description,
        n.name AS employee_name,
        CASE
            WHEN j.comp_frequency = ''H'' THEN j.comprate
            WHEN NVL(j.fte, 0) = 0 THEN 0
            WHEN j.comp_frequency = ''UC_9M'' THEN (j.comprate / j.fte) / (2088 / 9)
            WHEN j.comp_frequency = ''UC_11'' THEN (j.comprate / j.fte) / (2088 / 11)
            ELSE (j.comprate / j.fte) / 174
        END AS hourly_rate_fte
    FROM caes_hcmods.ucd_dm_ps_job_current_v j
    JOIN caes_hcmods.ucd_dm_ps_empl_class_v ec
      ON j.empl_class = ec.empl_class
    JOIN caes_hcmods.ucd_dm_ps_jobcode_v jc
      ON j.jobcode = jc.jobcode
    JOIN caes_hcmods.ucd_ps_names_v n
      ON j.emplid = n.emplid
    LEFT JOIN caes_hcmods.ucd_dm_ps_union_v ud
      ON j.union_cd = ud.union_cd
    WHERE j.effdt <= SYSDATE
      AND j.business_unit = ''' + @BusinessUnit + N'''
      AND j.empl_status IN (''A'', ''L'', ''P'', ''W'')
),';

    SET @OracleQuery = @OracleQuery + N'
org AS (
    SELECT DISTINCT
        o.dept_cd AS department_code,
        o.dept_ttl AS department_ttl,
        o.sub_div_cd AS sub_division_code,
        o.sub_div_ttl AS sub_division_ttl,
        o.div_cd AS division_code,
        o.div_ttl AS division_ttl,
        o.org_cd AS organization_code,
        o.org_ttl AS organization_ttl,
        o.sub_div_l4_cd AS sub_division_l4_code,
        o.sub_div_l4_ttl AS sub_division_l4_ttl
    FROM caes_hcmods.ucd_organization_d_v o
    WHERE o.div_cd = ''' + @BusinessUnit + N'''
      AND o.sub_div_cd = ''' + @SchoolDivision + N'''
),
caes_employee_ids AS (
    SELECT DISTINCT
        j.employee_id
    FROM job_current j
    JOIN org o
      ON j.department_id = o.department_code
),
reports_to AS (
    SELECT DISTINCT
        j.emplid AS employee_id,
        j.empl_rcd AS employee_record,
        j.hr_status AS hr_status,
        j.effdt AS effective_date,
        j.effseq AS effective_seq,
        j.position_nbr AS position_number,
        j.reports_to AS reports_to,
        n.name AS name
    FROM caes_hcmods.ucd_dm_ps_job_current_v j
    JOIN caes_hcmods.ucd_ps_names_v n
      ON j.emplid = n.emplid
    WHERE j.effdt <= SYSDATE
      AND TRIM(j.position_nbr) IS NOT NULL
      AND j.hr_status = ''A''
),';

    SET @OracleQuery = @OracleQuery + N'
accrual AS (
    SELECT
        u.emplid AS employee_id,
        u.asofdate AS asofdate,
        TRUNC(CAST(u.asofdate AS DATE)) AS as_of_date,
        u.pin_num AS pin_number,
        SUM(u.uc_prev_bal) AS uc_prev_bal,
        SUM(u.uc_prd_taken) AS uc_prd_taken,
        SUM(u.uc_prd_accrual) AS uc_prd_accrual,
        SUM(u.uc_prd_adjusted) AS uc_prd_adjusted,
        SUM(u.uc_curr_bal) AS uc_curr_bal,
        SUM(u.uc_accr_limit) AS uc_accr_limit,
        u.uc_apr_max_ind AS uc_apr_max_ind,
        DECODE(u.uc_apr_max_ind, ''0'', ''N'', ''Y'') AS uc_apr_max_ind2,
        CASE
            WHEN SUM(u.uc_accr_limit) <= 0 THEN 0
            ELSE SUM(u.uc_accr_limit) - SUM(u.uc_curr_bal)
        END AS hours_over_policy_max,
        CASE
            WHEN SUM(u.uc_accr_limit) <> 0
                THEN TRUNC((SUM(u.uc_curr_bal) / NULLIF(SUM(u.uc_accr_limit), 0)) * 100, 2)
            ELSE 0
        END AS accrual_percentage,
        CASE
            WHEN SUM(u.uc_accr_limit) <= 384 THEN 1
            ELSE 0
        END AS exceptional_max_vacation_only
    FROM caes_hcmods.ps_uc_am_ss_tbl_v u
    JOIN caes_employee_ids ce
      ON ce.employee_id = u.emplid
    WHERE u.dml_ind <> ''D''
      AND u.pin_num = ' + CAST(@PinNumber AS NVARCHAR(20)) + N'
      AND TRUNC(CAST(u.asofdate AS DATE)) ' + @AsOfFilter + N'
    GROUP BY
        u.emplid,
        u.asofdate,
        u.pin_num,
        u.uc_apr_max_ind,
        DECODE(u.uc_apr_max_ind, ''0'', ''N'', ''Y''),
        TRUNC(CAST(u.asofdate AS DATE))
)';

    SET @OracleQuery = @OracleQuery + N'
SELECT
    j.employee_id AS "EmployeeId",
    a.as_of_date AS "AsOfDate",
    j.position_number AS "PositionNumber",
    j.employee_name AS "EmployeeName",
    ee.email_address AS "EmployeeEmail",
    j.union_code AS "UnionCode",
    j.union_description AS "UnionDescription",
    j.employee_class AS "EmployeeClassCode",
    j.employee_class_description AS "EmployeeClassDescription",
    j.job_code AS "JobCode",
    j.job_code_description AS "JobCodeDescription",
    j.reports_to AS "ReportsToPositionNumber",
    rt.employee_id AS "ReportsToEmployeeId",
    rt.name AS "ReportsToEmployeeName",
    j.hr_status AS "HrStatus",
    j.employee_status AS "EmployeeStatus",
    CASE
        WHEN j.employee_status = ''A'' THEN ''Active''
        WHEN j.employee_status = ''L'' THEN ''Unpaid Leave of Absence''
        WHEN j.employee_status = ''P'' THEN ''Paid Leave of Absence''
        WHEN j.employee_status = ''W'' THEN ''Short Work Break''
        ELSE ''Other''
    END AS "EmployeeStatusDescription",
    j.employee_type AS "EmployeeType",
    et.xlat_long_name AS "EmployeeTypeDescription",
    j.hourly_rate_fte AS "HourlyRateFTE",
    ''' + @TypeLabel + N''' AS "TypeLabel",
    SUM(a.uc_prev_bal) AS "PrevBal",
    SUM(a.uc_prd_taken) AS "HoursTaken",
    SUM(a.uc_prd_accrual) AS "AccrualHours",
    SUM(a.uc_prd_adjusted) AS "AdjustedHours",
    SUM(a.uc_curr_bal) AS "CalculatedBal",
    SUM(a.uc_accr_limit) AS "AccrualLimit",
    a.uc_apr_max_ind2 AS "ApproachingMax",
    SUM(a.hours_over_policy_max) AS "HoursOverUnderPolicyMax",
    SUM(a.accrual_percentage) AS "AccrualPercentage",
    MAX(a.exceptional_max_vacation_only) AS "ExceptionalMaxVacationOnly",
    o.organization_code AS "Level1Dept",
    o.organization_ttl AS "Level1DeptDesc",
    o.division_code AS "Level2Dept",
    o.division_ttl AS "Level2DeptDesc",
    o.sub_division_code AS "Level3Dept",
    o.sub_division_ttl AS "Level3DeptDesc",
    o.sub_division_l4_code AS "Level4Dept",
    o.sub_division_l4_ttl AS "Level4DeptDesc",
    o.department_code AS "Level5Dept",
    o.department_ttl AS "Level5DeptDesc"
FROM job_current j
JOIN org o
  ON j.department_id = o.department_code
LEFT JOIN reports_to rt
  ON j.reports_to = rt.position_number
JOIN accrual a
  ON j.employee_id = a.employee_id
JOIN empl_type et
  ON j.employee_type = et.xlat_field_value
LEFT JOIN busn_email ee
  ON j.employee_id = ee.employee_id
GROUP BY
    j.employee_id,
    a.as_of_date,
    j.position_number,
    j.employee_name,
    ee.email_address,
    j.union_code,
    j.union_description,
    j.employee_class,
    j.employee_class_description,
    j.job_code,
    j.job_code_description,
    j.reports_to,
    rt.employee_id,
    rt.name,
    j.hr_status,
    j.employee_status,
    j.employee_type,
    et.xlat_long_name,
    j.hourly_rate_fte,
    a.uc_apr_max_ind2,
    o.organization_code,
    o.organization_ttl,
    o.division_code,
    o.division_ttl,
    o.sub_division_code,
    o.sub_division_ttl,
    o.sub_division_l4_code,
    o.sub_division_l4_ttl,
    o.department_code,
    o.department_ttl';

    SET @ParametersJSON = (
        SELECT
            @AsOfDates AS AsOfDates,
            CONVERT(VARCHAR(10), @AsOfMinDate, 120) AS AsOfMinDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        CREATE TABLE #EmployeeAccrualBalances (
            EmployeeId                  NVARCHAR(11),
            AsOfDate                    DATE,
            PositionNumber              NVARCHAR(8),
            EmployeeName                NVARCHAR(100),
            EmployeeEmail               NVARCHAR(320),
            UnionCode                   NVARCHAR(3),
            UnionDescription            NVARCHAR(50),
            EmployeeClassCode           NVARCHAR(3),
            EmployeeClassDescription    NVARCHAR(50),
            JobCode                     NVARCHAR(6),
            JobCodeDescription          NVARCHAR(50),
            ReportsToPositionNumber     NVARCHAR(8),
            ReportsToEmployeeId         NVARCHAR(11),
            ReportsToEmployeeName       NVARCHAR(100),
            HrStatus                    NVARCHAR(1),
            EmployeeStatus              NVARCHAR(1),
            EmployeeStatusDescription   NVARCHAR(30),
            EmployeeType                NVARCHAR(1),
            EmployeeTypeDescription     NVARCHAR(50),
            HourlyRateFTE               DECIMAL(12, 4),
            TypeLabel                   NVARCHAR(50),
            PrevBal                     DECIMAL(10, 2),
            HoursTaken                  DECIMAL(10, 2),
            AccrualHours                DECIMAL(10, 2),
            AdjustedHours               DECIMAL(10, 2),
            CalculatedBal               DECIMAL(10, 2),
            AccrualLimit                DECIMAL(10, 2),
            ApproachingMax              NVARCHAR(1),
            HoursOverUnderPolicyMax     DECIMAL(10, 2),
            AccrualPercentage           DECIMAL(7, 2),
            ExceptionalMaxVacationOnly  INT,
            Level1Dept                  NVARCHAR(10),
            Level1DeptDesc              NVARCHAR(100),
            Level2Dept                  NVARCHAR(10),
            Level2DeptDesc              NVARCHAR(100),
            Level3Dept                  NVARCHAR(10),
            Level3DeptDesc              NVARCHAR(100),
            Level4Dept                  NVARCHAR(10),
            Level4DeptDesc              NVARCHAR(100),
            Level5Dept                  NVARCHAR(10),
            Level5DeptDesc              NVARCHAR(100)
        );

        -- The query exceeds OPENQUERY's 8000-character literal limit, so send it as an RPC parameter.
        INSERT INTO #EmployeeAccrualBalances
        EXEC (@OracleQuery) AT [AIT_BISTG_PRD-CAES_HCMODS_APPUSER];

        SELECT
            EmployeeId,
            AsOfDate,
            PositionNumber,
            EmployeeName,
            EmployeeEmail,
            UnionCode,
            UnionDescription,
            EmployeeClassCode,
            EmployeeClassDescription,
            JobCode,
            JobCodeDescription,
            ReportsToPositionNumber,
            ReportsToEmployeeId,
            ReportsToEmployeeName,
            HrStatus,
            EmployeeStatus,
            EmployeeStatusDescription,
            EmployeeType,
            EmployeeTypeDescription,
            HourlyRateFTE,
            TypeLabel,
            PrevBal,
            HoursTaken,
            AccrualHours,
            AdjustedHours,
            CalculatedBal,
            AccrualLimit,
            ApproachingMax,
            HoursOverUnderPolicyMax,
            AccrualPercentage,
            ExceptionalMaxVacationOnly,
            Level1Dept, Level1DeptDesc,
            Level2Dept, Level2DeptDesc,
            Level3Dept, Level3DeptDesc,
            Level4Dept, Level4DeptDesc,
            Level5Dept, Level5DeptDesc
        FROM #EmployeeAccrualBalances
        ORDER BY EmployeeId, AsOfDate, PositionNumber;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        DROP TABLE #EmployeeAccrualBalances;

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetEmployeeAccrualBalances',
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

        IF OBJECT_ID('tempdb..#EmployeeAccrualBalances') IS NOT NULL DROP TABLE #EmployeeAccrualBalances;

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetEmployeeAccrualBalances',
            @Duration_MS = @Duration_MS,
            @Parameters = @ParametersJSON,
            @ApplicationName = @ApplicationName,
            @ApplicationUser = @ApplicationUser,
            @EmulatingUser = @EmulatingUser,
            @Success = 0,
            @ErrorMessage = @ErrorMsg;

        THROW;
    END CATCH
END;
go
