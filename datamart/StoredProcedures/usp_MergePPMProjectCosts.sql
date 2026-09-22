-- Applies one night's PPM cost rows from PPMProjectCosts_Staging to
-- PPMProjectCosts with the same rule the Fabric notebook uses in silver:
-- delete every target row whose (SourcePartition, AccountingPeriod) pair
-- appears in staging, then insert all of staging. One transaction, so a
-- consumer never sees a scope half-replaced. Refuses to run on an empty
-- staging table: a no-op merge means the upstream copy did not happen.
-- Returns one row: DeletedRows, InsertedRows (the pipeline logs them).
CREATE PROCEDURE dbo.usp_MergePPMProjectCosts
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.PPMProjectCosts_Staging)
        THROW 50001, 'PPMProjectCosts_Staging is empty; refusing a no-op merge (upstream copy likely failed).', 1;

    DECLARE @Deleted INT, @Inserted INT;

    DROP TABLE IF EXISTS #scope;
    SELECT DISTINCT SourcePartition, AccountingPeriod
    INTO #scope
    FROM dbo.PPMProjectCosts_Staging;

    BEGIN TRANSACTION;

        DELETE t
        FROM dbo.PPMProjectCosts AS t
        JOIN #scope AS s
          ON s.SourcePartition  = t.SourcePartition
         AND s.AccountingPeriod = t.AccountingPeriod;
        SET @Deleted = @@ROWCOUNT;

        INSERT INTO dbo.PPMProjectCosts (
            TransactionNumber, AwardNumber, AwardName, AwardType, AwardStatus,
            AwardStartDate, AwardEndDate, ProjectNumber, ProjectName,
            ProjectBusinessUnit, ProjectOwningOrgCode, ProjectOwningOrgName,
            ProjectType, ProjectStatus, ProjectStartDate, ProjectEndDate,
            TaskNumber, TaskName, TaskStatus, TaskFundCode, TaskFundName,
            TaskPurposeCode, TaskPurposeName, TaskProgramCode, TaskProgramName,
            TaskActivityCode, TaskActivityName, ExpenditureBusinessUnit,
            ExpenditureOrgCode, ExpenditureOrgName, ExpenditureCategoryCode,
            ExpenditureCategoryName, ExpenditureTypeCode, ExpenditureTypeName,
            ExpenditureBatch, ExpenditureItemDate, AccountingPeriod, AccountingDate,
            Document, DocumentEntry, SourceTransactionNumber,
            TransferredFromTransactionNumber, AdjustingItem, Comment, Billable,
            InvoicedStatus, RevenueStatus, RawCost, BurdenedCost, SourcePartition,
            LoadedAt)
        SELECT
            TransactionNumber, AwardNumber, AwardName, AwardType, AwardStatus,
            AwardStartDate, AwardEndDate, ProjectNumber, ProjectName,
            ProjectBusinessUnit, ProjectOwningOrgCode, ProjectOwningOrgName,
            ProjectType, ProjectStatus, ProjectStartDate, ProjectEndDate,
            TaskNumber, TaskName, TaskStatus, TaskFundCode, TaskFundName,
            TaskPurposeCode, TaskPurposeName, TaskProgramCode, TaskProgramName,
            TaskActivityCode, TaskActivityName, ExpenditureBusinessUnit,
            ExpenditureOrgCode, ExpenditureOrgName, ExpenditureCategoryCode,
            ExpenditureCategoryName, ExpenditureTypeCode, ExpenditureTypeName,
            ExpenditureBatch, ExpenditureItemDate, AccountingPeriod, AccountingDate,
            Document, DocumentEntry, SourceTransactionNumber,
            TransferredFromTransactionNumber, AdjustingItem, Comment, Billable,
            InvoicedStatus, RevenueStatus, RawCost, BurdenedCost, SourcePartition,
            LoadedAt
        FROM dbo.PPMProjectCosts_Staging;
        SET @Inserted = @@ROWCOUNT;

    COMMIT TRANSACTION;

    SELECT @Deleted AS DeletedRows, @Inserted AS InsertedRows;
END;
GO
