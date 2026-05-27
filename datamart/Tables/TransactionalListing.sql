CREATE TABLE dbo.TransactionalListing
(
    TransactionalListingId          BIGINT          IDENTITY(1, 1) NOT NULL,
    Entity                          NVARCHAR(20),
    EntityDescription               NVARCHAR(200),
    Fund                            NVARCHAR(20),
    FundDescription                 NVARCHAR(200),
    FinancialDepartment             NVARCHAR(20),
    FinancialDepartmentDescription  NVARCHAR(200),
    Account                         NVARCHAR(20),
    AccountDescription              NVARCHAR(200),
    Purpose                         NVARCHAR(20),
    PurposeDescription              NVARCHAR(200),
    Program                         NVARCHAR(20),
    ProgramDescription              NVARCHAR(200),
    Project                         NVARCHAR(30),
    ProjectDescription              NVARCHAR(400),
    Activity                        NVARCHAR(20),
    ActivityDescription             NVARCHAR(200),
    DocumentType                    NVARCHAR(50),
    AccountingSequenceNumber        NVARCHAR(50),
    TrackingNo                      NVARCHAR(100),
    Reference                       NVARCHAR(200),
    JournalLineDescription          NVARCHAR(400),
    JournalAcctDate                 DATE,
    JournalName                     NVARCHAR(200),
    JournalReference                NVARCHAR(200),
    PeriodName                      NVARCHAR(20),
    JournalBatchName                NVARCHAR(200),
    JournalSource                   NVARCHAR(100),
    JournalCategory                 NVARCHAR(100),
    BatchStatus                     NVARCHAR(50),
    ActualFlag                      NVARCHAR(10),
    EncumbranceTypeCode             NVARCHAR(50),
    ActualAmount                    DECIMAL(18, 2)  NOT NULL DEFAULT 0,
    CommitmentAmount                DECIMAL(18, 2)  NOT NULL DEFAULT 0,
    ObligationAmount                DECIMAL(18, 2)  NOT NULL DEFAULT 0,
    LoadedAt                        DATETIME2(3)    NOT NULL,
    -- ChartStringKey is the diff grain. AE source rows often have null
    -- AccountingSequenceNumber (encumbrances/POs), so we can't key off that.
    -- The 8-column chart string is always populated and gives us stable
    -- buckets to aggregate, diff, and replace by. COALESCE keeps NULL
    -- segments from producing NULL keys.
    ChartStringKey AS
    (
        CONCAT(
            COALESCE(Entity, ''),               N'-',
            COALESCE(Fund, ''),                 N'-',
            COALESCE(FinancialDepartment, ''),  N'-',
            COALESCE(Account, ''),              N'-',
            COALESCE(Purpose, ''),              N'-',
            COALESCE(Program, ''),              N'-',
            COALESCE(Project, ''),              N'-',
            COALESCE(Activity, '')
        )
    ) PERSISTED,
    CONSTRAINT PK_TransactionalListing
        PRIMARY KEY CLUSTERED (TransactionalListingId)
);
GO

-- Diff and swap path: aggregate / DELETE / scan-from-staging all hit ChartStringKey.
-- INCLUDE the three amount columns so the diff's per-chart-string aggregate
-- query is satisfied entirely by this index.
CREATE NONCLUSTERED INDEX IX_TransactionalListing_ChartStringKey
    ON dbo.TransactionalListing (ChartStringKey)
    INCLUDE (ActualAmount, CommitmentAmount, ObligationAmount);
GO

-- Consumer reads: every TL consumer sproc filters by Project.
CREATE NONCLUSTERED INDEX IX_TransactionalListing_Project
    ON dbo.TransactionalListing (Project);
GO
