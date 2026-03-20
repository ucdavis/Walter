-- GL-only project summary using Redshift + CAES Elzar linked servers.
-- Returns GL balances (beginning balance, revenue, expenses) by chart string.
-- Project metadata comes from Elzar, financial data from GL transactional_listing_report.
-- Temporary until we move to the Aggie Enterprise data warehouse.
CREATE PROCEDURE dbo.usp_GetGLProjectSummaryElzar
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
    DECLARE @GLRedshiftQuery NVARCHAR(MAX);
    DECLARE @StartTime DATETIME2 = SYSDATETIME();
    DECLARE @RowCount INT;
    DECLARE @Duration_MS INT;
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    -- Compute current fiscal year boundaries (July 1 - June 30)
    DECLARE @FYStart DATE = CASE
        WHEN MONTH(GETDATE()) >= 7
        THEN DATEFROMPARTS(YEAR(GETDATE()), 7, 1)
        ELSE DATEFROMPARTS(YEAR(GETDATE()) - 1, 7, 1)
    END;

    -- Build fiscal year period names for GL filter (e.g. 'Jul-25', 'Aug-25', ..., 'Jun-26')
    DECLARE @PeriodFilter NVARCHAR(MAX) = '';
    DECLARE @PeriodDate DATE;
    DECLARE @i INT = 0;
    WHILE @i < 12
    BEGIN
        SET @PeriodDate = DATEADD(MONTH, @i, @FYStart);
        IF @i > 0 SET @PeriodFilter = @PeriodFilter + ', ';
        SET @PeriodFilter = @PeriodFilter +
            '''' + LEFT(DATENAME(MONTH, @PeriodDate), 3) + '-' + RIGHT(CAST(YEAR(@PeriodDate) AS VARCHAR(4)), 2) + '''';
        SET @i = @i + 1;
    END;

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
        -- GL summary from Redshift
        -- Beginning balance = all 3XXXXX transactions (all time)
        -- Revenue/Expenses = current FY only (4XXXXX/5XXXXX)
        SET @GLRedshiftQuery = '
            SELECT
                tlr.PROJECT,
                tlr.FUND,
                tlr.PROGRAM,
                tlr.ACTIVITY,
                SUM(CASE WHEN acc.parent_level_0_code LIKE ''3%''
                         THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS BEGINNING_BALANCE,
                SUM(CASE WHEN acc.parent_level_0_code LIKE ''4%''
                         AND tlr.PERIOD_NAME IN (' + @PeriodFilter + ')
                         THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS REVENUE,
                SUM(CASE WHEN acc.parent_level_0_code LIKE ''5%''
                         AND tlr.PERIOD_NAME IN (' + @PeriodFilter + ')
                         THEN tlr.ACTUAL_AMOUNT ELSE 0 END) AS EXPENSES
            FROM ae_dwh.transactional_listing_report tlr
            LEFT JOIN ae_dwh.erp_account acc ON tlr.ACCOUNT = acc.code
            WHERE tlr.PROJECT IN (' + @ProjectIdFilter + ')
            GROUP BY tlr.PROJECT, tlr.FUND, tlr.PROGRAM, tlr.ACTIVITY
        ';

        SET @TSQLCommand = CAST(N'' AS NVARCHAR(MAX));

        -- CTE 1: project metadata from Elzar (one row per project)
        SET @TSQLCommand = @TSQLCommand +
            N';WITH project_meta AS (
                SELECT DISTINCT
                    CAST(f.Award_Number AS NVARCHAR(MAX)) AS AWARD_NUMBER,
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
                    CAST(f.Project_Manager AS NVARCHAR(MAX)) AS PM,
                    CAST(f.Project_Administrator AS NVARCHAR(MAX)) AS PA,
                    CAST(f.Project_Principal_Investigator AS NVARCHAR(MAX)) AS PI,
                    CAST(f.[Project_Co-Principal_Investigator] AS NVARCHAR(MAX)) AS COPI
                FROM CAES_ELZAR.AzureDW.dbo.FacultyAndDepartmentPortfolioReport f
                WHERE f.Project_Number IN (' + @ProjectIdFilter + N')
            ),
            ';

        -- CTE 2: GL summary from Redshift
        SET @TSQLCommand = @TSQLCommand +
            N'gl_summary AS (
                SELECT * FROM OPENQUERY(' + @RedshiftLinkedServer + N', '''
                + REPLACE(@GLRedshiftQuery, '''', '''''') + N''')
            )
            ';

        -- Final SELECT: GL financials joined with project metadata
        SET @TSQLCommand = @TSQLCommand + N'
            SELECT m.AWARD_NUMBER, m.AWARD_START_DATE, m.AWARD_END_DATE, m.AWARD_STATUS, m.AWARD_TYPE,
                m.PROJECT_NUMBER, m.PROJECT_NAME, m.PROJECT_OWNING_ORG_CODE, m.PROJECT_OWNING_ORG,
                m.PROJECT_TYPE, m.PROJECT_STATUS,
                m.PM, m.PA, m.PI, m.COPI,
                0 AS PPM_BUDGET, 0 AS PPM_EXPENSES, 0 AS PPM_COMMITMENTS, 0 AS PPM_BUD_BAL,
                -COALESCE(g.BEGINNING_BALANCE, 0) AS GL_BEGINNING_BALANCE,
                -COALESCE(g.REVENUE, 0) AS GL_REVENUE,
                COALESCE(g.EXPENSES, 0) AS GL_EXPENSES,
                g.FUND AS FUND_CODE, '''' AS FUND_DESC,
                '''' AS PURPOSE_CODE, '''' AS PURPOSE_DESC,
                g.PROGRAM AS PROGRAM_CODE, '''' AS PROGRAM_DESC,
                g.ACTIVITY AS ACTIVITY_CODE, '''' AS ACTIVITY_DESC
            FROM gl_summary g
            JOIN project_meta m ON g.PROJECT = m.PROJECT_NUMBER;';

        EXEC sp_executesql @TSQLCommand;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetGLProjectSummaryElzar',
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
            @ProcedureName = 'dbo.usp_GetGLProjectSummaryElzar',
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
