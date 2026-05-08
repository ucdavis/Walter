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

    DECLARE @OracleEmployees  NVARCHAR(MAX);
    DECLARE @OracleAccruals   NVARCHAR(MAX);
    DECLARE @TSQLCommand      NVARCHAR(MAX);
    DECLARE @LinkedServerName SYSNAME = N'[AIT_BISTG_PRD-CAES_HCMODS_APPUSER]';
    DECLARE @StartTime        DATETIME2 = SYSDATETIME();
    DECLARE @RowCount         INT;
    DECLARE @Duration_MS      INT;
    DECLARE @ErrorMsg         NVARCHAR(MAX);
    DECLARE @ParametersJSON   NVARCHAR(MAX);

    -- ============================================================
    -- Oracle Query A: Accrual balances from ps_uc_am_ss_tbl_v
    -- ============================================================
    SET @OracleAccruals = N'
SELECT
  u.emplid AS "EmployeeId",
  TRUNC(CAST(u.asofdate AS DATE)) AS "AsOfDate",
  SUM(u.uc_prev_bal) AS "PrevBal",
  SUM(u.uc_prd_taken) AS "HoursTaken",
  SUM(u.uc_prd_accrual) AS "AccrualHours",
  SUM(u.uc_prd_adjusted) AS "AdjustedHours",
  SUM(u.uc_curr_bal) AS "CalculatedBal",
  SUM(u.uc_accr_limit) AS "AccrualLimit",
  DECODE(u.uc_apr_max_ind, ''0'', ''N'', ''Y'') AS "ApproachingMax",
  CASE WHEN SUM(u.uc_accr_limit) <= 0 THEN 0
       ELSE SUM(u.uc_accr_limit) - SUM(u.uc_curr_bal) END AS "HoursOverUnderPolicyMax",
  CASE WHEN SUM(u.uc_accr_limit) <> 0
       THEN TRUNC((SUM(u.uc_curr_bal) / NULLIF(SUM(u.uc_accr_limit), 0)) * 100, 2)
       ELSE 0 END AS "AccrualPercentage",
  CASE WHEN SUM(u.uc_accr_limit) <= 384 THEN 1 ELSE 0 END AS "ExceptionalMaxVacationOnly"
FROM caes_hcmods.ps_uc_am_ss_tbl_v u
WHERE u.dml_ind <> ''D''
  AND u.pin_num = ' + CAST(@PinNumber AS NVARCHAR(20)) + N'
  AND TRUNC(CAST(u.asofdate AS DATE)) ' + @AsOfFilter + N'
GROUP BY u.emplid, TRUNC(CAST(u.asofdate AS DATE)), u.uc_apr_max_ind';

    -- ============================================================
    -- Oracle Query B: Employee/position/org data
    -- Built from segments to stay under NVARCHAR literal limits
    -- ============================================================
    DECLARE @EmpCte_Dim  NVARCHAR(MAX);
    DECLARE @EmpCte_Pos  NVARCHAR(MAX);
    DECLARE @EmpCte_Job  NVARCHAR(MAX);
    DECLARE @EmpCte_Org  NVARCHAR(MAX);
    DECLARE @EmpSelect   NVARCHAR(MAX);

    SET @EmpCte_Dim = N'
WITH
empl_type AS (
  SELECT fieldvalue, xlatlongname FROM (
    SELECT x.*, ROW_NUMBER() OVER (PARTITION BY fieldname, fieldvalue ORDER BY effdt DESC) AS rn
    FROM caes_hcmods.psxlatitem_v x
    WHERE x.fieldname = ''EMPL_TYPE'' AND x.effdt <= SYSDATE AND x.eff_status = ''A'' AND x.dml_ind <> ''D''
  ) WHERE rn = 1
),
empl_class_dim AS (
  SELECT setid, empl_class, descr FROM (
    SELECT ec.*, ROW_NUMBER() OVER (PARTITION BY ec.setid, ec.empl_class ORDER BY ec.effdt DESC) AS rn
    FROM caes_hcmods.ps_empl_class_tbl_v ec
    WHERE ec.effdt <= SYSDATE AND ec.eff_status = ''A'' AND ec.dml_ind <> ''D''
  ) WHERE rn = 1
),
jobcode_dim AS (
  SELECT setid, jobcode, descr FROM (
    SELECT jc.*, ROW_NUMBER() OVER (PARTITION BY jc.setid, jc.jobcode ORDER BY jc.effdt DESC) AS rn
    FROM caes_hcmods.ps_jobcode_tbl_v jc
    WHERE jc.effdt <= SYSDATE AND jc.eff_status = ''A'' AND jc.dml_ind <> ''D''
  ) WHERE rn = 1
),
union_dim AS (
  SELECT union_cd, descr FROM (
    SELECT u.*, ROW_NUMBER() OVER (PARTITION BY u.union_cd ORDER BY u.effdt DESC) AS rn
    FROM caes_hcmods.ps_union_tbl_v u
    WHERE u.effdt <= SYSDATE AND u.eff_status = ''A'' AND u.dml_ind <> ''D''
  ) WHERE rn = 1
),';

    SET @EmpCte_Pos = N'
