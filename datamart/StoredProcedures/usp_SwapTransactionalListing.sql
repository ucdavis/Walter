-- <summary>
-- Atomically replaces all rows for the changed chart strings in
-- dbo.TransactionalListing with the rows currently in
-- dbo.TransactionalListing_Staging.
--
-- The set of chart strings to replace is read from
-- dbo.TransactionalListing_ChangedKeys (populated by usp_DiffTransactionalListing
-- earlier in the same pipeline run) -- no string parameter / STRING_SPLIT needed.
--
-- Deleted chart strings (in ChangedKeys but absent from staging, because the
-- source no longer has rows for them) are removed by the DELETE step; the INSERT
-- naturally skips them because staging has no rows for those keys. Atomicity is
-- enforced by SET XACT_ABORT ON and a single explicit transaction.
-- </summary>
create procedure dbo.usp_SwapTransactionalListing
as
begin
    set nocount on;
    set xact_abort on;

    if not exists (select 1 from dbo.TransactionalListing_ChangedKeys)
        return;

    begin transaction;

    delete tl
    from dbo.TransactionalListing tl
    inner join dbo.TransactionalListing_ChangedKeys c
        on c.ChartStringKey = tl.ChartStringKey;

    insert into dbo.TransactionalListing
    (
        Entity, EntityDescription, Fund, FundDescription,
        FinancialDepartment, FinancialDepartmentDescription,
        Account, AccountDescription, Purpose, PurposeDescription,
        Program, ProgramDescription, Project, ProjectDescription,
        Activity, ActivityDescription,
        DocumentType, AccountingSequenceNumber,
        TrackingNo, Reference,
        JournalLineDescription, JournalAcctDate, JournalName, JournalReference,
        PeriodName, JournalBatchName, JournalSource, JournalCategory,
        BatchStatus, ActualFlag, EncumbranceTypeCode,
        ActualAmount, CommitmentAmount, ObligationAmount,
        LoadedAt
    )
    select
        Entity, EntityDescription, Fund, FundDescription,
        FinancialDepartment, FinancialDepartmentDescription,
        Account, AccountDescription, Purpose, PurposeDescription,
        Program, ProgramDescription, Project, ProjectDescription,
        Activity, ActivityDescription,
        DocumentType, AccountingSequenceNumber,
        TrackingNo, Reference,
        JournalLineDescription, JournalAcctDate, JournalName, JournalReference,
        PeriodName, JournalBatchName, JournalSource, JournalCategory,
        BatchStatus, ActualFlag, EncumbranceTypeCode,
        ActualAmount, CommitmentAmount, ObligationAmount,
        LoadedAt
    from dbo.TransactionalListing_Staging;

    commit transaction;
end
go
