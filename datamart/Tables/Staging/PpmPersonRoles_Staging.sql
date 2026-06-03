CREATE TABLE [dbo].[PpmPersonRoles_Staging]
(
    [scope_type]         VARCHAR(16)  NOT NULL,
    [source]             VARCHAR(32)  NOT NULL,
    [project_number]     VARCHAR(15)  NOT NULL,
    [ppm_award_number]   VARCHAR(15)  NULL,
    [person_id]          BIGINT       NULL,
    [employee_id]        VARCHAR(16)  NOT NULL,
    [email]              VARCHAR(128) NOT NULL,
    [name]               VARCHAR(128) NOT NULL,
    [job_title]          VARCHAR(256) NULL,
    [role_name]          VARCHAR(64)  NOT NULL,
    [start_date]         DATE         NOT NULL,
    [end_date]           DATE         NULL
);
GO
