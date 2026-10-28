-- PPM expenditure-item detail for CAES departments from the nightly Cognos
-- "PPM Project Expenses" emails (five emails, one per financial-department
-- level-D partition), landed in the CAES Datamart (Fabric) and loaded here by
-- pl_ppm_project_costs_loader via PPMProjectCosts_Staging + usp_MergeStagingByScope
-- (scope SourcePartition, AccountingPeriod).
--
-- The report is a sliding window over the OPEN accounting periods. Each run
-- deletes and re-inserts only the (SourcePartition, AccountingPeriod) pairs
-- present in that night's files; closed periods that have dropped out of the
-- window are never touched again. This is why the table is never swapped or
-- truncated: it accumulates history (10M+ rows) and receives tens of
-- thousands of rows a night.
--
-- SourcePartition exists ONLY for load scoping (it is the level-D partition
-- name from the email subject). Consumers reach the department rollup by
-- joining ChartStringSegment on ExpenditureOrgCode. Coded report fields
-- ("CODE - Name") are split into Code/Name pairs so joins need no parsing.
-- ExpenditureCategoryCode/Name is PPM's own 01-09 classification per item
-- (same set as ExpenditureTypeByAccount); ExpenditureTypeCode is the natural
-- account. Award columns are null for internal (non-sponsored) projects; the
-- four Task chart fields are null on sponsored rows.
create table dbo.PPMProjectCosts
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
    LoadedAt                         datetime2(3)   not null,
    constraint PK_PPMProjectCosts
        primary key clustered (TransactionNumber)
)
go

-- Merge delete scope.
create nonclustered index IX_PPMProjectCosts_Scope
    on dbo.PPMProjectCosts (SourcePartition, AccountingPeriod)
go

-- Monthly-by-category rollup every consumer runs (project page, grant reports).
create nonclustered index IX_PPMProjectCosts_Project
    on dbo.PPMProjectCosts (ProjectNumber, AccountingPeriod, ExpenditureCategoryCode)
    include (RawCost, BurdenedCost)
go
