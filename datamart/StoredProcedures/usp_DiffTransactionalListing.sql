-- <summary>
-- Computes the set of document numbers that differ between Walter's current
-- TransactionalListing and the live source on Redshift. Emits both a count and
-- a quoted IN-list string for use as a Fabric pipeline parameter.
--
-- The full-outer-join below classifies a document as changed if:
--   - it exists in source but not in Walter (new)
--   - row count or any of the three amount sums differ (modified)
--   - it exists in Walter but not in source (deleted)
--
-- Source aggregates are pulled via OPENQUERY against [AE_Redshift_PROD]. This
-- is a static, small aggregate query (one row per document); it is well under
-- the 8000-byte OPENQUERY literal limit. The row-level changed-rows query
-- (with the potentially large dynamic IN-list) is executed by the Fabric Copy
-- activity using the IR's direct Redshift connection, not via OPENQUERY here.
--
-- Initial bulk load of dbo.TransactionalListing is performed offline. This
-- sproc does no first-run handling: if Walter is empty, every source document
-- will be flagged "new" and the pipeline will attempt a full pull.
-- </summary>
create procedure dbo.usp_DiffTransactionalListing
    @ChangedDocCount   int           output,
    @ChangedDocsInList nvarchar(max) output
as
begin
    set nocount on;
    set xact_abort on;

    set @ChangedDocCount   = 0;
    set @ChangedDocsInList = N'';

    declare @SourceAggs table
    (
        DocumentNumber  nvarchar(50)   not null primary key,
        DocRowCount     bigint         not null,
        SumActual       decimal(18, 2) not null,
        SumCommitment   decimal(18, 2) not null,
        SumObligation   decimal(18, 2) not null
    );

    insert into @SourceAggs (DocumentNumber, DocRowCount, SumActual, SumCommitment, SumObligation)
    select document_number, doc_row_count, sum_actual, sum_commitment, sum_obligation
    from openquery([AE_Redshift_PROD], '
        select
            document_number,
            count(*)                            as doc_row_count,
            coalesce(sum(actual_amount), 0)     as sum_actual,
            coalesce(sum(commitment_amount), 0) as sum_commitment,
            coalesce(sum(obligation_amount), 0) as sum_obligation
        from ae_dwh.transactional_listing_report
        group by document_number
    ');

    with WalterAggs as
    (
        select
            DocumentNumber,
            count_big(*)          as DocRowCount,
            sum(ActualAmount)     as SumActual,
            sum(CommitmentAmount) as SumCommitment,
            sum(ObligationAmount) as SumObligation
        from dbo.TransactionalListing
        group by DocumentNumber
    ),
    Changed as
    (
        select coalesce(s.DocumentNumber, w.DocumentNumber) as DocumentNumber
        from @SourceAggs s
        full outer join WalterAggs w on w.DocumentNumber = s.DocumentNumber
        where s.DocumentNumber is null               -- deleted (in Walter, missing from source)
           or w.DocumentNumber is null               -- new (in source, missing from Walter)
           or w.DocRowCount    <> s.DocRowCount      -- modified
           or w.SumActual      <> s.SumActual
           or w.SumCommitment  <> s.SumCommitment
           or w.SumObligation  <> s.SumObligation
    )
    select
        @ChangedDocCount   = count(*),
        @ChangedDocsInList = string_agg(quotename(DocumentNumber, ''''), ',')
    from Changed;

    if @ChangedDocsInList is null
        set @ChangedDocsInList = N'';
end
go
