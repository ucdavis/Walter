CREATE PROCEDURE [dbo].[usp_LogProcedureExecution]
    @ProcedureName NVARCHAR(128),
    @ExecutedBy NVARCHAR(128) = NULL,
    @Duration_MS INT = NULL,
    @RowCount INT = NULL,
    @Parameters NVARCHAR(MAX) = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @ApplicationUser NVARCHAR(256) = NULL,
    @Success BIT = 1,
    @ErrorMessage NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Default ExecutedBy to current user if not provided
    IF @ExecutedBy IS NULL
        SET @ExecutedBy = COALESCE(ORIGINAL_LOGIN(), SYSTEM_USER);

    -- Default ApplicationName to APP_NAME() if not provided
    IF @ApplicationName IS NULL
        SET @ApplicationName = APP_NAME();

    INSERT INTO [dbo].[AuditLog]
    (
        [ProcedureName],
        [ExecutedBy],
        [ExecutedAt],
        [Duration_MS],
        [RowCount],
        [Parameters],
        [ApplicationName],
        [ApplicationUser],
        [HostName],
        [DatabaseName],
        [SessionID],
        [Success],
        [ErrorMessage]
    )
    VALUES
    (
        @ProcedureName,
        @ExecutedBy,
        SYSDATETIME(),
        @Duration_MS,
        @RowCount,
        @Parameters,
        @ApplicationName,
        @ApplicationUser,
        HOST_NAME(),
        DB_NAME(),
        @@SPID,
        @Success,
        @ErrorMessage
    );
END;
GO