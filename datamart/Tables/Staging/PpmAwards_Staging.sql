CREATE TABLE [dbo].[PpmAwards_Staging]
(
    [ppm_award_number]                  VARCHAR(15)   NOT NULL,
    [oracle_award_id]                   BIGINT        NULL,
    [sponsor_award_number]              VARCHAR(60)   NOT NULL,
    [name]                              VARCHAR(512)  NOT NULL,
    [description]                       VARCHAR(4000) NULL,
    [award_status]                      VARCHAR(30)   NOT NULL,
    [award_type]                        VARCHAR(8)    NULL,
    [award_type_name]                   VARCHAR(64)   NOT NULL,
    [start_date]                        DATE          NOT NULL,
    [end_date]                          DATE          NOT NULL,
    [close_date]                        DATE          NOT NULL,
    [award_owning_organization_name]    VARCHAR(128)  NOT NULL,
    [business_unit_name]                VARCHAR(64)   NOT NULL,
    [last_update_datetime]              DATETIME2(3)  NOT NULL
);
GO
