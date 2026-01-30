CREATE TABLE [dbo].[AuditLog]
(
    [LogID] BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    [ProcedureName] NVARCHAR(128) NOT NULL,
    [ExecutedBy] NVARCHAR(128) NOT NULL,
    [ExecutedAt] DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    [Duration_MS] INT NULL,
    [RowCount] INT NULL,
    [Parameters] NVARCHAR(MAX) NULL,
    [ApplicationName] NVARCHAR(128) NULL,
    [ApplicationUser] NVARCHAR(256) NULL,
    [HostName] NVARCHAR(128) NULL,
    [DatabaseName] NVARCHAR(128) NULL,
    [SessionID] INT NULL,
    [Success] BIT NOT NULL DEFAULT 1,
    [ErrorMessage] NVARCHAR(MAX) NULL
);
