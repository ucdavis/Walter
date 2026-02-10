using System.Text.Json;
using System.Text.Json.Serialization;
using AggieEnterpriseApi.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.Helpers;
using server.Services;

namespace Server.Controllers;

public sealed class SearchController : ApiControllerBase
{
    private readonly IWebHostEnvironment _env;
    private readonly AppDbContext _dbContext;
    private readonly IFinancialApiService _financialApiService;
    private readonly IAuthorizationService _authorizationService;

    public SearchController(
        IWebHostEnvironment env,
        AppDbContext dbContext,
        IFinancialApiService financialApiService,
        IAuthorizationService authorizationService)
    {
        _env = env;
        _dbContext = dbContext;
        _financialApiService = financialApiService;
        _authorizationService = authorizationService;
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

    public sealed record SearchTeamMemberProjectsResponse(
        [property: JsonPropertyName("projects")] IReadOnlyList<SearchProject> Projects,
        [property: JsonPropertyName("principalInvestigators")] IReadOnlyList<SearchPerson> PrincipalInvestigators);

    private sealed record ProjectPersonnelPerson(
        [property: JsonPropertyName("JOB_EMPLID")] string EmployeeId,
        [property: JsonPropertyName("PREFERRED_NAME")] string PreferredName);

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

        reports.Add(new SearchReport(
            "reports",
            "All Reports",
            "/reports",
            ["reports", "all reports"]
        ));

        return Ok(new SearchCatalog(Array.Empty<SearchProject>(), reports));
    }

    [HttpGet("people")]
    public IActionResult SearchPeople([FromQuery] string? query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (string.IsNullOrWhiteSpace(query))
        {
            return Ok(Array.Empty<SearchPerson>());
        }

        var normalizedQuery = query.Trim();

        var path = Path.Combine(_env.ContentRootPath, "Models", "ProjectPersonnelFake.json");
        var json = System.IO.File.ReadAllText(path);
        var personnel = JsonSerializer.Deserialize<List<ProjectPersonnelPerson>>(json) ?? [];

        var results = personnel
            .Where(p => p.PreferredName.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase))
            .GroupBy(p => p.EmployeeId)
            .Select(g =>
            {
                var first = g.First();
                var keywords = new[] { first.PreferredName, first.EmployeeId }.Distinct().ToArray();
                return new SearchPerson(first.EmployeeId, first.PreferredName, keywords);
            })
            .OrderBy(p => p.Name)
            .Take(25)
            .ToArray();

        return Ok(results);
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

        var projects = piData.PpmProjectByProjectTeamMemberEmployeeId
            .Concat(pmData.PpmProjectByProjectTeamMemberEmployeeId)
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

                var keywords = new[] { first.ProjectNumber, first.Name }
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();

                return new SearchProject(first.ProjectNumber, first.Name, keywords, projectPiEmployeeId);
            })
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
                var keywords = new[] { first.Name, first.EmployeeId }
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();

                return new SearchPerson(first.EmployeeId, first.Name, keywords);
            })
            .OrderBy(pi => pi.Name)
            .ToArray();

        return Ok(new SearchTeamMemberProjectsResponse(projects, principalInvestigators));
    }
}
