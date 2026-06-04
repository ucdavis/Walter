CREATE TABLE [dbo].[PpmAwards_Staging]
(
    [PpmAwardNumber]                  VARCHAR(15)   NOT NULL,
    [OracleAwardId]                   BIGINT        NULL,
    [SponsorAwardNumber]              VARCHAR(60)   NOT NULL,
    [Name]                            VARCHAR(512)  NOT NULL,
    [Description]                     VARCHAR(4000) NULL,
    [AwardStatus]                     VARCHAR(30)   NOT NULL,
    [AwardType]                       VARCHAR(8)    NULL,
    [AwardTypeName]                   VARCHAR(64)   NOT NULL,
    [StartDate]                       DATE          NOT NULL,
    [EndDate]                         DATE          NOT NULL,
    [CloseDate]                       DATE          NOT NULL,
    [AwardOwningOrganizationName]     VARCHAR(128)  NOT NULL,
    [BusinessUnitName]                VARCHAR(64)   NOT NULL,
    [LastUpdateDateTime]              DATETIME2(3)  NOT NULL
);
GO
