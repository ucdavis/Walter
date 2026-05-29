-- <summary>
-- Computes the set of chart strings whose aggregates (row count + amount sums)
-- differ between Walter's current TransactionalListing and the live source on
-- Redshift, persists them to dbo.TransactionalListing_ChangedKeys, and returns
-- a count + quoted IN-list string as a single-row result set for the Fabric
-- pipeline Lookup activity. The full-outer-join classifies a chart string as
-- changed if it is new in source, missing from source (deleted), or has any
-- aggregate divergence.
--
-- Source aggregates are pulled via OPENQUERY against [AE_Redshift_PROD]. The
-- query is static and produces one row per chart string (~98K rows for ~2.2M
-- source rows), well under any OPENQUERY size limit. The row-level changed-
-- rows query (with the potentially large dynamic IN-list) is executed by the
-- Fabric Copy activity using the IR's direct Redshift connection.
--
-- The changed keys are written to dbo.TransactionalListing_ChangedKeys so the
-- later usp_SwapTransactionalListing can read them directly rather than re-
-- parsing a string parameter. The returned IN-list is for the Copy activity
-- only; quotename output is cast to nvarchar(max) before string_agg so the
-- aggregate does not overflow at high cardinality (the cause of error 9829).
--
-- Initial bulk load of dbo.TransactionalListing is performed offline. This
-- sproc does no first-run handling.
-- </summary>
create procedure dbo.usp_DiffTransactionalListing
as
begin
    set nocount on;
    set xact_abort on;

    declare @SourceAggs table
    (
        ChartStringKey   nvarchar(200)  not null primary key,
        ChartRowCount    bigint         not null,
        SumActual        decimal(18, 2) not null,
        SumCommitment    decimal(18, 2) not null,
        SumObligation    decimal(18, 2) not null
    );

    -- COALESCE segments must match TransactionalListing.ChartStringKey so
    -- source and Walter aggregates align on identical keys.
    insert into @SourceAggs (ChartStringKey, ChartRowCount, SumActual, SumCommitment, SumObligation)
    select chart_string_key, chart_row_count, sum_actual, sum_commitment, sum_obligation
    from openquery([AE_Redshift_PROD], '
        select
            coalesce(entity, '''')               || ''-'' ||
            coalesce(fund, '''')                 || ''-'' ||
            coalesce(financial_department, '''') || ''-'' ||
            coalesce(account, '''')              || ''-'' ||
            coalesce(purpose, '''')              || ''-'' ||
            coalesce(program, '''')              || ''-'' ||
            coalesce(project, '''')              || ''-'' ||
            coalesce(activity, '''')             as chart_string_key,
            count(*)                             as chart_row_count,
            coalesce(sum(actual_amount), 0)      as sum_actual,
            coalesce(sum(commitment_amount), 0)  as sum_commitment,
            coalesce(sum(obligation_amount), 0)  as sum_obligation
        from ae_dwh.transactional_listing_report
        group by 1
    ');

    -- Must stay a DELETE: the pipeline role has only EXECUTE on this proc, and
    -- ownership chaining covers DML but not TRUNCATE (which needs ALTER on the
    -- table). A TRUNCATE here fails for the pipeline role with error 1088.
    delete from dbo.TransactionalListing_ChangedKeys;

    with WalterAggs as
    (
        select
            ChartStringKey,
            count_big(*)          as ChartRowCount,
            sum(ActualAmount)     as SumActual,
            sum(CommitmentAmount) as SumCommitment,
            sum(ObligationAmount) as SumObligation
        from dbo.TransactionalListing
        group by ChartStringKey
    ),
    Changed as
    (
        select coalesce(s.ChartStringKey, w.ChartStringKey) as ChartStringKey
        from @SourceAggs s
        full outer join WalterAggs w on w.ChartStringKey = s.ChartStringKey
        where s.ChartStringKey is null               -- deleted (in Walter, missing from source)
           or w.ChartStringKey is null               -- new (in source, missing from Walter)
           or w.ChartRowCount   <> s.ChartRowCount   -- modified
           or w.SumActual       <> s.SumActual
           or w.SumCommitment   <> s.SumCommitment
           or w.SumObligation   <> s.SumObligation
    )
    insert into dbo.TransactionalListing_ChangedKeys (ChartStringKey)
    select ChartStringKey from Changed;

    declare @ChangedChartStringCount   int           = 0;
    declare @ChangedChartStringsInList nvarchar(max) = N'';

    select
        @ChangedChartStringCount   = count(*),
        @ChangedChartStringsInList = string_agg(cast(quotename(ChartStringKey, '''') as nvarchar(max)), ',')
    from dbo.TransactionalListing_ChangedKeys;

    if @ChangedChartStringsInList is null
        set @ChangedChartStringsInList = N'';

    select
        @ChangedChartStringCount   as ChangedChartStringCount,
        @ChangedChartStringsInList as ChangedChartStringsInList;
end
go
