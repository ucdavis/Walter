-- <summary>
-- Atomically replaces every row for the changed PERIODS in dbo.TransactionalListing
-- with the rows currently in dbo.TransactionalListing_Staging.
--
-- @ChangedPeriodsInList is the quoted, comma-separated list emitted by
-- usp_DiffTransactionalListing (e.g. '2026-05','2026-06'), parsed back via
-- STRING_SPLIT. Replacing whole periods is self-correcting: inserts, updates,
-- deletes, and reclasses within a changed period are all reconciled. Periods that
-- vanished from the source (changed, but with no staging rows) are removed by the
-- DELETE; the INSERT naturally adds nothing for them. Atomicity is enforced by
-- SET XACT_ABORT ON and a single explicit transaction.
-- </summary>
create procedure dbo.usp_SwapTransactionalListing
    @ChangedPeriodsInList nvarchar(max)
as
begin
    set nocount on;
    set xact_abort on;

    if @ChangedPeriodsInList is null or len(@ChangedPeriodsInList) = 0
        return;

    declare @ChangedPeriods table (PeriodName nvarchar(20) not null primary key);

    insert into @ChangedPeriods (PeriodName)
    select trim('''' from value)
    from string_split(@ChangedPeriodsInList, ',')
    where len(value) > 0;

    begin transaction;

    delete tl
    from dbo.TransactionalListing tl
    inner join @ChangedPeriods p on p.PeriodName = tl.PeriodName;

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
