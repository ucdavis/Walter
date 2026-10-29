using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using server.Helpers;
using server.Services;
using Server.Services;

namespace Server.Controllers;

/// <summary>Per-PI budget projections. Anyone who can view the PI's portfolio can read and edit them.</summary>
public sealed class ProjectionsController(
    AppDbContext db,
    IDatamartService datamart,
    IAuthorizationService authorization,
    IUserService users,
    PpmPortfolioService portfolio,
    ProjectionSeeder seeder,
    IProjectionDataSource data) : ApiControllerBase
{
    private static readonly int[] Windows = [3, 6, 12];

    public sealed record ProjectionSummary(int Id, string Name, DateTime SeededAt, string? UpdatedBy, DateTime UpdatedAt);
    public sealed record ProjectionSnapshotDraft(DateTime SeededAt, List<ProjectionProject> Projects, List<ProjectionJob> Jobs, ProjectionSettings? Settings = null);
    public sealed record CreateProjectionRequest(string Name, int HistoryMonths, ProjectionSnapshotDraft? Draft = null);
    /// <summary>Guided clients regenerate expenses before editing them and preserve that preview; older clients regenerate on save.</summary>
    public sealed record SaveProjectionRequest(string Name, int HistoryMonths, List<ProjectionProject> Projects, List<ProjectionJob> Jobs, ProjectionSettings? Settings = null, bool PreserveProjectedExpenses = false);
    public sealed record HistoryMonthsRequest(int HistoryMonths);
    public sealed record ProjectionLookups(IReadOnlyList<JobCodeRecord> JobCodes, IReadOnlyList<string> ExpenditureCategories);

    [HttpGet("by-iam/{iamId}")]
    public async Task<IActionResult> ListByIam(string iamId, CancellationToken ct)
    {
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        return Ok(await db.Projections
            .Where(p => p.PiEmployeeId == piEmployeeId)
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new ProjectionSummary(p.Id, p.Name, p.SeededAt, p.UpdatedBy, p.UpdatedAt))
            .ToListAsync(ct));
    }

    /// <summary>Reads a fresh portfolio snapshot without creating a saved projection.</summary>
    [HttpGet("by-iam/{iamId}/seed")]
    public async Task<IActionResult> Seed(string iamId, [FromQuery] int historyMonths = 6, CancellationToken ct = default)
    {
        if (!Windows.Contains(historyMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        var projection = new Projection { PiEmployeeId = piEmployeeId!, Name = "Default plan" };
        await seeder.SeedAsync(projection, historyMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        return Ok(projection);
    }

    /// <summary>Saves an edited snapshot or seeds a new projection when no draft is supplied.</summary>
    [HttpPost("by-iam/{iamId}")]
    public async Task<IActionResult> Create(string iamId, CreateProjectionRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        var validation = ValidateName(request.Name);
        if (validation is not null) return BadRequest(validation);
        if (request.Draft is { } draft)
        {
            if (draft.SeededAt == default) return BadRequest("The snapshot date is required.");
            validation = ValidateDocument(draft.Projects, draft.Jobs, draft.Settings ?? draft.Projects?.Select(p => p?.GuidedSettings).FirstOrDefault(s => s is not null));
            if (validation is not null) return BadRequest(validation);
        }

        var projection = new Projection
        {
            PiEmployeeId = piEmployeeId!,
            Name = request.Name.Trim(),
            CreatedBy = User.GetUserIdentifier(),
            CreatedAt = DateTime.UtcNow,
        };
        Touch(projection);
        if (request.Draft is { } snapshot)
        {
            projection.SeededAt = snapshot.SeededAt;
            projection.HistoryMonths = request.HistoryMonths;
            projection.Projects = snapshot.Projects;
            projection.Jobs = snapshot.Jobs;
            projection.Settings = snapshot.Settings ?? projection.Settings;
        }
        else
        {
            await seeder.SeedAsync(projection, request.HistoryMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        }
        db.Projections.Add(projection);
        await db.SaveChangesAsync(ct);
        return Ok(projection);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct)
    {
        var (projection, error) = await LoadAsync(id, ct);
        return error ?? Ok(projection);
    }

    /// <summary>Replaces the document; a new window regenerates Projected expenses unless the caller already prepared the preview.</summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Save(int id, SaveProjectionRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        var settings = request.Settings ?? projection!.Settings;
        var validation = ValidateName(request.Name) ?? ValidateDocument(request.Projects, request.Jobs, settings);
        if (validation is not null) return BadRequest(validation);

        projection!.Name = request.Name.Trim();
        projection.Projects = request.Projects;
        projection.Jobs = request.Jobs;
        projection.Settings = settings;
        if (request.HistoryMonths != projection.HistoryMonths && !request.PreserveProjectedExpenses)
            ProjectionSeeder.ApplyRunRates(projection, request.HistoryMonths);
        else
            projection.HistoryMonths = request.HistoryMonths;
        Touch(projection);
        await db.SaveChangesAsync(ct);
        return Ok(projection);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        db.Projections.Remove(projection!);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Discards all edits and reseeds from current data; id, name, and creator are kept.</summary>
    [HttpPost("{id:int}/reset")]
    public async Task<IActionResult> Reset(int id, HistoryMonthsRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        await seeder.SeedAsync(projection!, request.HistoryMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        Touch(projection!);
        await db.SaveChangesAsync(ct);
        return Ok(projection);
    }

    [HttpGet("lookups")]
    public async Task<IActionResult> Lookups(CancellationToken ct) =>
        Ok(new ProjectionLookups(await data.GetJobCodesAsync(ct), await data.GetExpenditureCategoriesAsync(ct)));

    /// <summary>Loads the projection and applies the PI portfolio access rule.</summary>
    internal async Task<(Projection? projection, IActionResult? error)> LoadAsync(int id, CancellationToken ct)
    {
        var projection = await db.Projections.SingleOrDefaultAsync(p => p.Id == id, ct);
        if (projection is null) return (null, NotFound());
        return await CanAccessPiAsync(projection.PiEmployeeId, ct) ? (projection, null) : (null, Forbid());
    }

    /// <summary>Every save bumps the projection's audit fields.</summary>
    internal void Touch(Projection projection)
    {
        projection.UpdatedBy = User.GetUserIdentifier();
        projection.UpdatedAt = DateTime.UtcNow;
    }

    private static string? ValidateName(string? name) =>
        string.IsNullOrWhiteSpace(name) || name.Trim().Length > 200
            ? "Give the projection a name of 1 to 200 characters."
            : null;

    private static string? ValidateDocument(List<ProjectionProject>? projects, List<ProjectionJob>? jobs, ProjectionSettings? settings)
    {
        if (projects is null || jobs is null) return "Projects and jobs are required.";
        if (projects.Any(p => p is null || p.Id <= 0) || projects.Select(p => p.Id).Distinct().Count() != projects.Count)
            return "Project ids must be positive and unique within the projection.";
        if (jobs.Any(j => j is null || j.Id <= 0) || jobs.Select(j => j.Id).Distinct().Count() != jobs.Count)
            return "Job ids must be positive and unique within the projection.";

        var projectIds = projects.Select(p => p.Id).ToHashSet();
        var jobIds = jobs.Select(j => j.Id).ToHashSet();
        if (projects.Any(p => p.Budgets is null || p.Budgets.Any(b => b is null)
                || p.Actuals is null || p.Actuals.Any(a => a is null)
                || p.RunRates is null || p.RunRates.Any(r => r is null)
                || p.Expenses is null || p.Expenses.Any(e => e is null))
            || jobs.Any(j => j.FundingEntries is null || j.FundingEntries.Any(f => f is null || f.ProjectId is { } id && !projectIds.Contains(id))))
            return "Every funding entry must refer to a project in this projection or outside funding.";

        if (settings is null) return null;
        if (projects.Count == 0 && (settings.StartMonth is not null || settings.Months != 12
                || settings.Note != "" || settings.SelectedProjectIds is not null || settings.ExcludedJobIds?.Count != 0))
            return "Include a project before saving guided plan settings.";
        if (settings.Months is < 1 or > 120) return "Choose a planning horizon between 1 and 120 months.";
        if (settings.StartMonth is { } month && (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) || month.Length != 7))
            return "StartMonth must use YYYY-MM.";
        if (settings.Note is null || settings.Note.Length > 2000) return "The plan note must be no longer than 2000 characters.";
        if (settings.SelectedProjectIds?.Any(id => !projectIds.Contains(id)) == true
            || settings.ExcludedJobIds is null || settings.ExcludedJobIds.Any(id => !jobIds.Contains(id)))
            return "Workspace selections must refer to projects and jobs in this projection.";
        return null;
    }

    private async Task<bool> IsFinancialViewerAsync() =>
        (await authorization.AuthorizeAsync(User, null, AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

    /// <summary>CanViewFinancials, the PI themselves, or PI/PM on any of the PI's projects.</summary>
    private async Task<bool> CanAccessPiAsync(string piEmployeeId, CancellationToken ct) =>
        await IsFinancialViewerAsync()
        || await portfolio.IsOnAnyProjectForPiAsync(await GetCurrentEmployeeIdAsync(ct), piEmployeeId, ct);

    private async Task<(string? piEmployeeId, IActionResult? error)> ResolvePiAsync(string iamId, CancellationToken ct)
    {
        var person = await datamart.GetSearchablePersonByIamIdAsync(iamId, ct);
        // Restricted callers must not be able to tell unknown IAM ids from inaccessible portfolios.
        if (person is null) return (null, await IsFinancialViewerAsync() ? NotFound() : Forbid());
        return await CanAccessPiAsync(person.EmployeeId, ct) ? (person.EmployeeId, null) : (null, Forbid());
    }

    private async Task<string?> GetCurrentEmployeeIdAsync(CancellationToken ct) =>
        (await users.GetByIdAsync(User.GetUserId(), ct))?.EmployeeId;
}
