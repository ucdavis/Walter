-- Project summary combining local FacultyDeptPortfolio table with award metadata from AE DWH.
-- Returns task-level data with expenditure category breakdown.
CREATE PROCEDURE dbo.usp_GetProjectSummary
    @ProjectIds VARCHAR(MAX) = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
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

    DECLARE @RedshiftQuery NVARCHAR(MAX);
    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
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

    SET @FilterClause = ' WHERE f.ProjectNumber IN (' + @ProjectIdFilter + ')';

    -- Add date overlap logic
    IF @StartDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND f.AwardEndDate >= ''' + CONVERT(VARCHAR(10), @StartDate, 120) + '''';

    IF @EndDate IS NOT NULL
        SET @FilterClause = @FilterClause + ' AND f.AwardStartDate <= ''' + CONVERT(VARCHAR(10), @EndDate, 120) + '''';

    -- Build Redshift query for award metadata (pgm_master_data is still remote)
    SET @RedshiftQuery = '
        WITH ranked AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY project_number, award_number
                    ORDER BY project_burden_cost_rate DESC NULLS LAST, contract_line_number ASC NULLS LAST
                ) AS rn
            FROM ae_dwh.pgm_master_data
            WHERE project_number IN (' + @ProjectIdFilter + ')
        ),
        best AS (
            SELECT * FROM ranked WHERE rn = 1
        )
        SELECT
            b.project_number, b.award_number,
            b.close_date AS award_close_date,
            LISTAGG(DISTINCT a.principal_investigator_person_name, ''; '') WITHIN GROUP (ORDER BY 1) AS award_pi,
            b.billing_cycle,
            b.project_burden_schedule_base,
            b.project_burden_cost_rate,
            b.cost_share_required_by_sponsor,
            LISTAGG(DISTINCT a.grant_administrator, ''; '') WITHIN GROUP (ORDER BY 1) AS grant_administrator,
            b.postrepperiod AS post_reporting_period,
            b.primary_sponsor_name,
            '''' AS project_fund,
            LISTAGG(DISTINCT a.contractadmin, ''; '') WITHIN GROUP (ORDER BY 1) AS contract_administrator,
            b.sponsor_award_number,
            b.flow_through_funds_primary_sponsor,
            b.flow_through_funds_reference_award_name,
            b.flow_through_funds_start_date,
            b.flow_through_funds_end_date,
            b.flow_through_funds_amount
        FROM best b
        JOIN ae_dwh.pgm_master_data a
            ON a.project_number = b.project_number AND a.award_number = b.award_number
        GROUP BY
            b.project_number, b.award_number, b.close_date, b.billing_cycle,
            b.project_burden_schedule_base, b.project_burden_cost_rate,
            b.cost_share_required_by_sponsor, b.postrepperiod, b.primary_sponsor_name,
            b.sponsor_award_number,
            b.flow_through_funds_primary_sponsor, b.flow_through_funds_reference_award_name,
            b.flow_through_funds_start_date, b.flow_through_funds_end_date,
            b.flow_through_funds_amount';

    -- Build parameters JSON for logging
    SET @ParametersJSON = (
        SELECT
            @ProjectIds AS ProjectIds,
            CONVERT(VARCHAR(10), @StartDate, 120) AS StartDate,
            CONVERT(VARCHAR(10), @EndDate, 120) AS EndDate,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        -- Fetch award metadata from Redshift into temp table, then join with local FacultyDeptPortfolio
        SET @TSQLCommand = '
            SELECT * INTO #pgm FROM OPENQUERY(' + @RedshiftLinkedServer + ', ''' + REPLACE(@RedshiftQuery, '''', '''''') + ''');

            SELECT f.AwardNumber AS AWARD_NUMBER, f.AwardName AS AWARD_NAME, f.AwardType AS AWARD_TYPE,
                f.AwardStartDate AS AWARD_START_DATE, f.AwardEndDate AS AWARD_END_DATE, f.AwardStatus AS AWARD_STATUS,
                f.ProjectNumber AS PROJECT_NUMBER, f.ProjectName AS PROJECT_NAME,
                f.ProjectOwningOrgCode AS PROJECT_OWNING_ORG_CODE,
                f.ProjectOwningOrg AS PROJECT_OWNING_ORG,
                f.ProjectType AS PROJECT_TYPE, f.ProjectStatus AS PROJECT_STATUS,
                f.TaskNum AS TASK_NUM, f.TaskName AS TASK_NAME, f.TaskStatus AS TASK_STATUS,
                f.Pm AS PM, f.Pa AS PA, f.Pi AS PI, f.Copi AS COPI,
                f.ExpenditureCategoryName AS EXPENDITURE_CATEGORY_NAME,
                f.FundCode AS FUND_CODE, f.FundDesc AS FUND_DESC,
                f.PurposeCode AS PURPOSE_CODE, f.PurposeDesc AS PURPOSE_DESC,
                f.ProgramCode AS PROGRAM_CODE, f.ProgramDesc AS PROGRAM_DESC,
                f.ActivityCode AS ACTIVITY_CODE, f.ActivityDesc AS ACTIVITY_DESC,
                f.PpmBudget AS PPM_BUDGET, f.PpmCommitments AS PPM_COMMITMENTS,
                f.PpmExpenses AS PPM_EXPENSES, f.PpmBudBal AS PPM_BUD_BAL,
                CAST(NULL AS DECIMAL(15,2)) AS GL_BEGINNING_BALANCE,
                CAST(NULL AS DECIMAL(15,2)) AS GL_REVENUE,
                CAST(NULL AS DECIMAL(15,2)) AS GL_EXPENSES,
                p.award_close_date AS AWARD_CLOSE_DATE, p.award_pi AS AWARD_PI, p.billing_cycle AS BILLING_CYCLE,
                p.project_burden_schedule_base AS PROJECT_BURDEN_SCHEDULE_BASE,
                p.project_burden_cost_rate AS PROJECT_BURDEN_COST_RATE,
                p.cost_share_required_by_sponsor AS COST_SHARE_REQUIRED_BY_SPONSOR,
                p.grant_administrator AS GRANT_ADMINISTRATOR,
                p.post_reporting_period AS POST_REPORTING_PERIOD,
                p.primary_sponsor_name AS PRIMARY_SPONSOR_NAME, p.project_fund AS PROJECT_FUND,
                p.contract_administrator AS CONTRACT_ADMINISTRATOR, p.sponsor_award_number AS SPONSOR_AWARD_NUMBER,
                p.flow_through_funds_primary_sponsor     AS FLOW_THROUGH_FUNDS_PRIMARY_SPONSOR,
                p.flow_through_funds_reference_award_name AS FLOW_THROUGH_FUNDS_REFERENCE_AWARD_NAME,
                p.flow_through_funds_start_date          AS FLOW_THROUGH_FUNDS_START_DATE,
                p.flow_through_funds_end_date            AS FLOW_THROUGH_FUNDS_END_DATE,
                p.flow_through_funds_amount              AS FLOW_THROUGH_FUNDS_AMOUNT
            FROM dbo.FacultyDeptPortfolio f
            LEFT JOIN #pgm p ON f.ProjectNumber = p.project_number AND f.AwardNumber = p.award_number
            ' + @FilterClause;

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        -- Log successful execution
        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectSummary',
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
            @ProcedureName = 'dbo.usp_GetProjectSummary',
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
