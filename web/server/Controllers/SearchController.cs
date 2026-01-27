using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;

namespace Server.Controllers;

public sealed class SearchController : ApiControllerBase
{
    private readonly IWebHostEnvironment _env;

    public SearchController(IWebHostEnvironment env)
    {
        _env = env;
    }

    public sealed record SearchProject(
        [property: JsonPropertyName("projectNumber")] string ProjectNumber,
        [property: JsonPropertyName("projectName")] string ProjectName,
        [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords);

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

    private sealed record FacultyReportProject(
        [property: JsonPropertyName("project_number")] string ProjectNumber,
        [property: JsonPropertyName("project_name")] string ProjectName);

    private sealed record ProjectPersonnelPerson(
        [property: JsonPropertyName("JOB_EMPLID")] string EmployeeId,
        [property: JsonPropertyName("PREFERRED_NAME")] string PreferredName);

    [HttpGet("catalog")]
    public IActionResult GetCatalog(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var facultyPath = Path.Combine(_env.ContentRootPath, "Models", "FacultyReportFake.json");
        var facultyJson = System.IO.File.ReadAllText(facultyPath);
        var facultyRecords = JsonSerializer.Deserialize<List<FacultyReportProject>>(facultyJson) ?? [];

        var projects = facultyRecords
            .GroupBy(p => p.ProjectNumber)
            .Select(g =>
            {
                var first = g.First();
                var keywords = new[] { first.ProjectNumber, first.ProjectName }.Distinct().ToArray();
                return new SearchProject(first.ProjectNumber, first.ProjectName, keywords);
            })
            .OrderBy(p => p.ProjectName)
            .ToArray();

        var reports = new[]
        {
            new SearchReport(
                "accruals",
                "Employee Vacation Accruals",
                "/accruals",
                ["accruals", "vacation", "leave", "report"]
            ),
            new SearchReport(
                "form",
                "Request Form (Demo)",
                "/form",
                ["form", "request", "demo"]
            ),
             new SearchReport(
                "styles",
                "Style Guide",
                "/styles",
                ["styles", "theme", "design", "components"]
            ),
            new SearchReport(
                "me",
                "My Profile",
                "/me",
                ["me", "profile", "account"]
            ),
        };

        return Ok(new SearchCatalog(projects, reports));
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
}

