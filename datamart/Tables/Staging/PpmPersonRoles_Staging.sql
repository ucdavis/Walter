CREATE TABLE [dbo].[PpmPersonRoles_Staging]
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
