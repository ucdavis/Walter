-- PPM expenditure-item detail for a single project from the local dbo.PPMProjectCosts.
-- Category and type are returned in the 'CODE - Name' form the rest of Walter uses
-- (e.g. '01 - Salaries and Wages', '501010 - ...').
CREATE PROCEDURE dbo.usp_GetProjectCosts
    @ProjectId       NVARCHAR(15),
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @EmulatingUser   NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime      DATETIME2 = SYSDATETIME();
    DECLARE @RowCount       INT;
    DECLARE @Duration_MS    INT;
    DECLARE @ErrorMsg       NVARCHAR(MAX);
    DECLARE @ParametersJSON NVARCHAR(MAX);

    EXEC dbo.usp_SanitizeInputString @ApplicationName OUTPUT;
    EXEC dbo.usp_SanitizeInputString @ApplicationUser OUTPUT;

    BEGIN TRY
        -- Build parameters JSON before validation so a bad project id is still logged by the CATCH.
        SET @ParametersJSON = (
            SELECT @ProjectId AS ProjectId,
                   COALESCE(@ApplicationName, APP_NAME()) AS ApplicationName
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        EXEC dbo.usp_ValidateAggieEnterpriseProject @ProjectId;

        -- Every report column except load bookkeeping (SourcePartition, LoadedAt); the page
        -- shows a few and the CSV export carries the rest.
        SELECT
            c.TransactionNumber,
            c.AwardNumber,
            c.AwardName,
            c.AwardType,
            c.AwardStatus,
            c.AwardStartDate,
            c.AwardEndDate,
            c.ProjectNumber,
            c.ProjectName,
            c.ProjectBusinessUnit,
            c.ProjectOwningOrgCode,
            c.ProjectOwningOrgName,
            c.ProjectType,
            c.ProjectStatus,
            c.ProjectStartDate,
            c.ProjectEndDate,
            c.TaskNumber,
            c.TaskName,
            c.TaskStatus,
            c.TaskFundCode,
            c.TaskFundName,
            c.TaskPurposeCode,
            c.TaskPurposeName,
            c.TaskProgramCode,
            c.TaskProgramName,
            c.TaskActivityCode,
            c.TaskActivityName,
            c.ExpenditureBusinessUnit,
            c.ExpenditureOrgCode,
            c.ExpenditureOrgName,
            c.ExpenditureCategoryCode + ' - ' + c.ExpenditureCategoryName AS ExpenditureCategory,
            c.ExpenditureTypeCode + ' - ' + c.ExpenditureTypeName AS ExpenditureType,
            c.ExpenditureBatch,
            c.ExpenditureItemDate,
            c.AccountingPeriod,
            c.AccountingDate,
            c.Document,
            c.DocumentEntry,
            c.SourceTransactionNumber,
            c.TransferredFromTransactionNumber,
            c.AdjustingItem,
            c.Comment,
            c.Billable,
            c.InvoicedStatus,
            c.RevenueStatus,
            c.RawCost,
            c.BurdenedCost
        FROM dbo.PPMProjectCosts c
        WHERE c.ProjectNumber = @ProjectId
        ORDER BY c.AccountingDate, c.TransactionNumber;

        SET @RowCount = @@ROWCOUNT;
        SET @Duration_MS = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME());

        EXEC [dbo].[usp_LogProcedureExecution]
            @ProcedureName = 'dbo.usp_GetProjectCosts',
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
            @ProcedureName = 'dbo.usp_GetProjectCosts',
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
