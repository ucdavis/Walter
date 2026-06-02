-- <summary>
-- Computes the set of accounting periods whose aggregates (row count + the three
-- amount sums) differ between Walter's current TransactionalListing and the live
-- source on Redshift, and returns a count + quoted IN-list string as a single-row
-- result set for the Fabric pipeline Lookup activity. The full-outer-join classifies
-- a period as changed if it is new in source, missing from source, or has any
-- aggregate divergence.
--
-- Source aggregates are pulled via OPENQUERY against [AE_Redshift_PROD]. The query
-- is static and produces one row per accounting period (single/double digits), well
-- under any OPENQUERY size limit. The Fabric Copy activity then extracts only the
-- changed periods (WHERE period_name IN (...)) using the IR's direct Redshift
-- connection.
--
-- period_name is required: financial rows always carry an accounting period. It is
-- not coalesced on either side -- a NULL period violates @SourceAggs's NOT NULL key
-- (or would produce an un-reconcilable bucket the swap cannot act on), so it fails
-- loudly rather than churning silently.
--
-- Detection is at period grain: a within-period reclass that moves an amount between
-- chart strings while leaving that period's row count and totals unchanged is not
-- caught; a periodic full reload is the backstop.
--
-- Initial bulk load of dbo.TransactionalListing is performed offline. This sproc
-- does no first-run handling.
-- </summary>
create procedure dbo.usp_DiffTransactionalListing
as
begin
    set nocount on;
    set xact_abort on;

    declare @ChangedPeriodCount   int           = 0;
    declare @ChangedPeriodsInList nvarchar(max) = N'';

    declare @SourceAggs table
    (
        PeriodName    nvarchar(20)   not null primary key,
        RowCnt        bigint         not null,
        SumActual     decimal(18, 2) not null,
        SumCommitment decimal(18, 2) not null,
        SumObligation decimal(18, 2) not null
    );

    -- Period-grain aggregate from the source (one row per accounting period).
    insert into @SourceAggs (PeriodName, RowCnt, SumActual, SumCommitment, SumObligation)
    select period_name, row_cnt, sum_actual, sum_commitment, sum_obligation
    from openquery([AE_Redshift_PROD], '
        select
            period_name                          as period_name,
            count(*)                             as row_cnt,
            coalesce(sum(actual_amount), 0)      as sum_actual,
            coalesce(sum(commitment_amount), 0)  as sum_commitment,
            coalesce(sum(obligation_amount), 0)  as sum_obligation
        from ae_dwh.transactional_listing_report
        group by 1
    ');

    with WalterAggs as
    (
        select
            PeriodName,
            count_big(*)          as RowCnt,
            sum(ActualAmount)     as SumActual,
            sum(CommitmentAmount) as SumCommitment,
            sum(ObligationAmount) as SumObligation
        from dbo.TransactionalListing
        group by PeriodName
    ),
    Changed as
    (
        select coalesce(s.PeriodName, w.PeriodName) as PeriodName
        from @SourceAggs s
        full outer join WalterAggs w on w.PeriodName = s.PeriodName
        where s.PeriodName is null               -- period gone from source
           or w.PeriodName is null               -- new period in source
           or w.RowCnt        <> s.RowCnt        -- count moved
           or w.SumActual     <> s.SumActual
           or w.SumCommitment <> s.SumCommitment
           or w.SumObligation <> s.SumObligation
    )
    select
        @ChangedPeriodCount   = count(*),
        @ChangedPeriodsInList = string_agg(cast(quotename(PeriodName, '''') as nvarchar(max)), ',')
    from Changed;

    if @ChangedPeriodsInList is null
        set @ChangedPeriodsInList = N'';

    -- ChangedPeriodsInList = quoted, comma-separated list (e.g. '2026-05','2026-06')
    -- consumed by the Fabric copy's  WHERE period_name IN (...)  filter.
    select
        @ChangedPeriodCount   as ChangedPeriodCount,
        @ChangedPeriodsInList as ChangedPeriodsInList;
end
go
