-- Local landing table for GL actuals summarized by project, GL period, and natural account,
-- with the account's top-level rollup. Populated by the AE_DWH copy job from the Redshift
-- transactional_listing_report (all accounts; the period string is landed as-is). Replaces the
-- live OPENQUERY used by the projection logic. Consumed by usp_GetProjectProjection, which
-- filters to expense (ParentLevel0Code '5%'), maps natural account to expenditure category via
-- dbo.ExpenditureTypeByAccount, and matches PeriodName to the calendar months it projects over.
create table dbo.GlProjectMonthlyActuals
(
    ProjectId        nvarchar(15)   not null,
    PeriodName       nvarchar(15)   not null,  -- GL period as landed, e.g. 'Mar-26'
    NaturalAccount   nvarchar(10)   not null,
    ParentLevel0Code nvarchar(15),             -- erp_account parent rollup; expense accounts are '5%'
    ActualAmount     decimal(18, 2) not null,
    LoadedAt         datetime2(3)   not null,
    constraint PK_GlProjectMonthlyActuals
        primary key (ProjectId, PeriodName, NaturalAccount)
)
go
