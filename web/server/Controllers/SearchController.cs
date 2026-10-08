using System.Text.Json.Serialization;
using AggieEnterpriseApi;
using AggieEnterpriseApi.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using server.core.Data;
using server.core.Models;
using server.core.Services;
using server.Helpers;
using server.Services;

namespace Server.Controllers;

public sealed class SearchController : ApiControllerBase
{
    private const int SearchResultLimit = 5;

    private readonly AppDbContext _dbContext;
    private readonly IFinancialApiService _financialApiService;
    private readonly IAuthorizationService _authorizationService;
    private readonly IDatamartService _datamartService;
    private readonly bool _useGraphQLAPI;
    private readonly PpmPortfolioService _portfolioService;

    public SearchController(
        AppDbContext dbContext,
        IFinancialApiService financialApiService,
        IAuthorizationService authorizationService,
        IDatamartService datamartService,
        IOptions<FeatureFlagOptions> featureFlags,
        PpmPortfolioService portfolioService)
    {
        _dbContext = dbContext;
        _financialApiService = financialApiService;
        _authorizationService = authorizationService;
        _datamartService = datamartService;
        _useGraphQLAPI = featureFlags.Value.UseGraphQLAPI;
        _portfolioService = portfolioService;
    }

    public sealed record SearchProject(
        [property: JsonPropertyName("projectNumber")] string ProjectNumber,
        [property: JsonPropertyName("projectName")] string ProjectName,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords,
        [property: JsonPropertyName("projectPiIamId")]
        string? ProjectPiIamId = null);

