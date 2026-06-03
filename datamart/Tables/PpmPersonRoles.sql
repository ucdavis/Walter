CREATE TABLE [dbo].[PpmPersonRoles]
(
    [scope_type]         VARCHAR(16)      NOT NULL,
    [source]             VARCHAR(32)      NOT NULL,
    [project_number]     VARCHAR(15)      NOT NULL,
    [ppm_award_number]   VARCHAR(15)      NULL,
    [person_id]          BIGINT           NULL,
    [employee_id]        VARCHAR(16)      NOT NULL,
    [email]              VARCHAR(128)     NOT NULL,
    [name]               VARCHAR(128)     NOT NULL,
    [job_title]          VARCHAR(256)     NULL,
    [role_name]          VARCHAR(64)      NOT NULL,
    [start_date]         DATE             NOT NULL,
    [end_date]           DATE             NULL
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmPersonRoles_project_number_role_name]
    ON [dbo].[PpmPersonRoles] ([project_number], [role_name])
    INCLUDE ([scope_type], [ppm_award_number], [employee_id], [name], [email], [start_date], [end_date]);
GO

CREATE NONCLUSTERED INDEX [IX_PpmPersonRoles_employee_id_role_name]
    ON [dbo].[PpmPersonRoles] ([employee_id], [role_name])
    INCLUDE ([scope_type], [project_number], [ppm_award_number], [name], [email], [start_date], [end_date]);
GO
