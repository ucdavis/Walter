-- Staging twin of dbo.GlSummaryBalances. Fully reloaded by
-- pl_gl_balances_loader each night, then swapped in via usp_SwapStagingTable.
-- Column definitions MUST stay identical to dbo.GlSummaryBalances or the
-- swap proc's schema check (error 51002) will reject the swap.
create table dbo.GlSummaryBalances_Staging
(
    PeriodName      varchar(10)    not null,
    Entity          varchar(20)    not null,
    EntityDesc      nvarchar(1000) not null,
    Fund            varchar(20)    not null,
    FundDesc        nvarchar(1000) not null,
    Dept            varchar(20)    not null,
    DeptDesc        nvarchar(1000) not null,
    Account         varchar(20)    not null,
    AccountDesc     nvarchar(1000) not null,
    Purpose         varchar(20)    not null,
    PurposeDesc     nvarchar(1000) not null,
    Program         varchar(20)    not null,
    ProgramDesc     nvarchar(1000) not null,
    Project         varchar(20)    not null,
    ProjectDesc     nvarchar(1000) not null,
    Activity        varchar(20)    not null,
    ActivityDesc    nvarchar(1000) not null,
    InterEnt        varchar(20)    not null,
    InterEntDesc    nvarchar(1000) not null,
    AssetAmt        decimal(18, 2) not null,
    LiabAmt         decimal(18, 2) not null,
    OwnersEquityAmt decimal(18, 2) not null,
    RevenueAmt      decimal(18, 2) not null,
    ExpenseAmt      decimal(18, 2) not null,
    RevEightAmt     decimal(18, 2) not null,
    EndBalWEight    decimal(18, 2) not null,
    EndBal          decimal(18, 2) not null,
    LoadedAt        datetime2(3)   not null
)
go
