CREATE TABLE [dbo].[People]
(
    [iamId]             CHAR(10)      NOT NULL,
    [employeeId]        CHAR(8)       NULL,
    [studentId]         CHAR(9)       NULL,
    [externalId]        CHAR(10)      NULL,
    [firstName]         VARCHAR(64)   NULL,
    [middleName]        VARCHAR(64)   NULL,
    [lastName]          VARCHAR(64)   NULL,
    [suffix]            VARCHAR(16)   NULL,
    [fullName]          VARCHAR(128)  NULL,
    [pronouns]          VARCHAR(64)   NULL,
    [isEmployee]        BIT           NULL,
    [isHSEmployee]      BIT           NULL,
    [isFaculty]         BIT           NULL,
    [isStudent]         BIT           NULL,
    [isStaff]           BIT           NULL,
    [isExternal]        BIT           NULL,
    [privacyCode]       CHAR(1)       NULL,
    [isCampusEmployee]  CHAR(1)       NULL,
    [userId]            CHAR(8)       NULL,
    [email]             VARCHAR(128)  NULL,
    [modifyDate]        DATETIME2(6)  NULL,
    [modifyDateRaw]     CHAR(19)      NULL,
    [first_ingested_at] DATETIME2(6)  NULL,
    [last_fetched_at]   DATETIME2(6)  NULL,
    [last_run_id]       CHAR(36)      NULL,
    [source_endpoint]   VARCHAR(128)  NULL,
    [promoted_at]       DATETIME2(6)  NULL,
    [promotion_run_id]  CHAR(36)      NULL,
    CONSTRAINT [PK_People]
        PRIMARY KEY CLUSTERED ([iamId])
)
GO

CREATE NONCLUSTERED INDEX [IX_People_employeeId]
    ON [dbo].[People] ([employeeId])
    WHERE [employeeId] IS NOT NULL
GO
