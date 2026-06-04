CREATE TABLE [dbo].[PpmPeople]
(
    [PersonKey]     VARCHAR(30)       NOT NULL,
    [PersonId]      BIGINT            NULL,
    [EmployeeId]    VARCHAR(16)       NOT NULL,
    [Email]         VARCHAR(128)      NOT NULL,
    [Name]          VARCHAR(128)      NOT NULL,
    [JobTitle]      VARCHAR(256)      NULL,
    [LastSeenAt]    DATETIMEOFFSET(7) NOT NULL,
    CONSTRAINT [PK_PpmPeople]
        PRIMARY KEY CLUSTERED ([PersonKey])
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmPeople_EmployeeId]
    ON [dbo].[PpmPeople] ([EmployeeId])
    INCLUDE ([PersonKey], [Name], [Email]);
GO
