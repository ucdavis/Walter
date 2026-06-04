CREATE TABLE [dbo].[People]
(
    [IamId]             CHAR(10)     NOT NULL,
    [EmployeeId]        CHAR(8)      NULL,
    [StudentId]         CHAR(9)      NULL,
    [ExternalId]        CHAR(10)     NULL,
    [FirstName]         VARCHAR(64)  NULL,
    [MiddleName]        VARCHAR(64)  NULL,
    [LastName]          VARCHAR(64)  NULL,
    [Suffix]            VARCHAR(16)  NULL,
    [FullName]          VARCHAR(128) NULL,
    [Pronouns]          VARCHAR(64)  NULL,
    [IsEmployee]        BIT          NULL,
    [IsHsEmployee]      BIT          NULL,
    [IsFaculty]         BIT          NULL,
    [IsStudent]         BIT          NULL,
    [IsStaff]           BIT          NULL,
    [IsExternal]        BIT          NULL,
    [PrivacyCode]       CHAR(1)      NULL,
    [IsCampusEmployee]  CHAR(1)      NULL,
    [UserId]            CHAR(8)      NULL,
    [Email]             VARCHAR(128) NULL,
    [ModifyDate]        DATETIME2(6) NULL,
    [ModifyDateRaw]     CHAR(19)     NULL,
    [FirstIngestedAt]   DATETIME2(6) NULL,
    [LastFetchedAt]     DATETIME2(6) NULL,
    [LastRunId]         CHAR(36)     NULL,
    [SourceEndpoint]    VARCHAR(128) NULL,
    [PromotedAt]        DATETIME2(6) NULL,
    [PromotionRunId]    CHAR(36)     NULL,
    CONSTRAINT [PK_People]
        PRIMARY KEY CLUSTERED ([IamId])
)
GO

CREATE NONCLUSTERED INDEX [IX_People_EmployeeId]
    ON [dbo].[People] ([EmployeeId])
    WHERE [EmployeeId] IS NOT NULL
GO
