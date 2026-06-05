-- Returns People records that Walter can navigate by IAM ID and join to downstream Employee ID data.
CREATE PROCEDURE dbo.usp_GetSearchablePeople
    @SearchQuery NVARCHAR(128) = NULL,
    @IamId NVARCHAR(10) = NULL,
    @EmployeeId NVARCHAR(8) = NULL,
    @EmployeeIds VARCHAR(MAX) = NULL,
    @Email NVARCHAR(128) = NULL,
    @Limit INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NormalizedSearchQuery NVARCHAR(128) = NULLIF(LTRIM(RTRIM(@SearchQuery)), N'');
    DECLARE @NormalizedIamId NVARCHAR(10) = NULLIF(LTRIM(RTRIM(@IamId)), N'');
    DECLARE @NormalizedEmployeeId NVARCHAR(8) = NULLIF(LTRIM(RTRIM(@EmployeeId)), N'');
    DECLARE @NormalizedEmployeeIds VARCHAR(MAX) = NULLIF(LTRIM(RTRIM(@EmployeeIds)), '');
    DECLARE @NormalizedEmail NVARCHAR(128) = NULLIF(LOWER(LTRIM(RTRIM(@Email))), N'');
    DECLARE @LikeQuery NVARCHAR(130);
    DECLARE @StartsWithQuery NVARCHAR(129);
    DECLARE @ResultLimit INT = 2147483647;
    DECLARE @CanReturnRows BIT = 0;

    IF @NormalizedSearchQuery IS NOT NULL
    BEGIN
        IF LEN(@NormalizedSearchQuery) < 3 OR ISNULL(@Limit, 0) <= 0
        BEGIN
            SELECT
                CAST(NULL AS NVARCHAR(10)) AS IamId,
                CAST(NULL AS NVARCHAR(8)) AS EmployeeId,
                CAST(NULL AS NVARCHAR(128)) AS Name,
                CAST(NULL AS NVARCHAR(128)) AS Email
            WHERE 1 = 0;
            RETURN;
        END;

        SET @LikeQuery = N'%' + @NormalizedSearchQuery + N'%';
        SET @StartsWithQuery = @NormalizedSearchQuery + N'%';
        SET @ResultLimit = CASE WHEN @Limit > 100 THEN 100 ELSE @Limit END;
        SET @CanReturnRows = 1;
    END;

    IF @NormalizedIamId IS NOT NULL
       OR @NormalizedEmployeeId IS NOT NULL
       OR @NormalizedEmployeeIds IS NOT NULL
       OR @NormalizedEmail IS NOT NULL
    BEGIN
        SET @CanReturnRows = 1;
    END;

    WITH NormalizedPeople AS (
        SELECT
            NULLIF(LTRIM(RTRIM(IamId)), '') AS IamId,
            NULLIF(LTRIM(RTRIM(EmployeeId)), '') AS EmployeeId,
            NULLIF(LTRIM(RTRIM(FirstName)), '') AS FirstName,
            NULLIF(LTRIM(RTRIM(LastName)), '') AS LastName,
            NULLIF(LTRIM(RTRIM(FullName)), '') AS FullName,
            NULLIF(LTRIM(RTRIM(Email)), '') AS Email,
            NULLIF(LTRIM(RTRIM(UserId)), '') AS UserId
        FROM dbo.People
    ),
    SearchablePeople AS (
        SELECT
            IamId,
            EmployeeId,
            COALESCE(
                FullName,
                NULLIF(CONCAT(
                    COALESCE(FirstName, ''),
                    CASE WHEN FirstName IS NOT NULL AND LastName IS NOT NULL THEN ' ' ELSE '' END,
                    COALESCE(LastName, '')
                ), ''),
                IamId
            ) AS Name,
            Email,
            FirstName,
            LastName,
            FullName,
            UserId
        FROM NormalizedPeople
        WHERE IamId IS NOT NULL
          AND EmployeeId IS NOT NULL
    )
    SELECT
        IamId,
        EmployeeId,
        Name,
        Email
    FROM SearchablePeople p
    WHERE @CanReturnRows = 1
      AND (
           (@NormalizedSearchQuery IS NOT NULL AND (
                p.FullName LIKE @LikeQuery
             OR p.FirstName LIKE @LikeQuery
             OR p.LastName LIKE @LikeQuery
             OR p.Email LIKE @LikeQuery
             OR p.UserId LIKE @LikeQuery
             OR p.IamId LIKE @LikeQuery
           ))
        OR (@NormalizedIamId IS NOT NULL AND p.IamId = @NormalizedIamId)
        OR (@NormalizedEmployeeId IS NOT NULL AND p.EmployeeId = @NormalizedEmployeeId)
        OR (@NormalizedEmail IS NOT NULL AND LOWER(p.Email) = @NormalizedEmail)
        OR (@NormalizedEmployeeIds IS NOT NULL AND EXISTS (
            SELECT 1
            FROM STRING_SPLIT(@NormalizedEmployeeIds, ',') ids
            WHERE LTRIM(RTRIM(ids.value)) = p.EmployeeId
        ))
      )
    ORDER BY
        CASE
            WHEN @NormalizedSearchQuery IS NOT NULL AND p.FullName LIKE @StartsWithQuery THEN 0
            WHEN @NormalizedSearchQuery IS NOT NULL AND p.Email LIKE @StartsWithQuery THEN 1
            ELSE 2
        END,
        p.FullName,
        p.Email,
        p.IamId
    OFFSET 0 ROWS FETCH NEXT @ResultLimit ROWS ONLY;
END;
GO
