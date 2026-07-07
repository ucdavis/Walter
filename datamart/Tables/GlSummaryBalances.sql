-- Nightly snapshot of AE GL summary balances at the full chart-string grain
-- (latest snapshot per accounting period; zero-balance rows suppressed at the
-- source). Sourced from the scheduled "UCD GL Summary Balances" report email,
-- landed in the CAES Datamart (Fabric), and loaded here by
-- pl_gl_balances_loader via GlSummaryBalances_Staging + usp_SwapStagingTable
-- (full replace). Supersedes the GlSegmentMonthlyActuals design from the
-- college/dept financial summaries work: same fact space, but balance-report
-- measures (assets/liabilities/beginning balance/revenue/expenses/other
-- changes/ending balance) instead of sign-normalized income/expense, and the
-- leaf financial department only (join the Erp*Hierarchy tables for rollups).
create table dbo.GlSummaryBalances
(
    PeriodName      varchar(10)    not null,  -- GL period as landed, e.g. 'Jul-26'
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

create clustered index IX_GlSummaryBalances_PeriodDeptAccount
    on dbo.GlSummaryBalances (PeriodName, Dept, Account)
go
