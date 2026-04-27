using System.Text.Json.Serialization;
using AggieEnterpriseApi;
using AggieEnterpriseApi.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using Microsoft.Kiota.Abstractions;
using server.core.Data;
using server.core.Services;
using server.Helpers;
using server.Services;
using Server.Services;

namespace Server.Controllers;

public sealed class SearchController : ApiControllerBase
{
    // Marks synthetic person IDs emitted by fallback search when Graph IDs are unavailable.
    private const string SyntheticEmployeeIdPrefix = "employee:";
    private const int SearchResultLimit = 5;

    private readonly AppDbContext _dbContext;
    private readonly IFinancialApiService _financialApiService;
    private readonly IAuthorizationService _authorizationService;
    private readonly IGraphService _graphService;
    private readonly IIdentityService _identityService;
    private readonly ILogger<SearchController> _logger;

    public SearchController(
        AppDbContext dbContext,
        IFinancialApiService financialApiService,
        IAuthorizationService authorizationService,
        IGraphService graphService,
        IIdentityService identityService,
        ILogger<SearchController> logger)
    {
        _dbContext = dbContext;
        _financialApiService = financialApiService;
        _authorizationService = authorizationService;
        _graphService = graphService;
        _identityService = identityService;
        _logger = logger;
    }

    public sealed record SearchProject(
        [property: JsonPropertyName("projectNumber")] string ProjectNumber,
        [property: JsonPropertyName("projectName")] string ProjectName,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords,
        [property: JsonPropertyName("projectPiEmployeeId")]
        string? ProjectPiEmployeeId = null);

