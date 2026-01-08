CREATE PROCEDURE dbo.usp_ValidateAggieEnterpriseProject
    @ProjectId VARCHAR(15)
AS
BEGIN
    SET NOCOUNT ON;

    IF @ProjectId IS NULL
    BEGIN
        RAISERROR('ProjectId is required', 16, 1);
        RETURN;
    END;

    -- Validate: exactly 10 alphanumeric characters
    IF LEN(@ProjectId) != 10 OR @ProjectId LIKE '%[^A-Z0-9]%'
    BEGIN
        RAISERROR('Invalid Project ID format (must be exactly 10 alphanumeric characters)', 16, 1);
        RETURN;
    END;
END;
GO