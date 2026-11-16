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
    public sealed record CreateProjectionRequest(string Name, int HistoryMonths);
    public sealed record SaveProjectionRequest(string Name, int HistoryMonths, List<ProjectionProject> Projects, List<ProjectionJob> Jobs);
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

    [HttpPost("by-iam/{iamId}")]
    public async Task<IActionResult> Create(string iamId, CreateProjectionRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        var projection = new Projection
        {
            PiEmployeeId = piEmployeeId!,
            Name = request.Name,
            CreatedBy = User.GetUserIdentifier(),
            CreatedAt = DateTime.UtcNow,
        };
        Touch(projection);
        await seeder.SeedAsync(projection, request.HistoryMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
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

    /// <summary>Replaces the whole document; a new window regenerates Projected expenses.</summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Save(int id, SaveProjectionRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        projection!.Name = request.Name;
        projection.Projects = request.Projects;
        projection.Jobs = request.Jobs;
        if (request.HistoryMonths != projection.HistoryMonths)
            ProjectionSeeder.ApplyRunRates(projection, request.HistoryMonths);
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
