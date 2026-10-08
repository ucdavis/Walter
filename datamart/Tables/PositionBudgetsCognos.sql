-- Position funding rows from the nightly Cognos "UCP-391 Funding Entry Report"
-- emails (four emails, one per school-division range), landed in the CAES
-- Datamart (Fabric) and loaded here by pl_ucp_funding_entry_loader via
-- PositionBudgetsCognos_Staging + usp_SwapStagingTable (full replace).
-- Intended to replace dbo.PositionBudgets. Differences: ComboCode is that
-- table's AccountCode (the PeopleSoft combo code); College holds
-- "<School Division Code> - <School Division Description>"; one row per
-- employee on a position; IsFuture marks entries whose FundingEffectiveDate
-- was after the load date (IsFuture = 0 is the entry in effect at load).
-- UcPercentPay, NaturalAccount, TerminationDate and JobEffectiveSequence have
-- no Cognos source and are always null.
-- One row per earn code per combo: EarnCode is the 391 earn code ('' for the
-- default distribution); EarnCodeShare is that earn code's share of the
-- person's pay from the UCP-310 (1 when not split), so a line's salary is
-- MonthlyRate * EarnCodeShare * Fte * DistributionPercent / 100. MonthlyRate
-- stays the full 1.0-FTE rate on every line. EarnCodeStatus: BaseOnly (only
-- HSR/REG/default funding), Split (shares from the 310), Unsplit (other earn
-- codes funded but no 310 for the person: whole rate on base pay).
create table dbo.PositionBudgetsCognos
(
    College              nvarchar(100) not null,
    FiscalYear           smallint,
    PositionNumber       nvarchar(8)   not null,
    ComboCode            nvarchar(25)  not null,
    DistributionPercent  decimal(10, 4),
    FundingEndDate       date,
    FundingEffectiveDate date          not null,
    UcPercentPay         decimal(10, 4),
    NaturalAccount       nvarchar(10),
    FinancialDept        nvarchar(10),
    ProjectId            nvarchar(15),
    Task                 nvarchar(15),
    FundCode             nvarchar(10),
    ProgramCode          nvarchar(10),
    Purpose              nvarchar(10),
    Activity             nvarchar(10),
    Award                nvarchar(15),
    JobEffectiveDate     date,
    JobEffectiveSequence smallint,
    EmployeeId           nvarchar(11)  not null,
    MonthlyRate          decimal(12, 2),
    ExpectedEndDate      date,
    Fte                  decimal(7, 6),
    CompFrequency        nvarchar(5),
    TerminationDate      date,
    Name                 nvarchar(100),
    PositionDescription  nvarchar(100),
    JobCode              nvarchar(10),
    IsFuture             bit           not null,
    EarnCode             nvarchar(5)   not null
        constraint DF_PositionBudgetsCognos_EarnCode default (''),
    EarnCodeShare        decimal(9, 8) not null
        constraint DF_PositionBudgetsCognos_EarnCodeShare default (1),
    EarnCodeStatus       nvarchar(10)  not null
        constraint DF_PositionBudgetsCognos_EarnCodeStatus default ('BaseOnly'),
    LoadedAt             datetime2(3)  not null,
    constraint PK_PositionBudgetsCognos
        primary key (PositionNumber, ComboCode, EmployeeId, FundingEffectiveDate, EarnCode)
)
go

-- At most one current entry per position/combo/employee/earn code; future entries may stack.
create unique nonclustered index UX_PositionBudgetsCognos_Current
    on dbo.PositionBudgetsCognos (PositionNumber, ComboCode, EmployeeId, EarnCode)
    where IsFuture = 0
go
