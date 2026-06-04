CREATE TABLE [dbo].[PpmProjects]
(
    [ProjectNumber]                VARCHAR(15)   NOT NULL,
    [OracleProjectId]              BIGINT        NULL,
    [Name]                         VARCHAR(512)  NOT NULL,
    [Description]                  VARCHAR(1024) NULL,
    [ProjectStartDate]             DATE          NOT NULL,
    [ProjectEndDate]               DATE          NOT NULL,
    [ProjectCompletionDate]        DATE          NULL,
    [ProjectStatus]                VARCHAR(32)   NOT NULL,
    [ProjectStatusCode]            VARCHAR(32)   NOT NULL,
    [ProjectOrganizationName]      VARCHAR(128)  NOT NULL,
    [BusinessUnitName]             VARCHAR(64)   NOT NULL,
    [LegalEntityName]              VARCHAR(64)   NOT NULL,
    [LegalEntityCode]              VARCHAR(8)    NOT NULL,
    [ProjectTypeName]              VARCHAR(64)   NOT NULL,
    [SourceApplicationCode]        VARCHAR(32)   NULL,
    [SourceProjectReference]       VARCHAR(128)  NULL,
    [ProjectCategory]              VARCHAR(16)   NOT NULL,
    [SponsoredProject]             BIT           NULL,
    [BillingEnabled]               BIT           NULL,
    [CapitalizationEnabled]        BIT           NULL,
    [TemplateProject]              BIT           NULL,
    [LastUpdateDateTime]           DATETIME2(3)  NOT NULL,
    [LastUpdateUserId]             VARCHAR(32)   NOT NULL,
    [ProjectBudgeted]              BIT           NULL,
    [HasBudgetaryControl]          BIT           NULL,
    [GlInfoAtTaskLevel]            BIT           NULL,
    [GlPostingEntityCode]          VARCHAR(8)    NOT NULL,
    [GlPostingFundCode]            VARCHAR(10)   NULL,
    [GlPostingDepartmentCode]      VARCHAR(10)   NOT NULL,
    [GlPostingPurposeCode]         VARCHAR(8)    NULL,
    [GlPostingProgramCode]         VARCHAR(8)    NULL,
    [GlPostingProjectCode]         VARCHAR(15)   NOT NULL,
    [GlPostingActivityCode]        VARCHAR(10)   NULL,
    [PrimaryProjectManagerEmail]   VARCHAR(128)  NULL,
    [PrimaryProjectManagerName]    VARCHAR(128)  NULL,
    CONSTRAINT [PK_PpmProjects]
        PRIMARY KEY CLUSTERED ([ProjectNumber])
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmProjects_ProjectStatus]
    ON [dbo].[PpmProjects] ([ProjectStatus])
    INCLUDE ([ProjectNumber], [Name], [ProjectStartDate], [ProjectEndDate], [PrimaryProjectManagerName]);
GO

CREATE NONCLUSTERED INDEX [IX_PpmProjects_GlPostingProjectCode]
    ON [dbo].[PpmProjects] ([GlPostingProjectCode])
    INCLUDE ([ProjectNumber], [Name], [ProjectStatus]);
GO