    public sealed record SearchReport(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("label")] string Label,
        [property: JsonPropertyName("to")] string To,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords);

    public sealed record SearchCatalog(
        [property: JsonPropertyName("projects")] IReadOnlyList<SearchProject> Projects,
        [property: JsonPropertyName("reports")] IReadOnlyList<SearchReport> Reports);

    public sealed record SearchPerson(
        [property: JsonPropertyName("iamId")] string IamId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords);

    public sealed record SearchDirectoryPerson(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("iamId")] string IamId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("email")] string? Email,
        [property: JsonPropertyName("isProjectManager")] bool IsProjectManager,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords);

    public sealed record SearchTeamMemberProjectsResponse(
        [property: JsonPropertyName("myProjects")] IReadOnlyList<SearchProject> MyProjects,
        [property: JsonPropertyName("myManagedProjects")] IReadOnlyList<SearchProject> MyManagedProjects,
        [property: JsonPropertyName("projects")] IReadOnlyList<SearchProject> Projects,
        [property: JsonPropertyName("principalInvestigators")] IReadOnlyList<SearchPerson> PrincipalInvestigators);

    public sealed record ResolveProjectPiResponse(
        [property: JsonPropertyName("iamId")] string IamId,
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

        var people = await _datamartService.SearchPeopleAsync(normalizedQuery, SearchResultLimit, cancellationToken);
        var pmEmployeeIds = await _portfolioService.GetProjectManagerEmployeeIdsAsync(people.Select(p => p.EmployeeId), cancellationToken);
        var results = new List<SearchDirectoryPerson>(people.Count);
        foreach (var person in people)
        {
            var isProjectManager = pmEmployeeIds.Contains(person.EmployeeId);
            results.Add(new SearchDirectoryPerson(
                person.IamId,
                person.IamId,
                person.Name,
                person.Email,
                isProjectManager,
                BuildKeywords(person.Name, person.Email, person.IamId)));
        }

        return Ok(results);
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

        var fuzzyQuery = ToFuzzyQuery(normalizedQuery);
        var exactLookupQuery = ToUpperTrim(normalizedQuery);
        var candidates = _useGraphQLAPI
            ? await SearchGraphQlProjectsAsync(fuzzyQuery, exactLookupQuery, cancellationToken)
            : await _datamartService.SearchProjectsAsync(fuzzyQuery, exactLookupQuery, cancellationToken);

        var results = candidates
            .Where(p => !string.IsNullOrWhiteSpace(p.ProjectNumber))
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(p => p.ProjectName, StringComparer.OrdinalIgnoreCase)
            .Take(SearchResultLimit)
            .Select(p => new SearchProject(
                p.ProjectNumber, p.ProjectName, BuildKeywords(p.ProjectName, p.ProjectNumber)))
            .ToArray();

        return Ok(results);
    }

    private async Task<IReadOnlyList<ProjectSearchRecord>> SearchGraphQlProjectsAsync(
        string fuzzyQuery, string exactLookupQuery, CancellationToken cancellationToken)
    {
        var client = _financialApiService.GetClient();
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

        var exact = new[] { byNameData.PpmProjectByNumber, byProjectNumberData.PpmProjectByNumber }
            .Where(p => p is not null)
            .Select(p => new ProjectSearchRecord(p!.ProjectNumber, p.Name ?? string.Empty));
        var byName = (byNameData.PpmProjectSearch?.Data ?? [])
            .Select(p => new ProjectSearchRecord(p.ProjectNumber, p.Name ?? string.Empty));
        var byNumber = (byProjectNumberData.PpmProjectSearch?.Data ?? [])
            .Select(p => new ProjectSearchRecord(p.ProjectNumber, p.Name ?? string.Empty));

        return exact.Concat(byName).Concat(byNumber).ToArray();
    }

    [HttpGet("projects/resolve-pi")]
    public async Task<IActionResult> ResolveProjectPi([FromQuery] string? projectNumber, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var normalizedProjectNumber = projectNumber?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalizedProjectNumber))
        {
            return BadRequest("projectNumber is required.");
        }

        var hasFinancialAccess = await HasFinancialAccessAsync();
        var callerEmployeeId = hasFinancialAccess
            ? null
            : await GetCurrentEmployeeIdAsync(cancellationToken);

        // Restricted callers may resolve only projects where PPM lists them as the PI or PM.
        if (!hasFinancialAccess && string.IsNullOrWhiteSpace(callerEmployeeId))
        {
            return Forbid();
        }

        var piResolution = await ResolveFirstTeamMemberIamIdByEmployeeIdAsync(
            normalizedProjectNumber,
            PpmRole.PrincipalInvestigator,
            callerEmployeeId,
            cancellationToken);

        TeamMemberIamResolution? pmResolution = null;
        if (!hasFinancialAccess && !piResolution.IncludesCaller)
        {
            pmResolution = await ResolveFirstTeamMemberIamIdByEmployeeIdAsync(
                normalizedProjectNumber,
                PpmRole.ProjectManager,
                callerEmployeeId,
                cancellationToken);

            if (!pmResolution.IncludesCaller)
            {
                return Forbid();
            }
        }

        if (!string.IsNullOrWhiteSpace(piResolution.IamId))
        {
            return Ok(new ResolveProjectPiResponse(piResolution.IamId, normalizedProjectNumber));
        }

        if (piResolution.HasTeamMembers)
        {
            return NotFound();
        }

        pmResolution ??= await ResolveFirstTeamMemberIamIdByEmployeeIdAsync(
            normalizedProjectNumber,
            PpmRole.ProjectManager,
            callerEmployeeId,
            cancellationToken);

        if (!string.IsNullOrWhiteSpace(pmResolution.IamId))
        {
            return Ok(new ResolveProjectPiResponse(pmResolution.IamId, normalizedProjectNumber));
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

        var piTask = _portfolioService.GetEmployeeProjectsAsync(employeeId, PpmRole.PrincipalInvestigator, cancellationToken);
        var pmTask = _portfolioService.GetEmployeeProjectsAsync(employeeId, PpmRole.ProjectManager, cancellationToken);
        await Task.WhenAll(piTask, pmTask);
        var piProjects = await piTask;
        var pmProjects = await pmTask;
        var peopleByEmployeeId = await GetPeopleByEmployeeIdAsync(
            piProjects
                .Concat(pmProjects)
                .SelectMany(p => p.TeamMembers)
                .Select(m => m.EmployeeId),
            cancellationToken);

        var myProjects = piProjects
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var first = g.First();
                var projectPiEmployeeId = GetFirstPiEmployeeId(g.SelectMany(p => p.TeamMembers));

                return new SearchProject(
                    first.ProjectNumber,
                    first.Name,
                    BuildKeywords(first.ProjectNumber, first.Name),
                    TryGetIamId(peopleByEmployeeId, projectPiEmployeeId));
            })
            .OrderBy(p => p.ProjectName)
            .ToArray();

        var myManagedProjects = pmProjects
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var first = g.First();
                var projectPiEmployeeId = GetFirstPiEmployeeId(g.SelectMany(p => p.TeamMembers));

                return new SearchProject(
                    first.ProjectNumber,
                    first.Name,
                    BuildKeywords(first.ProjectNumber, first.Name),
                    TryGetIamId(peopleByEmployeeId, projectPiEmployeeId));
            })
            .OrderBy(p => p.ProjectName)
            .ToArray();

        var projects = myProjects
            .Concat(myManagedProjects)
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(p => p.ProjectName)
            .ToArray();

        var principalInvestigators = piProjects
            .Concat(pmProjects)
            .SelectMany(project => project.TeamMembers)
            .Where(member => member.RoleName == PpmRole.PrincipalInvestigator)
            .Where(member => !string.IsNullOrWhiteSpace(member.EmployeeId))
            .GroupBy(member => member.EmployeeId, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var first = g.First();
                return peopleByEmployeeId.TryGetValue(first.EmployeeId, out var person)
                    ? new SearchPerson(person.IamId, first.Name, BuildKeywords(first.Name, person.IamId))
                    : null;
            })
            .Where(pi => pi is not null)
            .Select(pi => pi!)
            .OrderBy(pi => pi.Name)
            .ToArray();

        return Ok(new SearchTeamMemberProjectsResponse(
            myProjects,
            myManagedProjects,
            projects,
            principalInvestigators));
    }

    private sealed record TeamMemberIamResolution(
        string? IamId,
        bool HasTeamMembers,
        bool IncludesCaller);

    /// <summary>
    /// Resolves the first IAM ID for a project role and reports whether the caller is explicitly
    /// listed in that role. Authorization always uses GraphQL project-team membership in this slice.
    /// </summary>
    private async Task<TeamMemberIamResolution> ResolveFirstTeamMemberIamIdByEmployeeIdAsync(
        string projectNumber,
        string roleName,
        string? callerEmployeeId,
        CancellationToken cancellationToken)
    {
        var teamMembers = await _portfolioService.GetProjectTeamAsync(projectNumber, roleName, cancellationToken);
        var includesCaller = false;
        if (!string.IsNullOrWhiteSpace(callerEmployeeId))
        {
            // This slice changes navigation data only. Restricted access still requires a live GraphQL team role.
            if (_useGraphQLAPI)
            {
                includesCaller = teamMembers.Any(m => string.Equals(m.EmployeeId, callerEmployeeId, StringComparison.OrdinalIgnoreCase));
            }
            else
            {
                var legacy = await _financialApiService.GetClient().PpmProjectTeamMembers.ExecuteAsync(projectNumber, roleName, cancellationToken);
                includesCaller = legacy.ReadData().PpmProjectByNumber?.TeamMembers?.Any(m =>
                    m.RoleName == roleName && string.Equals(m.Person?.EmployeeId, callerEmployeeId, StringComparison.OrdinalIgnoreCase)) == true;
            }
        }
        var membersWithEmployeeId = teamMembers
            .Where(m => !string.IsNullOrWhiteSpace(m.EmployeeId))
            .OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var member in membersWithEmployeeId)
        {
            var employeeId = member.EmployeeId;
            if (string.IsNullOrWhiteSpace(employeeId))
            {
                continue;
            }
            var person = await _datamartService.GetSearchablePersonByEmployeeIdAsync(employeeId, cancellationToken);
            if (!string.IsNullOrWhiteSpace(person?.IamId))
            {
                return new TeamMemberIamResolution(person.IamId, teamMembers.Count > 0, includesCaller);
            }
        }

        return new TeamMemberIamResolution(null, teamMembers.Count > 0, includesCaller);
    }

    private async Task<IReadOnlyDictionary<string, SearchablePersonRecord>> GetPeopleByEmployeeIdAsync(
        IEnumerable<string?> employeeIds,
        CancellationToken cancellationToken)
    {
        var normalizedEmployeeIds = employeeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalizedEmployeeIds.Length == 0)
        {
            return new Dictionary<string, SearchablePersonRecord>(StringComparer.OrdinalIgnoreCase);
        }

        var people = await _datamartService.GetSearchablePeopleByEmployeeIdsAsync(normalizedEmployeeIds, cancellationToken);
        return people.ToDictionary(p => p.EmployeeId, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Returns true only when the current user satisfies the financial-data access policy.</summary>
    private async Task<bool> HasFinancialAccessAsync()
    {
        var result = await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            AuthorizationHelper.Policies.CanViewFinancials);

        return result.Succeeded;
    }

    /// <summary>
    /// Resolves the authenticated user's employee ID used for project-team authorization.
    /// Missing claims or profiles must fail closed rather than granting project lookup access.
    /// </summary>
    private async Task<string?> GetCurrentEmployeeIdAsync(CancellationToken cancellationToken)
    {
        Guid userId;
        try
        {
            userId = User.GetUserId();
        }
        catch (InvalidOperationException)
        {
            return null;
        }

        return await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.EmployeeId)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static string? GetFirstPiEmployeeId(
        IEnumerable<PpmTeamMember> members)
    {
        return members
            .Where(m => m.RoleName == PpmRole.PrincipalInvestigator)
            .Where(m => !string.IsNullOrWhiteSpace(m.EmployeeId))
            .OrderBy(m => m.Name)
            .ThenBy(m => m.EmployeeId)
            .Select(m => m.EmployeeId)
            .FirstOrDefault();
    }

    private static string? TryGetIamId(
        IReadOnlyDictionary<string, SearchablePersonRecord> peopleByEmployeeId,
        string? employeeId)
    {
        if (string.IsNullOrWhiteSpace(employeeId))
        {
            return null;
        }

        return peopleByEmployeeId.TryGetValue(employeeId, out var person)
            ? person.IamId
            : null;
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
}
