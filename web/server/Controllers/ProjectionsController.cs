using System.Text.Json;
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
    IProjectionDataSource data,
    TimeProvider? timeProvider = null) : ApiControllerBase
{
    private static readonly int[] Windows = [3, 6, 12];
    private const int OverwriteAttempts = 3;

    public sealed record ProjectionSummary(int Id, string Name, DateTime SeededAt, string? UpdatedBy, DateTime UpdatedAt);
    public sealed record CreateProjectionRequest(string Name, int HistoryMonths);
    public sealed record SaveProjectionRequest(string Name, int HistoryMonths, List<ProjectionProject> Projects,
        List<ProjectionJob> Jobs, DateTime? ExpectedUpdatedAt = null, DateTime? ExpectedSeededAt = null, bool Overwrite = false);
    public sealed record HistoryMonthsRequest(int HistoryMonths, DateTime? ExpectedUpdatedAt = null);
    public sealed record ProjectionConflict(string Code, string Message);
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
            CreatedAt = (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime,
        };
        await seeder.SeedAsync(projection, request.HistoryMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        Touch(projection);
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

    /// <summary>
    /// Replaces the whole scenario document, preserves snapshot, identity and creator metadata, and updates audit fields.
    /// Saves keep submitted estimates; regeneration is an explicit draft operation.
    /// Confirmed overwrite retries ordinary edits, but never crosses a reset or recreates a deleted plan.
    /// </summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Save(int id, SaveProjectionRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        if (!ValidToken(request.ExpectedUpdatedAt) || !ValidToken(request.ExpectedSeededAt))
            return BadRequest("ExpectedUpdatedAt and ExpectedSeededAt must be exact UTC timestamps from the loaded plan.");
        if (request.Projects is null || request.Jobs is null) return BadRequest("Projects and Jobs are required.");

        // Detach the submitted lists from tracked entities and reuse this frozen draft on every retry.
        var draft = JsonSerializer.Deserialize<SaveProjectionRequest>(JsonSerializer.Serialize(request))!;
        for (var attempt = 0; attempt < OverwriteAttempts; attempt++)
        {
            var (projection, error) = await LoadAsync(id, ct);
            if (error is not null) return error;
            if (projection!.SeededAt != draft.ExpectedSeededAt) return SnapshotChanged();
            if (!draft.Overwrite && projection.UpdatedAt != draft.ExpectedUpdatedAt) return Changed();

            // Use the client's loaded version in the SQL predicate. Overwrite accepts ordinary edits
            // only after loading and authorizing a row from the originally submitted snapshot.
            db.Entry(projection).Property(p => p.UpdatedAt).OriginalValue =
                draft.Overwrite ? projection.UpdatedAt : draft.ExpectedUpdatedAt!.Value;
            projection.Name = draft.Name;
            projection.HistoryMonths = draft.HistoryMonths;
            projection.Projects = draft.Projects;
            projection.Jobs = draft.Jobs;
            Touch(projection);
            try
            {
                await db.SaveChangesAsync(ct);
                return Ok(projection);
            }
            catch (DbUpdateConcurrencyException)
            {
                db.Entry(projection).State = EntityState.Detached;
                if (!draft.Overwrite) return await ConcurrentChangeAsync(id, draft.ExpectedSeededAt, ct);
            }
        }

        // A reset, deletion, or access change still takes precedence after the final lost race.
        var (current, currentError) = await LoadAsync(id, ct);
        if (currentError is not null) return currentError;
        if (current!.SeededAt != draft.ExpectedSeededAt) return SnapshotChanged();
        return StatusCode(StatusCodes.Status503ServiceUnavailable,
            new ProjectionConflict("busy", "The plan is being edited. Retry the overwrite."));
    }

    /// <summary>Deletes only the version originally loaded by the caller.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, [FromQuery] DateTime? expectedUpdatedAt, CancellationToken ct)
    {
        if (!ValidToken(expectedUpdatedAt)) return BadRequest("ExpectedUpdatedAt must be the exact UTC timestamp from the loaded plan.");
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;
        if (projection!.UpdatedAt != expectedUpdatedAt) return Changed();

        db.Entry(projection).Property(p => p.UpdatedAt).OriginalValue = expectedUpdatedAt!.Value;
        db.Projections.Remove(projection);
        try
        {
            await db.SaveChangesAsync(ct);
            return NoContent();
        }
        catch (DbUpdateConcurrencyException)
        {
            db.Entry(projection).State = EntityState.Detached;
            return await ConcurrentChangeAsync(id, null, ct);
        }
    }

    /// <summary>Reseeds only the loaded version from current data; id, name, and creator are kept.</summary>
    [HttpPost("{id:int}/reset")]
    public async Task<IActionResult> Reset(int id, HistoryMonthsRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        if (!ValidToken(request.ExpectedUpdatedAt)) return BadRequest("ExpectedUpdatedAt must be the exact UTC timestamp from the loaded plan.");
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;
        if (projection!.UpdatedAt != request.ExpectedUpdatedAt) return Changed();
        db.Entry(projection).Property(p => p.UpdatedAt).OriginalValue = request.ExpectedUpdatedAt!.Value;

        await seeder.SeedAsync(projection, request.HistoryMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        Touch(projection);
        try
        {
            await db.SaveChangesAsync(ct);
            return Ok(projection);
        }
        catch (DbUpdateConcurrencyException)
        {
            db.Entry(projection).State = EntityState.Detached;
            return await ConcurrentChangeAsync(id, null, ct);
        }
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

    /// <summary>Every write strictly advances the UTC audit token, including with a stalled clock.</summary>
    internal void Touch(Projection projection)
    {
        projection.UpdatedBy = User.GetUserIdentifier();
        projection.UpdatedAt = ProjectionTimestamps.Advance(projection.UpdatedAt,
            (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime);
    }

    /// <summary>Missing or ambiguous timestamps must never disable an atomic version check.</summary>
    private static bool ValidToken(DateTime? timestamp) =>
        timestamp is { Kind: DateTimeKind.Utc } && timestamp.Value > DateTime.MinValue && timestamp.Value < DateTime.MaxValue;

    private ConflictObjectResult Changed() =>
        Conflict(new ProjectionConflict("conflict", "The plan changed since it was loaded."));

    private ConflictObjectResult SnapshotChanged() =>
        Conflict(new ProjectionConflict("snapshotChanged", "The plan was reset. Reload its current snapshot before saving."));

    /// <summary>Rechecks existence, access and snapshot after a failed atomic version check.</summary>
    private async Task<IActionResult> ConcurrentChangeAsync(int id, DateTime? expectedSeededAt, CancellationToken ct)
    {
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;
        return expectedSeededAt is not null && projection!.SeededAt != expectedSeededAt ? SnapshotChanged() : Changed();
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