latest_position_data AS (
  SELECT position_nbr FROM (
    SELECT p.position_nbr,
      ROW_NUMBER() OVER (PARTITION BY p.position_nbr ORDER BY p.effdt DESC) AS rn,
      p.eff_status
    FROM caes_hcmods.ps_position_data_v p
    WHERE p.dml_ind <> ''D'' AND p.effdt <= TRUNC(SYSDATE)
  ) WHERE rn = 1 AND eff_status = ''A''
),
latest_position AS (
  SELECT position_nbr, emplid FROM (
    SELECT j.position_nbr,
      CASE WHEN j.empl_status NOT IN (''T'', ''R'') THEN j.emplid END AS emplid,
      CASE WHEN j.empl_status NOT IN (''T'', ''R'') THEN 1 ELSE 0 END AS is_active,
      DENSE_RANK() OVER (PARTITION BY j.position_nbr ORDER BY j.effdt DESC, j.effseq DESC) AS rnk
    FROM caes_hcmods.ps_job_v j
    WHERE j.dml_ind <> ''D'' AND j.effdt <= TRUNC(SYSDATE)
      AND NOT (j.auto_end_flg = ''Y'' AND j.expected_end_date < TRUNC(SYSDATE))
      AND TRIM(j.position_nbr) IS NOT NULL
  ) WHERE rnk = 1 AND is_active = 1 AND emplid IS NOT NULL
),';

    SET @EmpCte_Job = N'
job_curr AS (
  SELECT
    j.emplid AS employee_id, j.empl_status, j.empl_class, j.empl_type,
    j.deptid AS department_id, j.hr_status,
    j.jobcode AS job_code, j.position_nbr AS position_number,
    j.reports_to AS reports_to_position_number,
    j.union_cd AS union_code, ud.descr AS union_description,
    ecd.descr AS employee_class_description, jd.descr AS job_code_description,
    n.name AS employee_name
  FROM (
    SELECT j.*, ROW_NUMBER() OVER (PARTITION BY j.emplid, j.empl_rcd ORDER BY j.effdt DESC, j.effseq DESC) AS rn
    FROM caes_hcmods.ps_job_v j
    WHERE j.effdt <= SYSDATE AND j.dml_ind <> ''D''
      AND j.business_unit = ''' + @BusinessUnit + N'''
      AND j.empl_status IN (''A'', ''L'', ''P'', ''W'')
  ) j
  JOIN latest_position lp ON j.position_nbr = lp.position_nbr AND j.emplid = lp.emplid
  JOIN latest_position_data pd ON j.position_nbr = pd.position_nbr
  JOIN caes_hcmods.ucd_ps_names_v n ON j.emplid = n.emplid
  JOIN empl_class_dim ecd ON j.setid_empl_class = ecd.setid AND j.empl_class = ecd.empl_class
  JOIN jobcode_dim jd ON j.setid_jobcode = jd.setid AND j.jobcode = jd.jobcode
  LEFT JOIN union_dim ud ON j.union_cd = ud.union_cd
  WHERE j.rn = 1
),';

    SET @EmpCte_Org = N'
org AS (
  SELECT DISTINCT
    org_cd, org_ttl, div_cd, div_ttl, sub_div_cd, sub_div_ttl,
    sub_div_l4_cd, sub_div_l4_ttl, dept_cd, dept_ttl
  FROM caes_hcmods.ucd_organization_d_v
  WHERE div_cd = ''' + @BusinessUnit + N''' AND sub_div_cd = ''' + @SchoolDivision + N'''
),
reports_to AS (
  SELECT j.position_number, j.employee_id AS rt_emplid, n.name AS rt_name
  FROM job_curr j
  JOIN caes_hcmods.ucd_ps_names_v n ON j.employee_id = n.emplid
  WHERE j.hr_status = ''A'' AND TRIM(j.position_number) IS NOT NULL
)';

    SET @EmpSelect = N'
