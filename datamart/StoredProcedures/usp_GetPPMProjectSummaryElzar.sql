-- PPM-only project summary using CAES Elzar linked server.
-- Returns task-level data from the Faculty & Department Portfolio Report.
-- Temporary until we move to the Aggie Enterprise data warehouse.
CREATE PROCEDURE dbo.usp_GetPPMProjectSummaryElzar
    @ProjectIds VARCHAR(MAX),
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @ProjectIds IS NULL OR LEN(LTRIM(RTRIM(@ProjectIds))) = 0
    BEGIN
        RAISERROR('@ProjectIds must be provided', 16, 1);
        RETURN;
    END;

    DECLARE @TSQLCommand NVARCHAR(MAX);
    DECLARE @RedshiftLinkedServer SYSNAME = '[AE_Redshift_PROD]';
    DECLARE @PgmRedshiftQuery NVARCHAR(MAX);
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    DECLARE @ProjectIdFilter NVARCHAR(MAX);
    EXEC dbo.usp_ParseProjectIdFilter @ProjectIds, @ProjectIdFilter OUTPUT;

    SET @ParametersJSON = (
        SELECT @ProjectIds AS ProjectIds,
            COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        -- pgm_master_data from Redshift (award-level metadata)
        SET @PgmRedshiftQuery = '
            SELECT
                project_number, award_number,
                close_date AS award_close_date,
                LISTAGG(DISTINCT principal_investigator_person_name, ''; '') WITHIN GROUP (ORDER BY 1) AS award_pi,
                billing_cycle, project_burden_schedule_base, project_burden_cost_rate,
                cost_share_required_by_sponsor,
                LISTAGG(DISTINCT grant_administrator, ''; '') WITHIN GROUP (ORDER BY 1) AS grant_administrator,
                postrepperiod AS post_reporting_period,
                primary_sponsor_name,
                '''' AS project_fund,
                LISTAGG(DISTINCT contractadmin, ''; '') WITHIN GROUP (ORDER BY 1) AS contract_administrator,
                sponsor_award_number
            FROM ae_dwh.pgm_master_data
            WHERE project_number IN (' + @ProjectIdFilter + ')
            GROUP BY
                project_number, award_number, close_date, billing_cycle,
                project_burden_schedule_base, project_burden_cost_rate,
                cost_share_required_by_sponsor, postrepperiod, primary_sponsor_name,
                sponsor_award_number
        ';

        SET @TSQLCommand = CAST(N'' AS NVARCHAR(MAX));

        SET @TSQLCommand = @TSQLCommand +
            N';WITH pgm_master_data AS (
                SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + N', '''
                + REPLACE(@PgmRedshiftQuery, '''', '''''') + N''')
            )
            ';

        -- PPM financials at task+chart string level from Elzar, joined with pgm metadata
        SET @TSQLCommand = @TSQLCommand +
            N'SELECT CAST(f.Award_Number AS NVARCHAR(MAX)) AS AWARD_NUMBER,
                CAST(f.Award_Name AS NVARCHAR(MAX)) AS AWARD_NAME,
                f.Award_Start_Date AS AWARD_START_DATE, f.Award_End_Date AS AWARD_END_DATE,
                CAST(f.Award_Status AS NVARCHAR(MAX)) AS AWARD_STATUS,
                CAST(f.Award_Entity AS NVARCHAR(MAX)) AS AWARD_TYPE,
                CAST(f.Project_Number AS NVARCHAR(MAX)) AS PROJECT_NUMBER,
                CAST(f.Project_Name AS NVARCHAR(MAX)) AS PROJECT_NAME,
                CASE WHEN CHARINDEX('' - '', CAST(f.Project_Owning_Organization AS NVARCHAR(MAX))) > 0
                    THEN LEFT(CAST(f.Project_Owning_Organization AS NVARCHAR(MAX)),
                         CHARINDEX('' - '', CAST(f.Project_Owning_Organization AS NVARCHAR(MAX))) - 1)
                    ELSE CAST(f.Project_Owning_Organization AS NVARCHAR(MAX))
                    END AS PROJECT_OWNING_ORG_CODE,
                CASE WHEN CHARINDEX('' - '', CAST(f.Project_Owning_Organization AS NVARCHAR(MAX))) > 0
                    THEN STUFF(CAST(f.Project_Owning_Organization AS NVARCHAR(MAX)), 1,
                         CHARINDEX('' - '', CAST(f.Project_Owning_Organization AS NVARCHAR(MAX))) + 2, '''')
                    ELSE CAST(f.Project_Owning_Organization AS NVARCHAR(MAX))
                    END AS PROJECT_OWNING_ORG,
                CAST(f.Project_Type AS NVARCHAR(MAX)) AS PROJECT_TYPE,
                CAST(f.Project_Status AS NVARCHAR(MAX)) AS PROJECT_STATUS,
                CAST(f.[Task/Subtask_Number] AS NVARCHAR(MAX)) AS TASK_NUM,
                CAST(f.[Task/Subtask_Name] AS NVARCHAR(MAX)) AS TASK_NAME,
                CAST(f.Task_Status AS NVARCHAR(MAX)) AS TASK_STATUS,
                CAST(f.Project_Manager AS NVARCHAR(MAX)) AS PM,
                CAST(f.Project_Administrator AS NVARCHAR(MAX)) AS PA,
                CAST(f.Project_Principal_Investigator AS NVARCHAR(MAX)) AS PI,
                CAST(f.[Project_Co-Principal_Investigator] AS NVARCHAR(MAX)) AS COPI,
                SUM(f.Budget) AS PPM_BUDGET, SUM(f.Expenses) AS PPM_EXPENSES,
                SUM(f.Commitments) AS PPM_COMMITMENTS,
                SUM(f.[Budget_Balance_(Budget_' + NCHAR(8211) + N'_(Comm_&_Exp))]) AS PPM_BUD_BAL,
                NULL AS GL_BEGINNING_BALANCE, NULL AS GL_REVENUE, NULL AS GL_EXPENSES,
                CAST(f.UCD_Fund AS NVARCHAR(MAX)) AS FUND_CODE,
                CASE WHEN CHARINDEX('' - '', CAST(f.Task_Fund AS NVARCHAR(MAX))) > 0
                    THEN STUFF(CAST(f.Task_Fund AS NVARCHAR(MAX)), 1,
                         CHARINDEX('' - '', CAST(f.Task_Fund AS NVARCHAR(MAX))) + 2, '''')
                    ELSE CAST(f.Task_Fund AS NVARCHAR(MAX)) END AS FUND_DESC,
                '''' AS PURPOSE_CODE,
                CASE WHEN CHARINDEX('' - '', CAST(f.Task_Purpose AS NVARCHAR(MAX))) > 0
                    THEN STUFF(CAST(f.Task_Purpose AS NVARCHAR(MAX)), 1,
                         CHARINDEX('' - '', CAST(f.Task_Purpose AS NVARCHAR(MAX))) + 2, '''')
                    ELSE CAST(f.Task_Purpose AS NVARCHAR(MAX)) END AS PURPOSE_DESC,
                CAST(f.Program AS NVARCHAR(MAX)) AS PROGRAM_CODE,
                CASE WHEN CHARINDEX('' - '', CAST(f.Task_Program AS NVARCHAR(MAX))) > 0
                    THEN STUFF(CAST(f.Task_Program AS NVARCHAR(MAX)), 1,
                         CHARINDEX('' - '', CAST(f.Task_Program AS NVARCHAR(MAX))) + 2, '''')
                    ELSE CAST(f.Task_Program AS NVARCHAR(MAX)) END AS PROGRAM_DESC,
                CAST(f.Activity AS NVARCHAR(MAX)) AS ACTIVITY_CODE,
                CASE WHEN CHARINDEX('' - '', CAST(f.Task_Activity AS NVARCHAR(MAX))) > 0
                    THEN STUFF(CAST(f.Task_Activity AS NVARCHAR(MAX)), 1,
                         CHARINDEX('' - '', CAST(f.Task_Activity AS NVARCHAR(MAX))) + 2, '''')
                    ELSE CAST(f.Task_Activity AS NVARCHAR(MAX)) END AS ACTIVITY_DESC,
                CAST(p.award_close_date AS NVARCHAR(MAX)) AS AWARD_CLOSE_DATE,
                CAST(p.award_pi AS NVARCHAR(MAX)) AS AWARD_PI,
                CAST(p.billing_cycle AS NVARCHAR(MAX)) AS BILLING_CYCLE,
                CAST(p.project_burden_schedule_base AS NVARCHAR(MAX)) AS PROJECT_BURDEN_SCHEDULE_BASE,
                CAST(p.project_burden_cost_rate AS NVARCHAR(MAX)) AS PROJECT_BURDEN_COST_RATE,
                CAST(p.cost_share_required_by_sponsor AS NVARCHAR(MAX)) AS COST_SHARE_REQUIRED_BY_SPONSOR,
                CAST(p.grant_administrator AS NVARCHAR(MAX)) AS GRANT_ADMINISTRATOR,
                CAST(p.post_reporting_period AS NVARCHAR(MAX)) AS POST_REPORTING_PERIOD,
                CAST(p.primary_sponsor_name AS NVARCHAR(MAX)) AS PRIMARY_SPONSOR_NAME,
                CAST(p.project_fund AS NVARCHAR(MAX)) AS PROJECT_FUND,
                CAST(p.contract_administrator AS NVARCHAR(MAX)) AS CONTRACT_ADMINISTRATOR,
                CAST(p.sponsor_award_number AS NVARCHAR(MAX)) AS SPONSOR_AWARD_NUMBER
            FROM CAES_ELZAR.AzureDW.dbo.FacultyAndDepartmentPortfolioReport f
            LEFT JOIN pgm_master_data p
                ON f.Project_Number = p.project_number AND f.Award_Number = p.award_number
            WHERE f.Project_Number IN (' + @ProjectIdFilter + N')
              AND f.Task_Status <> ''Inactive''
            GROUP BY CAST(f.Award_Number AS NVARCHAR(MAX)), CAST(f.Award_Name AS NVARCHAR(MAX)),
                f.Award_Start_Date, f.Award_End_Date,
                CAST(f.Award_Status AS NVARCHAR(MAX)), CAST(f.Award_Entity AS NVARCHAR(MAX)),
                CAST(f.Project_Number AS NVARCHAR(MAX)), CAST(f.Project_Name AS NVARCHAR(MAX)),
                CAST(f.Project_Owning_Organization AS NVARCHAR(MAX)),
                CAST(f.Project_Type AS NVARCHAR(MAX)), CAST(f.Project_Status AS NVARCHAR(MAX)),
                CAST(f.[Task/Subtask_Number] AS NVARCHAR(MAX)), CAST(f.[Task/Subtask_Name] AS NVARCHAR(MAX)),
                CAST(f.Task_Status AS NVARCHAR(MAX)),
                CAST(f.Project_Manager AS NVARCHAR(MAX)), CAST(f.Project_Administrator AS NVARCHAR(MAX)),
                CAST(f.Project_Principal_Investigator AS NVARCHAR(MAX)),
                CAST(f.[Project_Co-Principal_Investigator] AS NVARCHAR(MAX)),
                CAST(f.UCD_Fund AS NVARCHAR(MAX)), CAST(f.Task_Fund AS NVARCHAR(MAX)),
                CAST(f.Task_Purpose AS NVARCHAR(MAX)),
                CAST(f.Program AS NVARCHAR(MAX)), CAST(f.Task_Program AS NVARCHAR(MAX)),
                CAST(f.Activity AS NVARCHAR(MAX)), CAST(f.Task_Activity AS NVARCHAR(MAX)),
                CAST(p.award_close_date AS NVARCHAR(MAX)), CAST(p.award_pi AS NVARCHAR(MAX)),
                CAST(p.billing_cycle AS NVARCHAR(MAX)),
                CAST(p.project_burden_schedule_base AS NVARCHAR(MAX)),
                CAST(p.project_burden_cost_rate AS NVARCHAR(MAX)),
                CAST(p.cost_share_required_by_sponsor AS NVARCHAR(MAX)),
                CAST(p.grant_administrator AS NVARCHAR(MAX)),
                CAST(p.post_reporting_period AS NVARCHAR(MAX)),
                CAST(p.primary_sponsor_name AS NVARCHAR(MAX)),
                CAST(p.project_fund AS NVARCHAR(MAX)),
                CAST(p.contract_administrator AS NVARCHAR(MAX)),
                CAST(p.sponsor_award_number AS NVARCHAR(MAX));';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetPPMProjectSummaryElzar',
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

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetPPMProjectSummaryElzar',
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