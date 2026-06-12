CREATE PROCEDURE dbo.usp_GetLeaveAccrualBalanceSummaryReport
    @AsOfDates VARCHAR(MAX) = NULL,
    @AsOfMinDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Implements the UCP-022 leave accrual and balance summary report query, plus hourly pay rate.
    -- This report returns all leave accrual types; vacation-only consumers must filter Pin_Number = 260259.
    IF (@AsOfDates IS NULL AND @AsOfMinDate IS NULL)
       OR (@AsOfDates IS NOT NULL AND @AsOfMinDate IS NOT NULL)
    BEGIN
        RAISERROR('Provide exactly one of @AsOfDates or @AsOfMinDate', 16, 1);
        RETURN;
    END;

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

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
                SET @DateList += N', ';

            SET @DateList += N'DATE ''' + CONVERT(VARCHAR(10), @ParsedDate, 120) + N'''';
        END;

        IF @DateList = N''
        BEGIN
            RAISERROR('@AsOfDates must contain at least one valid date', 16, 1);
            RETURN;
        END;

        SET @AsOfFilter = N'IN (' + @DateList + N')';
    END;

    DECLARE @OracleQuery NVARCHAR(MAX) = N'';
    DECLARE @LinkedServerName SYSNAME = N'[AIT_BISTG_PRD-CAES_HCMODS_APPUSER]';
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    SET @OracleQuery += N'
WITH
busn_email AS (
    SELECT DISTINCT
        e.e_addr_type AS email_address_type,
        e.email_addr AS email_address,
        e.emplid AS employee_id,
        e.pref_email_flag AS pref_email_flag
    FROM caes_hcmods.ps_email_addresses_v e
    WHERE e.dml_ind <> ''D''
      AND e.e_addr_type = ''BUSN''
      AND e.pref_email_flag = ''Y''
),
empl_type AS (
    SELECT DISTINCT
        x.fieldname AS xlat_field_name,
        x.fieldvalue AS xlat_field_value,
        x.xlatlongname AS xlat_long_name,
        x.xlatshortname AS xlat_short_name
    FROM caes_hcmods.psxlatitem_v x
    WHERE x.fieldname = ''EMPL_TYPE''
),
job_current AS (
    SELECT DISTINCT
        j.emplid AS employee_id,
        j.empl_rcd AS employee_record,
        j.effdt AS effective_date,
        j.effseq AS effective_seq,
        j.empl_status AS employee_status,
        j.empl_class AS employee_class,
        j.empl_type AS employee_type,
        j.business_unit AS business_unit,
        j.deptid AS department_id,
        j.hr_status AS hr_status,
        j.jobcode AS job_code,
        j.position_nbr AS position_number,
        j.reports_to AS reports_to,
        j.union_cd AS union_code,
        ud.descr AS union_description,
        ec.descr AS employee_class_description,
        jc.descr AS job_code_description,
        n.emplid AS name_employee_id,
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
      AND j.empl_status IN (''A'', ''L'', ''P'', ''W'')
),';

    SET @OracleQuery += N'
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
      AND j.position_nbr <> '' ''
      AND j.hr_status = ''A''
),
pin AS (
    SELECT p.pin_num, p.descr
    FROM caes_hcmods.ps_gp_pin_v p
    WHERE p.dml_ind <> ''D''
),';

    SET @OracleQuery += N'
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
        p.pin_num AS gp_pin_number,
        p.descr AS gp_pin_description,
        CASE
            WHEN SUM(u.uc_accr_limit) <> 0
                THEN TRUNC((SUM(u.uc_curr_bal) / NULLIF(SUM(u.uc_accr_limit), 0)) * 100, 2)
            ELSE 0
        END AS accrual_percentage
    FROM caes_hcmods.ps_uc_am_ss_tbl_v u
    -- UCP-022 outputs both Pin_Number from balances and GP_Pin_Number from the lookup;
    -- they should match because of this join, but both are preserved for report parity.
    JOIN pin p
      ON p.pin_num = u.pin_num
    WHERE u.dml_ind <> ''D''
      AND TRUNC(CAST(u.asofdate AS DATE)) ' + @AsOfFilter + N'
    GROUP BY
        u.emplid,
        u.asofdate,
        u.pin_num,
        u.uc_apr_max_ind,
        DECODE(u.uc_apr_max_ind, ''0'', ''N'', ''Y''),
        p.pin_num,
        p.descr,
        TRUNC(CAST(u.asofdate AS DATE))
)';

    SET @OracleQuery += N'
SELECT
    j.employee_id AS "Employee_ID",
    j.employee_record AS "Employee_Record",
    j.effective_date AS "Effective_Date",
    j.effective_seq AS "Effective_Seq",
    j.employee_status AS "Employee_Status",
    j.employee_class AS "Employee_Class",
    j.employee_type AS "Employee_Type",
    j.business_unit AS "Business_Unit",
    j.department_id AS "Department_ID",
    j.hr_status AS "HR_Status",
    j.job_code AS "Job_Code",
    j.position_number AS "Position_Number",
    j.reports_to AS "Reports_To",
    j.union_code AS "Union_Code",
    j.union_description AS "Union_Description",
    j.employee_class_description AS "Employee_Class_Description",
    j.job_code_description AS "Job_Code_Description",
    j.name_employee_id AS "Name_Employee_ID",
    j.employee_name AS "Employee_Name",
    j.hourly_rate_fte AS "Hourly_Rate_FTE",
    o.department_code AS "Department_Code",
    o.department_ttl AS "Department_TTL",
    o.sub_division_ttl AS "Sub_Division_TTL",
    o.sub_division_code AS "Sub_Division_Code",
    o.division_ttl AS "Division_TTL",
    o.division_code AS "Division_Code",
    o.organization_ttl AS "Organization_TTL",
    o.organization_code AS "Organization_Code",
    rt.employee_id AS "Reports_To_Employee_ID",
    rt.name AS "Reports_To_Name",
    rt.position_number AS "Reports_To_Position_Number",
    a.asofdate AS "AsOfDate",
    a.as_of_date AS "As_Of_Date",
    a.pin_number AS "Pin_Number",';

    SET @OracleQuery += N'
    SUM(a.uc_prev_bal) AS "UC_Prev_Bal",
    SUM(a.uc_prd_taken) AS "UC_Prd_Taken",
    SUM(a.uc_prd_accrual) AS "UC_Prd_Accrual",
    SUM(a.uc_prd_adjusted) AS "UC_Prd_Adjusted",
    SUM(a.uc_curr_bal) AS "UC_Curr_Bal",
    SUM(a.uc_accr_limit) AS "UC_Accr_Limit",
    a.uc_apr_max_ind AS "UC_APR_Max_Ind",
    a.uc_apr_max_ind2 AS "UC_APR_Max_Ind2",
    SUM(a.hours_over_policy_max) AS "Hours_Over_Policy_Max",
    a.gp_pin_number AS "GP_Pin_Number",
    a.gp_pin_description AS "GP_Pin_Description",
    SUM(a.accrual_percentage) AS "Accrual_Percentage",
    COUNT(DECODE(a.pin_number, 260259,
        CASE
            WHEN a.uc_accr_limit <= 240 THEN ''40''
            WHEN a.uc_accr_limit <= 288 THEN ''48''
            WHEN a.uc_accr_limit <= 336 THEN ''56''
            WHEN a.uc_accr_limit <= 384 THEN ''64''
            ELSE ''0''
        END,
        0)) AS "Exceptional_Max_Vacation_Only",
    CASE
        WHEN j.employee_status = ''A'' THEN ''Active''
        WHEN j.employee_status = ''L'' THEN ''Unpaid Leave of Absence''
        WHEN j.employee_status = ''P'' THEN ''Paid Leave of Absence''
        WHEN j.employee_status = ''W'' THEN ''Short Work Break''
        ELSE ''Other''
    END AS "Employee_Status_Desc",
    et.xlat_long_name AS "Employee_Type_Description",
    o.sub_division_l4_code AS "Sub_Division_L4_Code",
    o.sub_division_l4_ttl AS "Sub_Division_L4_TTL",
    ee.email_address AS "Empl_Email_Address",
    me.email_address AS "Manag_Email_Address"
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
LEFT JOIN busn_email me
  ON rt.employee_id = me.employee_id';

    SET @OracleQuery += N'
GROUP BY
    j.employee_id,
    j.employee_record,
    j.effective_date,
    j.effective_seq,
    j.employee_status,
    j.employee_class,
    j.employee_type,
    j.business_unit,
    j.department_id,
    j.hr_status,
    j.job_code,
    j.position_number,
    j.reports_to,
    j.union_code,
    j.union_description,
    j.employee_class_description,
    j.job_code_description,
    j.name_employee_id,
    j.employee_name,
    j.hourly_rate_fte,
    o.department_code,
    o.department_ttl,
    o.sub_division_ttl,
    o.sub_division_code,
    o.division_ttl,
    o.division_code,
    o.organization_ttl,
    o.organization_code,
    rt.employee_id,
    rt.name,
    rt.position_number,
    a.asofdate,
    a.as_of_date,
    a.pin_number,
    a.uc_apr_max_ind,
    a.uc_apr_max_ind2,
    a.gp_pin_number,
    a.gp_pin_description,
    CASE
        WHEN j.employee_status = ''A'' THEN ''Active''
        WHEN j.employee_status = ''L'' THEN ''Unpaid Leave of Absence''
        WHEN j.employee_status = ''P'' THEN ''Paid Leave of Absence''
        WHEN j.employee_status = ''W'' THEN ''Short Work Break''
        ELSE ''Other''
    END,
    et.xlat_long_name,
    o.sub_division_l4_code,
    o.sub_division_l4_ttl,
    ee.email_address,
    me.email_address';

    SET @ParametersJSON = (
        SELECT
            @AsOfDates AS AsOfDates,
            CONVERT(VARCHAR(10), @AsOfMinDate, 120) AS AsOfMinDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        SET @TSQLCommand =
            N'EXEC (@OracleQuery) AT ' + @LinkedServerName;

        EXEC sp_executesql
            @TSQLCommand,
            N'@OracleQuery NVARCHAR(MAX)',
            @OracleQuery = @OracleQuery;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        EXEC dbo.usp_LogProcedureExecution
            @ProcedureName = 'dbo.usp_GetLeaveAccrualBalanceSummaryReport',
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

        EXEC dbo.usp_LogProcedureExecution
            @ProcedureName = 'dbo.usp_GetLeaveAccrualBalanceSummaryReport',
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
GO
