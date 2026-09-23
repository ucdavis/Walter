-- Load target for pl_ucp_funding_entry_loader; usp_SwapStagingTable requires
-- this column list to match dbo.PositionBudgetsCognos exactly.
create table dbo.PositionBudgetsCognos_Staging
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
    LoadedAt             datetime2(3)  not null
)
go
