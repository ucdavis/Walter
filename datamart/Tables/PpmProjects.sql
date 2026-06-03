CREATE TABLE [dbo].[PpmProjects]
(
    [project_number]                VARCHAR(15)       NOT NULL,
    [oracle_project_id]             BIGINT            NULL,
    [name]                          VARCHAR(512)      NOT NULL,
    [description]                   VARCHAR(1024)     NULL,
    [project_start_date]            DATE              NOT NULL,
    [project_end_date]              DATE              NOT NULL,
    [project_completion_date]       DATE              NULL,
    [project_status]                VARCHAR(32)       NOT NULL,
    [project_status_code]           VARCHAR(32)       NOT NULL,
    [project_organization_name]     VARCHAR(128)      NOT NULL,
    [business_unit_name]            VARCHAR(64)       NOT NULL,
    [legal_entity_name]             VARCHAR(64)       NOT NULL,
    [legal_entity_code]             VARCHAR(8)        NOT NULL,
    [project_type_name]             VARCHAR(64)       NOT NULL,
    [source_application_code]       VARCHAR(32)       NULL,
    [source_project_reference]      VARCHAR(128)      NULL,
    [project_category]              VARCHAR(16)       NOT NULL,
    [sponsored_project]             BIT              NULL,
    [billing_enabled]               BIT              NULL,
    [capitalization_enabled]        BIT              NULL,
    [template_project]              BIT              NULL,
    [last_update_datetime]          DATETIME2(3)      NOT NULL,
    [last_update_user_id]           VARCHAR(32)       NOT NULL,
    [project_budgeted]              BIT              NULL,
    [has_budgetary_control]         BIT              NULL,
    [gl_info_at_task_level]         BIT              NULL,
    [gl_posting_entity_code]        VARCHAR(8)        NOT NULL,
    [gl_posting_fund_code]          VARCHAR(10)       NULL,
    [gl_posting_department_code]    VARCHAR(10)       NOT NULL,
    [gl_posting_purpose_code]       VARCHAR(8)        NULL,
    [gl_posting_program_code]       VARCHAR(8)        NULL,
    [gl_posting_project_code]       VARCHAR(15)       NOT NULL,
    [gl_posting_activity_code]      VARCHAR(10)       NULL,
    [primary_project_manager_email] VARCHAR(128)      NULL,
    [primary_project_manager_name]  VARCHAR(128)      NULL,
    [synced_at]                     DATETIMEOFFSET(7) NOT NULL,
    CONSTRAINT [PK_PpmProjects]
        PRIMARY KEY CLUSTERED ([project_number])
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmProjects_project_status]
    ON [dbo].[PpmProjects] ([project_status])
    INCLUDE ([project_number], [name], [project_start_date], [project_end_date], [primary_project_manager_name]);
GO

CREATE NONCLUSTERED INDEX [IX_PpmProjects_gl_posting_project_code]
    ON [dbo].[PpmProjects] ([gl_posting_project_code])
    INCLUDE ([project_number], [name], [project_status]);
GO
