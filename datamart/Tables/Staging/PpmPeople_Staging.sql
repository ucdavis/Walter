CREATE TABLE [dbo].[PpmPeople_Staging]
(
    [PersonKey]     VARCHAR(30)       NOT NULL,
    [PersonId]      BIGINT            NULL,
    [EmployeeId]    VARCHAR(16)       NOT NULL,
    [Email]         VARCHAR(128)      NOT NULL,
    [Name]          VARCHAR(128)      NOT NULL,
    [JobTitle]      VARCHAR(256)      NULL,
    [LastSeenAt]    DATETIMEOFFSET(7) NOT NULL
);
GO