SELECT
  j.employee_id                 AS "EmployeeId",
  j.position_number             AS "PositionNumber",
  j.employee_name               AS "EmployeeName",
  j.union_code                  AS "UnionCode",
  j.union_description           AS "UnionDescription",
  j.empl_class                  AS "EmployeeClassCode",
  j.employee_class_description  AS "EmployeeClassDescription",
  j.job_code                    AS "JobCode",
  j.job_code_description        AS "JobCodeDescription",
  j.reports_to_position_number  AS "ReportsToPositionNumber",
  r.rt_emplid                   AS "ReportsToEmployeeId",
  r.rt_name                     AS "ReportsToEmployeeName",
  j.hr_status                   AS "HrStatus",
  j.empl_status                 AS "EmployeeStatus",
  CASE j.empl_status WHEN ''A'' THEN ''Active''
       WHEN ''L'' THEN ''Unpaid Leave of Absence''
       WHEN ''P'' THEN ''Paid Leave of Absence''
       WHEN ''W'' THEN ''Short Work Break'' ELSE ''Other'' END AS "EmployeeStatusDescription",
  j.empl_type                   AS "EmployeeType",
  et.xlatlongname               AS "EmployeeTypeDescription",
  o.org_cd                      AS "Level1Dept",
  o.org_ttl                     AS "Level1DeptDesc",
  o.div_cd                      AS "Level2Dept",
  o.div_ttl                     AS "Level2DeptDesc",
  o.sub_div_cd                  AS "Level3Dept",
  o.sub_div_ttl                 AS "Level3DeptDesc",
  o.sub_div_l4_cd               AS "Level4Dept",
  o.sub_div_l4_ttl              AS "Level4DeptDesc",
  o.dept_cd                     AS "Level5Dept",
  o.dept_ttl                    AS "Level5DeptDesc"
FROM job_curr j
JOIN org o ON j.department_id = o.dept_cd
LEFT JOIN reports_to r ON j.reports_to_position_number = r.position_number
JOIN empl_type et ON j.empl_type = et.fieldvalue';

    SET @OracleEmployees = @EmpCte_Dim + @EmpCte_Pos + @EmpCte_Job + @EmpCte_Org + @EmpSelect;

    SET @ParametersJSON = (
        SELECT
            @AsOfDates AS AsOfDates,
            CONVERT(VARCHAR(10), @AsOfMinDate, 120) AS AsOfMinDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        -- Temp tables
        CREATE TABLE #Employees (
            EmployeeId                  NVARCHAR(11),
            PositionNumber              NVARCHAR(8),
            EmployeeName                NVARCHAR(100),
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

        CREATE TABLE #Accruals (
            EmployeeId                  NVARCHAR(11),
            AsOfDate                    DATE,
            PrevBal                     DECIMAL(10, 2),
            HoursTaken                  DECIMAL(10, 2),
            AccrualHours                DECIMAL(10, 2),
            AdjustedHours               DECIMAL(10, 2),
            CalculatedBal               DECIMAL(10, 2),
            AccrualLimit                DECIMAL(10, 2),
            ApproachingMax              NVARCHAR(1),
            HoursOverUnderPolicyMax     DECIMAL(10, 2),
            AccrualPercentage           DECIMAL(7, 2),
            ExceptionalMaxVacationOnly  INT
        );

        -- Pull employee/position/org data
        SET @TSQLCommand =
            N'INSERT INTO #Employees SELECT * FROM OPENQUERY(' + @LinkedServerName + N', '''
            + REPLACE(@OracleEmployees, N'''', N'''''') + N''')';
        EXEC sp_executesql @TSQLCommand;

        -- Pull accrual balances
        SET @TSQLCommand =
            N'INSERT INTO #Accruals SELECT * FROM OPENQUERY(' + @LinkedServerName + N', '''
            + REPLACE(@OracleAccruals, N'''', N'''''') + N''')';
        EXEC sp_executesql @TSQLCommand;

        -- Join locally, return final result set
        SELECT
            e.EmployeeId,
            a.AsOfDate,
            e.PositionNumber,
            e.EmployeeName,
            e.UnionCode,
            e.UnionDescription,
            e.EmployeeClassCode,
            e.EmployeeClassDescription,
            e.JobCode,
            e.JobCodeDescription,
            e.ReportsToPositionNumber,
            e.ReportsToEmployeeId,
            e.ReportsToEmployeeName,
            e.HrStatus,
            e.EmployeeStatus,
            e.EmployeeStatusDescription,
            e.EmployeeType,
            e.EmployeeTypeDescription,
            @TypeLabel AS TypeLabel,
            a.PrevBal,
            a.HoursTaken,
            a.AccrualHours,
            a.AdjustedHours,
            a.CalculatedBal,
            a.AccrualLimit,
            a.ApproachingMax,
            a.HoursOverUnderPolicyMax,
            a.AccrualPercentage,
            a.ExceptionalMaxVacationOnly,
            e.Level1Dept, e.Level1DeptDesc,
            e.Level2Dept, e.Level2DeptDesc,
            e.Level3Dept, e.Level3DeptDesc,
            e.Level4Dept, e.Level4DeptDesc,
            e.Level5Dept, e.Level5DeptDesc
        FROM #Employees e
        JOIN #Accruals a ON e.EmployeeId = a.EmployeeId
        ORDER BY e.EmployeeId, a.AsOfDate, e.PositionNumber;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        DROP TABLE #Employees;
        DROP TABLE #Accruals;

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

        IF OBJECT_ID('tempdb..#Employees') IS NOT NULL DROP TABLE #Employees;
        IF OBJECT_ID('tempdb..#Accruals') IS NOT NULL DROP TABLE #Accruals;

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

