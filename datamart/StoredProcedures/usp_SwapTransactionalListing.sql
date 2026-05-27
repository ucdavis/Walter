-- <summary>
-- Atomically replaces all rows for the given chart strings in
-- dbo.TransactionalListing with the rows currently in
-- dbo.TransactionalListing_Staging.
--
-- @ChangedChartStringsInList carries the same quoted, comma-separated string
-- emitted by usp_DiffTransactionalListing (format: 'cs1','cs2','cs3'). The list
-- is parsed back to a relation via STRING_SPLIT so we can DELETE by an indexed
-- join rather than a literal IN-clause that could exceed parser limits at
-- high cardinality.
--
-- Deleted chart strings (present in the list but absent from staging, because
-- the source no longer has any rows for them) are removed by the DELETE step.
-- The INSERT step naturally skips them because staging contains no rows for
-- those chart strings. Atomicity is enforced by SET XACT_ABORT ON and a
-- single explicit transaction.
-- </summary>
create procedure dbo.usp_SwapTransactionalListing
    @ChangedChartStringsInList nvarchar(max)
as
begin
    set nocount on;
    set xact_abort on;

    if @ChangedChartStringsInList is null or len(@ChangedChartStringsInList) = 0
        return;

    declare @ChartStringsToReplace table
    (
        ChartStringKey nvarchar(200) not null primary key
    );

    insert into @ChartStringsToReplace (ChartStringKey)
    select trim('''' from value)
    from string_split(@ChangedChartStringsInList, ',')
    where len(value) > 0;

    begin transaction;

    delete tl
    from dbo.TransactionalListing tl
    inner join @ChartStringsToReplace c on c.ChartStringKey = tl.ChartStringKey;

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
