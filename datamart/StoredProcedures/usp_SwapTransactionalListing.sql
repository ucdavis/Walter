-- <summary>
-- Atomically replaces all rows for the given document numbers in
-- dbo.TransactionalListing with the rows currently in
-- dbo.TransactionalListing_Staging.
--
-- @ChangedDocsInList carries the same quoted, comma-separated string emitted
-- by usp_DiffTransactionalListing (format: 'doc1','doc2','doc3'). The list
-- is parsed back to a relation via STRING_SPLIT so we can DELETE by an
-- indexed join rather than a literal IN-clause that could exceed parser
-- limits at high cardinality.
--
-- Deleted documents (present in @ChangedDocsInList but absent from staging,
-- because the source no longer has any rows for them) are removed by the
-- DELETE step. The INSERT step naturally skips them because staging contains
-- no rows for those doc numbers. Atomicity is enforced by SET XACT_ABORT ON
-- and a single explicit transaction.
-- </summary>
create procedure dbo.usp_SwapTransactionalListing
    @ChangedDocsInList nvarchar(max)
as
begin
    set nocount on;
    set xact_abort on;

    if @ChangedDocsInList is null or len(@ChangedDocsInList) = 0
        return;

    -- Parse the QUOTENAME-built list back to a relation. Each token from
    -- STRING_SPLIT looks like 'docN'; strip the wrapping single quotes.
    declare @DocsToReplace table
    (
        DocumentNumber nvarchar(50) not null primary key
    );

    insert into @DocsToReplace (DocumentNumber)
    select trim('''' from value)
    from string_split(@ChangedDocsInList, ',')
    where len(value) > 0;

    begin transaction;

    delete tl
    from dbo.TransactionalListing tl
    inner join @DocsToReplace d on d.DocumentNumber = tl.DocumentNumber;

    insert into dbo.TransactionalListing
    (
        Entity, EntityDescription, Fund, FundDescription,
        FinancialDepartment, FinancialDepartmentDescription,
        Account, AccountDescription, Purpose, PurposeDescription,
        Program, ProgramDescription, Project, ProjectDescription,
        Activity, ActivityDescription,
        DocumentType, DocumentNumber, AccountingSequenceNumber,
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
        DocumentType, DocumentNumber, AccountingSequenceNumber,
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
