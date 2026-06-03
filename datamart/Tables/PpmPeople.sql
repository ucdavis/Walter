CREATE TABLE [dbo].[PpmPeople]
(
    [person_key]     VARCHAR(30)       NOT NULL,
    [person_id]      BIGINT            NULL,
    [employee_id]    VARCHAR(16)       NOT NULL,
    [email]          VARCHAR(128)      NOT NULL,
    [name]           VARCHAR(128)      NOT NULL,
    [job_title]      VARCHAR(256)      NULL,
    [last_seen_at]   DATETIMEOFFSET(7) NOT NULL,
    CONSTRAINT [PK_PpmPeople]
        PRIMARY KEY CLUSTERED ([person_key])
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmPeople_employee_id]
    ON [dbo].[PpmPeople] ([employee_id])
    INCLUDE ([person_key], [name], [email]);
GO
