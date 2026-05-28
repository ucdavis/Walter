-- <summary>
-- Computes the set of chart strings whose aggregates (row count + amount sums)
-- differ between Walter's current TransactionalListing and the live source on
-- Redshift. Returns a single-row result set with the count and a quoted
-- IN-list string -- consumed by a Fabric Lookup activity. The full-outer-join
-- classifies a chart string as changed if it is new in source, missing from
-- source (deleted), or has any aggregate divergence.
--
-- Source aggregates are pulled via OPENQUERY against [AE_Redshift_PROD]. The
-- query is static and produces one row per chart string (~98K rows for ~2.2M
-- source rows), well under any OPENQUERY size limit. The row-level changed-
-- rows query (with the potentially large dynamic IN-list) is executed by the
-- Fabric Copy activity using the IR's direct Redshift connection.
--
-- Initial bulk load of dbo.TransactionalListing is performed offline. This
-- sproc does no first-run handling.
-- </summary>
create procedure dbo.usp_DiffTransactionalListing
as
begin
    set nocount on;
    set xact_abort on;

    declare @ChangedChartStringCount   int           = 0;
    declare @ChangedChartStringsInList nvarchar(max) = N'';

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
    select
        @ChangedChartStringCount   = count(*),
        @ChangedChartStringsInList = string_agg(quotename(ChartStringKey, ''''), ',')
    from Changed;

    if @ChangedChartStringsInList is null
        set @ChangedChartStringsInList = N'';

    select
        @ChangedChartStringCount   as ChangedChartStringCount,
        @ChangedChartStringsInList as ChangedChartStringsInList;
end
go
