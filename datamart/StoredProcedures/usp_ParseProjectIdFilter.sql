CREATE PROCEDURE dbo.usp_ParseProjectIdFilter
    @ProjectIds VARCHAR(MAX),
    @ProjectIdFilter NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Parse comma-separated list into table, filtering out empty strings and literal 'null' values.
    -- Stage at full width so an over-length element is rejected by the format check below rather
    -- than being silently truncated into a valid-looking id.
    DECLARE @Projects TABLE (ProjectId VARCHAR(4000));

    INSERT INTO @Projects (ProjectId)
    SELECT TRIM(value)
    FROM STRING_SPLIT(@ProjectIds, ',')
    WHERE TRIM(value) <> '' AND LOWER(TRIM(value)) <> 'null';

    -- Validate that at least one project ID was provided
    IF NOT EXISTS (SELECT 1 FROM @Projects)
        THROW 50000, 'No valid project IDs provided', 1;

    -- Security boundary: every id is quoted and concatenated into the IN (...) clause of dynamic
    -- SQL that callers run locally and against the Redshift/Oracle linked servers. Reject the whole
    -- request unless every id is exactly 10 alphanumeric characters, so a value carrying quotes or
    -- parentheses can never reach the generated query. THROW aborts before the filter is built.
    IF EXISTS (SELECT 1 FROM @Projects
               WHERE LEN(ProjectId) <> 10 OR ProjectId LIKE '%[^A-Za-z0-9]%')
        THROW 50000, 'Invalid Project ID format (must be exactly 10 alphanumeric characters)', 1;

    -- Build IN clause filter string (e.g., 'FPAFST5328','K30BND3F03').
    -- CAST the element to NVARCHAR(MAX) so STRING_AGG returns a LOB result; with a non-MAX
    -- input the aggregate caps at 8000 bytes and silently truncates large project lists,
    -- producing a malformed IN clause.
    SELECT @ProjectIdFilter = STRING_AGG(CAST('''' + ProjectId + '''' AS NVARCHAR(MAX)), ',')
    FROM @Projects;
END;
GO
