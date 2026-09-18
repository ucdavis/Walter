-- Current position funding rows from the nightly Cognos "UCP-391 Funding Entry
-- Report" emails (four emails, one per school-division range), landed in the
-- CAES Datamart (Fabric) and loaded here by pl_ucp_funding_entry_loader via
-- PositionBudgetsCognos_Staging + usp_SwapStagingTable (full replace).
-- Same shape as dbo.PositionBudgets (which it is intended to replace) except
-- College, which holds "<School Division Code> - <School Division Description>"
-- and needs the wider column. UcPercentPay, NaturalAccount, TerminationDate
-- and JobEffectiveSequence have no Cognos source and are always null.
create table dbo.PositionBudgetsCognos
(
    College              nvarchar(100) not null,
    FiscalYear           smallint,
    PositionNumber       nvarchar(8)   not null,
    AccountCode          nvarchar(25)  not null,
    DistributionPercent  decimal(10, 4),
    FundingEndDate       date,
    FundingEffectiveDate date,
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
    EmployeeId           nvarchar(11),
    MonthlyRate          decimal(12, 2),
    ExpectedEndDate      date,
    Fte                  decimal(7, 6),
    CompFrequency        nvarchar(5),
    TerminationDate      date,
    Name                 nvarchar(100),
    PositionDescription  nvarchar(100),
    JobCode              nvarchar(10),
    LoadedAt             datetime2(3)  not null,
    constraint PK_PositionBudgetsCognos
        primary key (PositionNumber, AccountCode)
)
go
