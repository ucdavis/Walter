CREATE PROCEDURE dbo.usp_ParseProjectIdFilter
    @ProjectIds VARCHAR(MAX),
    @ProjectIdFilter NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId VARCHAR(15);
    DECLARE @ValidatedProjects TABLE (ProjectId VARCHAR(15));

    -- Parse comma-separated list into table, filtering out empty strings and literal 'null' values
    INSERT INTO @ValidatedProjects (ProjectId)
    SELECT TRIM(value)
    FROM STRING_SPLIT(@ProjectIds, ',')
    WHERE TRIM(value) <> '' AND LOWER(TRIM(value)) <> 'null';

    -- Validate that at least one project ID was provided
    IF NOT EXISTS (SELECT 1 FROM @ValidatedProjects)
    BEGIN
        RAISERROR('No valid project IDs provided', 16, 1);
        RETURN;
    END;

    -- Validate each project ID format
    DECLARE ProjectCursor CURSOR FOR
        SELECT ProjectId FROM @ValidatedProjects;
    OPEN ProjectCursor;
    FETCH NEXT FROM ProjectCursor INTO @ProjectId;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC dbo.usp_ValidateAggieEnterpriseProject @ProjectId;
        FETCH NEXT FROM ProjectCursor INTO @ProjectId;
    END;
    CLOSE ProjectCursor;
    DEALLOCATE ProjectCursor;

    -- Build IN clause filter string (e.g., 'K30GS7777','K30GS8888')
    SELECT @ProjectIdFilter = STRING_AGG('''' + ProjectId + '''', ',')
    FROM @ValidatedProjects;
END;
GO