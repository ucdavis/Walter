CREATE PROCEDURE dbo.usp_SanitizeInputString
    @InputString NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Return NULL as-is
    IF @InputString IS NULL
        RETURN;

    DECLARE @CleanString NVARCHAR(MAX) = '';
    DECLARE @i INT = 1;
    DECLARE @Char NCHAR(1);

    -- Loop through all characters and keep if it's alphanumeric or a space.
    -- Once we upgrade to SQL Server 2025 we can use REGEXP_REPLACE
    WHILE @i <= LEN(@InputString)
    BEGIN
        SET @Char = SUBSTRING(@InputString, @i, 1);

        IF @Char LIKE '[A-Za-z0-9 ]'
            SET @CleanString = @CleanString + @Char;

        SET @i = @i + 1;
    END;

    SET @InputString = @CleanString;
END;
GO