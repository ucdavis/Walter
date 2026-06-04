CREATE TABLE [dbo].[PpmPersonRoles]
(
    [ScopeType]       VARCHAR(16)  NOT NULL,
    [Source]          VARCHAR(32)  NOT NULL,
    [ProjectNumber]   VARCHAR(15)  NOT NULL,
    [PpmAwardNumber]  VARCHAR(15)  NULL,
    [PersonId]        BIGINT       NULL,
    [EmployeeId]      VARCHAR(16)  NOT NULL,
    [Email]           VARCHAR(128) NOT NULL,
    [Name]            VARCHAR(128) NOT NULL,
    [JobTitle]        VARCHAR(256) NULL,
    [RoleName]        VARCHAR(64)  NOT NULL,
    [StartDate]       DATE         NOT NULL,
    [EndDate]         DATE         NULL
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmPersonRoles_ProjectNumber_RoleName]
    ON [dbo].[PpmPersonRoles] ([ProjectNumber], [RoleName])
    INCLUDE ([ScopeType], [PpmAwardNumber], [EmployeeId], [Name], [Email], [StartDate], [EndDate]);
GO

CREATE NONCLUSTERED INDEX [IX_PpmPersonRoles_EmployeeId_RoleName]
    ON [dbo].[PpmPersonRoles] ([EmployeeId], [RoleName])
    INCLUDE ([ScopeType], [ProjectNumber], [PpmAwardNumber], [Name], [Email], [StartDate], [EndDate]);
GO