    public sealed record SearchReport(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("label")] string Label,
        [property: JsonPropertyName("to")] string To,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords);

    public sealed record SearchCatalog(
        [property: JsonPropertyName("projects")] IReadOnlyList<SearchProject> Projects,
        [property: JsonPropertyName("reports")] IReadOnlyList<SearchReport> Reports);

    public sealed record SearchPerson(
        [property: JsonPropertyName("employeeId")] string EmployeeId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords);

    public sealed record SearchDirectoryPerson(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("email")] string? Email,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords);

    public sealed record SearchTeamMemberProjectsResponse(
        [property: JsonPropertyName("myProjects")] IReadOnlyList<SearchProject> MyProjects,
        [property: JsonPropertyName("myManagedProjects")] IReadOnlyList<SearchProject> MyManagedProjects,
        [property: JsonPropertyName("projects")] IReadOnlyList<SearchProject> Projects,
        [property: JsonPropertyName("principalInvestigators")] IReadOnlyList<SearchPerson> PrincipalInvestigators);

    public sealed record ResolveDirectoryPersonResponse(
        [property: JsonPropertyName("employeeId")] string EmployeeId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("email")] string? Email);

    public sealed record ResolveProjectPiResponse(
        [property: JsonPropertyName("employeeId")] string EmployeeId,
        [property: JsonPropertyName("projectNumber")] string ProjectNumber);

    [HttpGet("catalog")]
    public async Task<IActionResult> GetCatalog(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var reports = new List<SearchReport>();

        var canViewAccruals = await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            AuthorizationHelper.Policies.CanViewAccruals);

        if (canViewAccruals.Succeeded)
        {
            reports.Add(new SearchReport(
                "accruals",
                "Employee Vacation Accruals",
                "/accruals",
                ["accruals", "vacation", "leave", "report"]
            ));
        }

        reports.Add(new SearchReport(
            "personnel",
            "My Personnel Report",
            "/personnel",
            ["personnel", "payroll"]
        ));

        // Only surface "All Reports" if the user can actually see something on /reports.
        // Today that means CanViewAccruals; revisit when more reports land on that page.
        if (canViewAccruals.Succeeded)
        {
            reports.Add(new SearchReport(
                "reports",
                "All Reports",
                "/reports",
                ["reports", "all reports"]
            ));
        }

        return Ok(new SearchCatalog(Array.Empty<SearchProject>(), reports));
    }

    [HttpGet("people")]
    public async Task<IActionResult> SearchPeople([FromQuery] string? query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!await HasFinancialAccessAsync())
        {
            return Ok(Array.Empty<SearchDirectoryPerson>());
        }

        var normalizedQuery = query?.Trim() ?? string.Empty;
        if (normalizedQuery.Length < 3)
        {
            return Ok(Array.Empty<SearchDirectoryPerson>());
        }

        try
        {
            var results = await _graphService.SearchUsersAsync(User, normalizedQuery, cancellationToken);
            var mapped = results
                .Where(r => !string.IsNullOrWhiteSpace(r.Id))
                .Select(r =>
                {
                    var name = r.DisplayName?.Trim();
                    var email = r.Email?.Trim();
                    var displayValue = !string.IsNullOrWhiteSpace(name)
                        ? name
                        : !string.IsNullOrWhiteSpace(email)
                            ? email
                            : r.Id;

                    return new SearchDirectoryPerson(
                        Id: r.Id,
                        Name: displayValue,
                        Email: email,
                        Keywords: BuildKeywords(name, email));
                })
                .Take(SearchResultLimit)
                .ToArray();

            return Ok(mapped);
        }
        catch (MicrosoftIdentityWebChallengeUserException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for search people.");
            var fallback = await SearchManagedPeopleFallbackAsync(normalizedQuery, cancellationToken);
            return Ok(fallback);
        }
        catch (MsalUiRequiredException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for search people.");
            var fallback = await SearchManagedPeopleFallbackAsync(normalizedQuery, cancellationToken);
            return Ok(fallback);
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Microsoft Graph people search failed.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unexpected error searching people.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    [HttpGet("people/resolve")]
    public async Task<IActionResult> ResolvePersonByDirectoryId([FromQuery] string? userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!await HasFinancialAccessAsync())
        {
            return Forbid();
        }

        var normalizedUserId = userId?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedUserId))
        {
            return BadRequest("userId is required.");
        }

        if (normalizedUserId.StartsWith(SyntheticEmployeeIdPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var employeeId = normalizedUserId[SyntheticEmployeeIdPrefix.Length..].Trim();
            if (string.IsNullOrWhiteSpace(employeeId))
            {
                return NotFound();
            }

            return Ok(new ResolveDirectoryPersonResponse(employeeId, employeeId, null));
        }

        GraphUserProfile? profile;
        try
        {
            profile = await _graphService.GetUserProfileAsync(User, normalizedUserId, cancellationToken);
        }
        catch (MicrosoftIdentityWebChallengeUserException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for resolve person.");
            return NotFound();
        }
        catch (MsalUiRequiredException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for resolve person.");
            return NotFound();
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Microsoft Graph profile lookup failed during person resolve.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        if (profile is null || string.IsNullOrWhiteSpace(profile.IamId))
        {
            return NotFound();
        }

        IamIdentity? identity;
        try
        {
            identity = await _identityService.GetByIamId(profile.IamId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "IAM lookup failed while resolving person for IAM ID '{IamId}'.", profile.IamId);
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        if (identity is null || string.IsNullOrWhiteSpace(identity.EmployeeId))
        {
            return NotFound();
        }

        var resolvedName = !string.IsNullOrWhiteSpace(profile.DisplayName)
            ? profile.DisplayName
            : !string.IsNullOrWhiteSpace(identity.FullName)
                ? identity.FullName
                : profile.Email ?? identity.EmployeeId;

        return Ok(new ResolveDirectoryPersonResponse(identity.EmployeeId, resolvedName, profile.Email));
    }

    [HttpGet("projects")]
    public async Task<IActionResult> SearchProjects([FromQuery] string? query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!await HasFinancialAccessAsync())
        {
            return Ok(Array.Empty<SearchProject>());
        }

        var normalizedQuery = query?.Trim() ?? string.Empty;
        if (normalizedQuery.Length < 3)
        {
            return Ok(Array.Empty<SearchProject>());
        }

        var client = _financialApiService.GetClient();
        var fuzzyQuery = ToFuzzyQuery(normalizedQuery);
        var exactLookupQuery = ToUpperTrim(normalizedQuery);

        var byNameTask = client.PpmProjectSearch.ExecuteAsync(
            new PpmProjectFilterInput
            {
                Name = new StringFilterInput
                {
                    Contains = fuzzyQuery,
                },
            },
            exactLookupQuery,
            cancellationToken);

        var byProjectNumberTask = client.PpmProjectSearch.ExecuteAsync(
            new PpmProjectFilterInput
            {
                ProjectNumber = new StringFilterInput
                {
                    Contains = fuzzyQuery,
                },
            },
            exactLookupQuery,
            cancellationToken);

        await Task.WhenAll(byNameTask, byProjectNumberTask);

        var byNameData = byNameTask.Result.ReadData();
        var byProjectNumberData = byProjectNumberTask.Result.ReadData();

        var byNameProjects = (byNameData.PpmProjectSearch?.Data ?? [])
            .Where(p => !string.IsNullOrWhiteSpace(p.ProjectNumber))
            .Select(p => new SearchProject(
                p.ProjectNumber,
                p.Name ?? string.Empty,
                BuildKeywords(p.Name, p.ProjectNumber)));

        var byProjectNumberProjects = (byProjectNumberData.PpmProjectSearch?.Data ?? [])
            .Where(p => !string.IsNullOrWhiteSpace(p.ProjectNumber))
            .Select(p => new SearchProject(
                p.ProjectNumber,
                p.Name ?? string.Empty,
                BuildKeywords(p.Name, p.ProjectNumber)));

        var exact = new[] { byNameData.PpmProjectByNumber, byProjectNumberData.PpmProjectByNumber }
            .Where(p => p is not null)
            .Select(p => new SearchProject(
                p!.ProjectNumber,
                p.Name ?? string.Empty,
                BuildKeywords(p.Name, p.ProjectNumber)));

        var merged = exact
            .Concat(byNameProjects)
            .Concat(byProjectNumberProjects)
            .Where(p => !string.IsNullOrWhiteSpace(p.ProjectNumber))
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(p => p.ProjectName, StringComparer.OrdinalIgnoreCase)
            .Take(SearchResultLimit)
            .ToArray();

        return Ok(merged);
    }

    [HttpGet("projects/resolve-pi")]
    public async Task<IActionResult> ResolveProjectPi([FromQuery] string? projectNumber, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!await HasFinancialAccessAsync())
        {
            return Forbid();
        }

        var normalizedProjectNumber = projectNumber?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalizedProjectNumber))
        {
            return BadRequest("projectNumber is required.");
        }

        var client = _financialApiService.GetClient();
        var result = await client.PpmProjectTeamMembers.ExecuteAsync(
            normalizedProjectNumber,
            PpmRole.PrincipalInvestigator,
            cancellationToken);
        var data = result.ReadData();

        var project = data.PpmProjectByNumber;
        var principalInvestigators = project?.TeamMembers?
            .Where(m => m.RoleName == PpmRole.PrincipalInvestigator)
            .Where(m => !string.IsNullOrWhiteSpace(m.Person?.Email))
            .OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? [];

        foreach (var pi in principalInvestigators)
        {
            var email = pi.Person?.Email;
            if (string.IsNullOrWhiteSpace(email))
            {
                continue;
            }

            var resolvedEmployeeId = await TryResolveEmployeeIdByEmailAsync(email, cancellationToken);
            if (!string.IsNullOrWhiteSpace(resolvedEmployeeId))
            {
                return Ok(new ResolveProjectPiResponse(resolvedEmployeeId, normalizedProjectNumber));
            }
        }

        // Fallback: projects without a (resolvable) PI may still be navigable via their
        // Project Manager. ProjectController.GetByEmployeeIdAsync includes orphaned PM-only
        // projects in its response, so handing the by-number route a PM employeeId works.
        var pmResult = await client.PpmProjectTeamMembers.ExecuteAsync(
            normalizedProjectNumber,
            PpmRole.ProjectManager,
            cancellationToken);
        var pmProject = pmResult.ReadData().PpmProjectByNumber;
        var projectManagers = pmProject?.TeamMembers?
            .Where(m => m.RoleName == PpmRole.ProjectManager)
            .Where(m => !string.IsNullOrWhiteSpace(m.Person?.Email))
            .OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? [];

        foreach (var pm in projectManagers)
        {
            var email = pm.Person?.Email;
            if (string.IsNullOrWhiteSpace(email))
            {
                continue;
            }

            var resolvedEmployeeId = await TryResolveEmployeeIdByEmailAsync(email, cancellationToken);
            if (!string.IsNullOrWhiteSpace(resolvedEmployeeId))
            {
                return Ok(new ResolveProjectPiResponse(resolvedEmployeeId, normalizedProjectNumber));
            }
        }

        return NotFound();
    }

    [HttpGet("projects/team")]
    public async Task<IActionResult> GetProjectsWhereCurrentUserIsTeamMember(CancellationToken cancellationToken)
    {
        Guid userId;
        try
        {
            userId = User.GetUserId();
        }
        catch (InvalidOperationException)
        {
            return Unauthorized();
        }

        var employeeId = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.EmployeeId)
            .SingleOrDefaultAsync(cancellationToken);

        if (employeeId is null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(employeeId))
        {
            return BadRequest("Current user is missing EmployeeId.");
        }

        var client = _financialApiService.GetClient();

        var piResultTask = client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId,
            PpmRole.PrincipalInvestigator,
            cancellationToken);

        var pmResultTask = client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId,
            PpmRole.ProjectManager,
            cancellationToken);

        await Task.WhenAll(piResultTask, pmResultTask);

        var piData = piResultTask.Result.ReadData();
        var pmData = pmResultTask.Result.ReadData();

        var myProjects = piData.PpmProjectByProjectTeamMemberEmployeeId
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var first = g.First();
                var projectPiEmployeeId = g
                    .SelectMany(p => p.TeamMembers)
                    .Where(m => m.RoleName == PpmRole.PrincipalInvestigator)
                    .Where(m => !string.IsNullOrWhiteSpace(m.EmployeeId))
                    .OrderBy(m => m.Name)
                    .ThenBy(m => m.EmployeeId)
                    .Select(m => m.EmployeeId)
                    .FirstOrDefault();

                return new SearchProject(
                    first.ProjectNumber,
                    first.Name,
                    BuildKeywords(first.ProjectNumber, first.Name),
                    projectPiEmployeeId);
            })
            .OrderBy(p => p.ProjectName)
            .ToArray();

        var myManagedProjects = pmData.PpmProjectByProjectTeamMemberEmployeeId
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var first = g.First();
                var projectPiEmployeeId = g
                    .SelectMany(p => p.TeamMembers)
                    .Where(m => m.RoleName == PpmRole.PrincipalInvestigator)
                    .Where(m => !string.IsNullOrWhiteSpace(m.EmployeeId))
                    .OrderBy(m => m.Name)
                    .ThenBy(m => m.EmployeeId)
                    .Select(m => m.EmployeeId)
                    .FirstOrDefault();

                return new SearchProject(
                    first.ProjectNumber,
                    first.Name,
                    BuildKeywords(first.ProjectNumber, first.Name),
                    projectPiEmployeeId);
            })
            .OrderBy(p => p.ProjectName)
            .ToArray();

        var projects = myProjects
            .Concat(myManagedProjects)
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(p => p.ProjectName)
            .ToArray();

        var principalInvestigators = piData.PpmProjectByProjectTeamMemberEmployeeId
            .Concat(pmData.PpmProjectByProjectTeamMemberEmployeeId)
            .SelectMany(project => project.TeamMembers)
            .Where(member => member.RoleName == PpmRole.PrincipalInvestigator)
            .Where(member => !string.IsNullOrWhiteSpace(member.EmployeeId))
            .GroupBy(member => member.EmployeeId, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var first = g.First();
                return new SearchPerson(first.EmployeeId, first.Name, BuildKeywords(first.Name, first.EmployeeId));
            })
            .OrderBy(pi => pi.Name)
            .ToArray();

        return Ok(new SearchTeamMemberProjectsResponse(
            myProjects,
            myManagedProjects,
            projects,
            principalInvestigators));
    }

    private async Task<bool> HasFinancialAccessAsync()
    {
        var result = await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            AuthorizationHelper.Policies.CanViewFinancials);

        return result.Succeeded;
    }

    private static string[] BuildKeywords(params string?[] values)
    {
        return values
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ToFuzzyQuery(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value.Trim().Replace(" ", "%", StringComparison.Ordinal);
    }

    private static string ToUpperTrim(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value.Trim().ToUpperInvariant();
    }

    private async Task<string?> TryResolveEmployeeIdByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalizedEmail = email.Trim();
        if (string.IsNullOrWhiteSpace(normalizedEmail))
        {
            return null;
        }

        var normalizedLower = normalizedEmail.ToLowerInvariant();
        var localEmployeeId = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Email != null && u.Email.ToLower() == normalizedLower)
            .Select(u => u.EmployeeId)
            .FirstOrDefaultAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(localEmployeeId))
        {
            return localEmployeeId;
        }

        var kerberosFallback = normalizedEmail.Split('@', 2, StringSplitOptions.TrimEntries)[0];
        if (!string.IsNullOrWhiteSpace(kerberosFallback))
        {
            var normalizedKerberos = kerberosFallback.ToLowerInvariant();
            var localKerberosEmployeeId = await _dbContext.Users
                .AsNoTracking()
                .Where(u => u.Kerberos.ToLower() == normalizedKerberos)
                .Select(u => u.EmployeeId)
                .FirstOrDefaultAsync(cancellationToken);

            if (!string.IsNullOrWhiteSpace(localKerberosEmployeeId))
            {
                return localKerberosEmployeeId;
            }
        }

        try
        {
            // Try the direct match first, then keep searching alternate directory objects until one actually resolves.
            var employeeId = await TryResolveEmployeeIdFromGraphMatchesAsync(normalizedEmail, cancellationToken);
            if (string.IsNullOrWhiteSpace(employeeId))
            {
                _logger.LogInformation("PI email '{Email}' did not resolve to a Graph profile.", normalizedEmail);
                return null;
            }

            return employeeId;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve employee ID from directory email '{Email}'.", normalizedEmail);
            return null;
        }
    }

    // Resolve a PI email against one or more Graph directory objects and keep going until one yields an employee ID.
    private async Task<string?> TryResolveEmployeeIdFromGraphMatchesAsync(
        string email,
        CancellationToken cancellationToken)
    {
        var seenProfileIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        async Task<string?> TryProfileAsync(GraphUserProfile? profile)
        {
            if (profile?.Id is null || !seenProfileIds.Add(profile.Id))
            {
                return null;
            }

            return await TryResolveEmployeeIdFromGraphProfileAsync(profile, email, cancellationToken);
        }

        var directProfile = await _graphService.FindUserByEmailAsync(User, email, cancellationToken);
        var directEmployeeId = await TryProfileAsync(directProfile);
        if (!string.IsNullOrWhiteSpace(directEmployeeId))
        {
            return directEmployeeId;
        }

        foreach (var candidateProfile in await FindCandidateGraphProfilesByEmailAsync(email, cancellationToken))
        {
            var candidateEmployeeId = await TryProfileAsync(candidateProfile);
            if (!string.IsNullOrWhiteSpace(candidateEmployeeId))
            {
                return candidateEmployeeId;
            }
        }

        return null;
    }

    // Convert a specific Graph profile into an employee ID using the local Users table first, then IAM.
    private async Task<string?> TryResolveEmployeeIdFromGraphProfileAsync(
        GraphUserProfile profile,
        string email,
        CancellationToken cancellationToken)
    {
        if (Guid.TryParse(profile.Id, out var userId))
        {
            var localEmployeeIdByUserId = await _dbContext.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.EmployeeId)
                .FirstOrDefaultAsync(cancellationToken);

            if (!string.IsNullOrWhiteSpace(localEmployeeIdByUserId))
            {
                _logger.LogInformation(
                    "Resolved PI email '{Email}' via local user record for Entra object '{UserId}'.",
                    email,
                    userId);
                return localEmployeeIdByUserId;
            }
        }

        if (string.IsNullOrWhiteSpace(profile.IamId))
        {
            _logger.LogInformation(
                "Graph profile '{UserId}' for PI email '{Email}' has no IAM ID.",
                profile.Id,
                email);
            return null;
        }

        var identity = await _identityService.GetByIamId(profile.IamId);
        if (identity is null || string.IsNullOrWhiteSpace(identity.EmployeeId))
        {
            _logger.LogInformation(
                "IAM lookup for PI email '{Email}' and IAM ID '{IamId}' returned no employee ID.",
                email,
                profile.IamId);
            return null;
        }

        return identity.EmployeeId;
    }

    // Mirror the people-search fallback by searching on the email local-part and returning all plausible matches.
    private async Task<IReadOnlyList<GraphUserProfile>> FindCandidateGraphProfilesByEmailAsync(
        string email,
        CancellationToken cancellationToken)
    {
        var localPart = ExtractEmailLocalPart(email);
        if (string.IsNullOrWhiteSpace(localPart) || localPart.Length < 3)
        {
            return [];
        }

        // Mirror the proven /api/search/people behavior and keep all matching directory objects, not just the first.
        var results = await _graphService.SearchUsersAsync(User, localPart, cancellationToken);
        var matchingUsers = results
            .Where(result => result.Id is not null && HasMatchingEmailLocalPart(result.Email, email))
            .ToArray();

        if (matchingUsers.Length == 0)
        {
            return [];
        }

        var profiles = new List<GraphUserProfile>(matchingUsers.Length);
        foreach (var matchingUser in matchingUsers)
        {
            var profile = await _graphService.GetUserProfileAsync(User, matchingUser.Id, cancellationToken);
            if (profile is not null)
            {
                profiles.Add(profile);
            }
        }

        return profiles;
    }

    private static bool HasMatchingEmailLocalPart(string? resultEmail, string candidateEmail)
    {
        var resultLocalPart = ExtractEmailLocalPart(resultEmail);
        var candidateLocalPart = ExtractEmailLocalPart(candidateEmail);

        return !string.IsNullOrWhiteSpace(resultLocalPart) &&
               !string.IsNullOrWhiteSpace(candidateLocalPart) &&
               string.Equals(resultLocalPart, candidateLocalPart, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ExtractEmailLocalPart(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return null;
        }

        var atIndex = email.IndexOf('@');
        if (atIndex <= 0)
        {
            return null;
        }

        return email[..atIndex].Trim();
    }

    private async Task<IReadOnlyList<SearchDirectoryPerson>> SearchManagedPeopleFallbackAsync(
        string query,
        CancellationToken cancellationToken)
    {
        Guid userId;
        try
        {
            userId = User.GetUserId();
        }
        catch (InvalidOperationException)
        {
            return Array.Empty<SearchDirectoryPerson>();
        }

        var currentEmployeeId = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.EmployeeId)
            .SingleOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(currentEmployeeId))
        {
            return Array.Empty<SearchDirectoryPerson>();
        }

        var client = _financialApiService.GetClient();
        var pmProjectsResult = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            currentEmployeeId,
            PpmRole.ProjectManager,
            cancellationToken);

        var teamMembers = pmProjectsResult.ReadData().PpmProjectByProjectTeamMemberEmployeeId
            .SelectMany(p => p.TeamMembers)
            .Where(member => !string.IsNullOrWhiteSpace(member.EmployeeId))
            .ToArray();

        if (teamMembers.Length == 0)
        {
            return Array.Empty<SearchDirectoryPerson>();
        }

        var employeeIds = teamMembers
            .Select(member => member.EmployeeId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var localUsers = await _dbContext.Users
            .AsNoTracking()
            .Where(u => employeeIds.Contains(u.EmployeeId))
            .Select(u => new
            {
                u.EmployeeId,
                u.DisplayName,
                u.Email,
                u.Kerberos,
            })
            .ToArrayAsync(cancellationToken);

        var localUsersByEmployeeId = localUsers.ToDictionary(
            u => u.EmployeeId,
            StringComparer.OrdinalIgnoreCase);

        var queryTokens = NormalizeForSearch(query)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var managedPeople = teamMembers
            .GroupBy(member => member.EmployeeId, StringComparer.OrdinalIgnoreCase)
            .Where(member =>
            {
                var first = member.First();
                localUsersByEmployeeId.TryGetValue(first.EmployeeId, out var localUser);

                var normalizedName = first.Name?.Trim() ?? string.Empty;
                var alternateName = TryGetAlternateName(normalizedName);
                var normalizedSearchTerms = NormalizeForSearch(string.Join(
                    ' ',
                    BuildKeywords(
                        normalizedName,
                        alternateName,
                        first.EmployeeId,
                        localUser?.DisplayName,
                        localUser?.Email,
                        localUser?.Kerberos)));

                return queryTokens.All(token =>
                    normalizedSearchTerms.Contains(token, StringComparison.OrdinalIgnoreCase));
            })
            .Select(g =>
            {
                var first = g.First();
                localUsersByEmployeeId.TryGetValue(first.EmployeeId, out var localUser);
                var alternateName = TryGetAlternateName(first.Name);
                var resolvedName = !string.IsNullOrWhiteSpace(first.Name)
                    ? first.Name
                    : localUser?.DisplayName ?? first.EmployeeId;

                return new SearchDirectoryPerson(
                    Id: $"{SyntheticEmployeeIdPrefix}{first.EmployeeId}",
                    Name: resolvedName,
                    Email: localUser?.Email,
                    Keywords: BuildKeywords(
                        resolvedName,
                        alternateName,
                        first.EmployeeId,
                        localUser?.DisplayName,
                        localUser?.Email,
                        localUser?.Kerberos));
            })
            .OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .Take(SearchResultLimit)
            .ToArray();

        return managedPeople;
    }

    private static string NormalizeForSearch(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var chars = value
            .ToLowerInvariant()
            .Select(ch => char.IsLetterOrDigit(ch) ? ch : ' ')
            .ToArray();

        return string.Join(
            ' ',
            new string(chars).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private static string? TryGetAlternateName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        var parts = name.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            return null;
        }

        return $"{parts[1]} {parts[0]}";
    }
}
