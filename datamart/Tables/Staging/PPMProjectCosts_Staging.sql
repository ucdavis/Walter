-- Landing table for pl_ppm_project_costs_loader: the Copy activity clears it
-- (pre-copy DELETE) and bulk-inserts ONLY the rows touched by that night's
-- run (the silver run table), then usp_MergePPMProjectCosts applies them to
-- PPMProjectCosts by (SourcePartition, AccountingPeriod) scope. Never holds
-- the full history. Column list must match PPMProjectCosts byte for byte.
create table dbo.PPMProjectCosts_Staging
(
    TransactionNumber                bigint         not null,  -- PPM expenditure item id
    AwardNumber                      nvarchar(30)   null,
    AwardName                        nvarchar(500)  null,
    AwardType                        nvarchar(200)  null,
    AwardStatus                      nvarchar(30)   null,
    AwardStartDate                   date           null,
    AwardEndDate                     date           null,
    ProjectNumber                    nvarchar(30)   not null,
    ProjectName                      nvarchar(500)  not null,
    ProjectBusinessUnit              nvarchar(100)  not null,
    ProjectOwningOrgCode             nvarchar(20)   not null,
    ProjectOwningOrgName             nvarchar(255)  not null,
    ProjectType                      nvarchar(100)  not null,
    ProjectStatus                    nvarchar(30)   not null,
    ProjectStartDate                 date           not null,
    ProjectEndDate                   date           null,
    TaskNumber                       nvarchar(30)   not null,
    TaskName                         nvarchar(500)  not null,
    TaskStatus                       nvarchar(30)   not null,
    TaskFundCode                     nvarchar(20)   null,
    TaskFundName                     nvarchar(255)  null,
    TaskPurposeCode                  nvarchar(20)   null,
    TaskPurposeName                  nvarchar(255)  null,
    TaskProgramCode                  nvarchar(20)   null,
    TaskProgramName                  nvarchar(255)  null,
    TaskActivityCode                 nvarchar(20)   null,
    TaskActivityName                 nvarchar(255)  null,
    ExpenditureBusinessUnit          nvarchar(100)  not null,
    ExpenditureOrgCode               nvarchar(20)   not null,  -- join key to ChartStringSegment (fin dept)
    ExpenditureOrgName               nvarchar(255)  not null,
    ExpenditureCategoryCode          nvarchar(20)   not null,  -- '01'..'09'
    ExpenditureCategoryName          nvarchar(255)  not null,
    ExpenditureTypeCode              nvarchar(20)   not null,  -- natural account
    ExpenditureTypeName              nvarchar(255)  not null,
    ExpenditureBatch                 nvarchar(500)  not null,
    ExpenditureItemDate              date           not null,
    AccountingPeriod                 varchar(10)    not null,  -- as landed, e.g. 'Sep-26'
    AccountingDate                   date           not null,
    Document                         nvarchar(100)  not null,
    DocumentEntry                    nvarchar(255)  not null,
    SourceTransactionNumber          bigint         null,
    TransferredFromTransactionNumber bigint         null,
    AdjustingItem                    nvarchar(50)   null,
    Comment                          nvarchar(1000) null,
    Billable                         nvarchar(10)   not null,
    InvoicedStatus                   nvarchar(50)   not null,
    RevenueStatus                    nvarchar(50)   not null,
    RawCost                          decimal(18, 2) not null,
    BurdenedCost                     decimal(18, 2) not null,
    SourcePartition                  varchar(50)    not null,  -- load scoping only
    LoadedAt                         datetime2(3)   not null
)
go
