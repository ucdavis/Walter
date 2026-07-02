-- Local fact table of GL actuals for college/department financial summaries, aggregated to the
-- chart-string segment + GL period grain, with the financial department hierarchy (levels D-G)
-- denormalized onto each row (level G is the leaf transacting department). Sourced from the
-- Redshift transactional_listing_report, restricted to income (natural account rollup '4%') and
-- expense ('5%'); amounts are sign-normalized so both measures are positive. Consumed by
-- usp_GetGlSegmentSummary for flexible filter/group-by reporting. Populated out-of-band for now;
-- an ADF pipeline and load procedure will maintain it later.
create table dbo.GlSegmentMonthlyActuals
(
    -- Financial department hierarchy, levels D-G (level G is the leaf transacting department)
    FinancialDeptDCode varchar(10)    not null,
    FinancialDeptDName nvarchar(1000) not null,
    FinancialDeptECode varchar(10)    not null,
    FinancialDeptEName nvarchar(1000) not null,
    FinancialDeptFCode varchar(10)    not null,
    FinancialDeptFName nvarchar(1000) not null,
    FinancialDeptGCode varchar(10)    not null,
    FinancialDeptGName nvarchar(1000) not null,
    -- Other chart-string segments (never null in source; zero placeholders mean "none")
    Fund               varchar(20)    not null,
    FundName           nvarchar(1000) not null,
    Program            varchar(20)    not null,
    ProgramName        nvarchar(1000) not null,
    Activity           varchar(20)    not null,
    ActivityName       nvarchar(1000) not null,
    Project            varchar(20)    not null,
    ProjectName        nvarchar(max)  not null,
    NaturalAccount     varchar(20)    not null,
    NaturalAccountName nvarchar(1000) not null,
    -- Time
    PeriodName         varchar(10)    not null,  -- GL period as landed, e.g. 'Jul-25'
    FiscalYear         smallint       not null,  -- UC fiscal year (Jul-Jun)
    -- Measures (sign-normalized to positive)
    IncomeAmount       decimal(19, 2) not null constraint DF_GlSegmentMonthlyActuals_IncomeAmount default (0),
    ExpenseAmount      decimal(19, 2) not null constraint DF_GlSegmentMonthlyActuals_ExpenseAmount default (0),
    LoadedAt           datetime2(3)   not null constraint DF_GlSegmentMonthlyActuals_LoadedAt default (sysutcdatetime())
)
go

create clustered index IX_GlSegmentMonthlyActuals_DeptYearPeriod
    on dbo.GlSegmentMonthlyActuals (FinancialDeptGCode, FiscalYear, PeriodName)
go
