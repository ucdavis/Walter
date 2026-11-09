using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
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
    public sealed record CreateProjectionRequest(ProjectionDraft? Draft, Guid CreationKey);
    public sealed record DuplicateProjectionRequest(string Name, Guid CreationKey);
    public sealed record SaveProjectionRequest(string Name, int HistoryMonths, List<ProjectionFundingSource> FundingSources,
        List<ProjectionAppointment> Appointments, DateTime? ExpectedUpdatedAt = null, DateTime? ExpectedSeededAt = null, bool Overwrite = false);
    public sealed record HistoryMonthsRequest(int HistoryMonths, DateTime? ExpectedUpdatedAt = null);
    public sealed record ProjectionConflict(string Code, string Message);
    public sealed record ProjectionLookups(IReadOnlyList<JobCodeRecord> JobCodes, IReadOnlyList<string> ExpenditureCategories);
    public sealed record ProjectionSourceKey(string ProjectNumber, string? TaskNumber);
    public sealed record ProjectionSourceSummary(string ProjectNumber, string? ProjectName, string? TaskNumber, string? TaskName);
    public sealed record ImportProjectionSourcesRequest(int HistoryMonths, List<ProjectionSourceKey>? Sources);

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

    /// <summary>Captures a fresh authorized draft without creating a saved plan or changing existing plans.</summary>
    [HttpGet("by-iam/{iamId}/seed")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Seed(string iamId, [FromQuery] int historyMonths = 3, CancellationToken ct = default)
    {
        if (!Windows.Contains(historyMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        return Ok(await seeder.CaptureDraftAsync(piEmployeeId!, historyMonths,
            User.GetUserIdentifier(), User.GetEmulatingUser(), ct));
    }

    /// <summary>Lists currently eligible tasks within the authorized PI portfolio for fresh source selection.</summary>
    [HttpGet("by-iam/{iamId}/sources")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Sources(string iamId, CancellationToken ct)
    {
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;
        var sources = await seeder.CaptureSourcesAsync(piEmployeeId!, 3, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        return Ok(sources.Select(p => new ProjectionSourceSummary(p.ProjectNumber!, p.ProjectName, p.TaskNumber, p.TaskName)).ToList());
    }

    /// <summary>Imports selected current task financials only; client assignment of local IDs cannot refresh staffing or persist a plan.</summary>
    [HttpPost("by-iam/{iamId}/sources/import")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> ImportSources(string iamId, ImportProjectionSourcesRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        if (request.Sources is null || request.Sources.Count == 0
            || request.Sources.Any(s => s is null || string.IsNullOrWhiteSpace(s.ProjectNumber)))
            return BadRequest("Select at least one project/task source.");
        var selectedKeys = request.Sources.Select(s => ProjectionSeedPolicy.TaskKey(s.ProjectNumber, s.TaskNumber)).ToList();
        if (selectedKeys.Distinct().Count() != selectedKeys.Count) return BadRequest("Each task may be selected only once.");
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;
        var sources = await seeder.CaptureSourcesAsync(piEmployeeId!, request.HistoryMonths,
            User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        var available = sources.ToDictionary(p => ProjectionSeedPolicy.TaskKey(p.ProjectNumber, p.TaskNumber));
        // Validate the complete selection against this fresh authorized read; never return a partial import.
        if (selectedKeys.Any(k => !available.ContainsKey(k))) return BadRequest("A selected source is no longer available in this PI's portfolio.");
        return Ok(selectedKeys.Select(k => available[k]).ToList());
    }

    /// <summary>Creates the reviewed snapshot without fetching new source or personnel data.</summary>
    [HttpPost("by-iam/{iamId}")]
    public async Task<IActionResult> Create(string iamId, CreateProjectionRequest request, CancellationToken ct)
    {
        if (request.CreationKey == Guid.Empty)
            return BadRequest("A nonempty CreationKey is required when creating a reviewed draft.");
        if (request.Draft is null || !ValidDraft(request.Draft))
            return BadRequest("Draft requires an exact UTC SeededAt, nonnull collections, unique positive funding source/appointment IDs, and valid allocation references.");
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        var existing = await FindCreationAsync(piEmployeeId!, request.CreationKey, ct);
        if (existing is not null) return Ok(existing);
        var projection = new Projection
        {
            PiEmployeeId = piEmployeeId!,
            Name = request.Draft.Name,
            HistoryMonths = request.Draft.HistoryMonths,
            CreationKey = request.CreationKey,
        };
        CopySnapshot(projection, request.Draft);
        return await InsertAsync(projection, ct);
    }

    /// <summary>Copies the authorized stored snapshot, retaining nested IDs and assumptions without fetching fresh inputs.</summary>
    [HttpPost("{id:int}/duplicate")]
    public async Task<IActionResult> Duplicate(int id, DuplicateProjectionRequest request, CancellationToken ct)
    {
        if (!ValidName(request.Name)) return BadRequest("Name must contain 1 to 200 characters and cannot be blank.");
        if (request.CreationKey == Guid.Empty) return BadRequest("A nonempty CreationKey is required.");
        // Authorize the source on every attempt, including a replay of an already-created copy.
        var (source, error) = await LoadAsync(id, ct);
        if (error is not null) return error;
        var existing = await FindCreationAsync(source!.PiEmployeeId, request.CreationKey, ct);
        if (existing is not null) return Ok(existing);

        var projection = new Projection
        {
            PiEmployeeId = source.PiEmployeeId,
            Name = request.Name,
            HistoryMonths = source.HistoryMonths,
            CreationKey = request.CreationKey,
        };
        CopySnapshot(projection, new(source.Name, source.HistoryMonths, source.SeededAt, source.FundingSources, source.Appointments));
        return await InsertAsync(projection, ct);
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
        if (!ValidName(request.Name) || !ValidDraft(new(request.Name, request.HistoryMonths, request.ExpectedSeededAt!.Value, request.FundingSources, request.Appointments)))
            return BadRequest("The plan requires valid sources, unique positive funding source/appointment IDs, and valid allocation references.");

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
            projection.FundingSources = draft.FundingSources;
            projection.Appointments = draft.Appointments;
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

        var capture = await seeder.CaptureDraftAsync(projection.PiEmployeeId, request.HistoryMonths,
            User.GetUserIdentifier(), User.GetEmulatingUser(), ct, projection.SeededAt);
        // A reset replaces captured inputs only after the complete read succeeds; identity and name remain saved-plan metadata.
        projection.HistoryMonths = capture.Draft.HistoryMonths;
        projection.SeededAt = capture.Draft.SeededAt;
        projection.FundingSources = capture.Draft.FundingSources;
        projection.Appointments = capture.Draft.Appointments;
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

    private static bool ValidName(string? name) => !string.IsNullOrWhiteSpace(name) && name.Length <= 200;

    private static bool ValidDraft(ProjectionDraft draft)
    {
        if (!ValidName(draft.Name) || !Windows.Contains(draft.HistoryMonths) || !ValidToken(draft.SeededAt) || draft.FundingSources is null || draft.Appointments is null) return false;
        if (draft.FundingSources.Any(p => p is null || p.Id <= 0 || p.Budgets is null || p.Actuals is null || p.RunRates is null || p.Expenses is null
                || p.Budgets.Any(b => b is null) || p.Actuals.Any(a => a is null) || p.RunRates.Any(r => r is null) || p.Expenses.Any(e => e is null))
            || draft.Appointments.Any(j => j is null || j.Id <= 0 || j.Allocations is null || j.Allocations.Any(f => f is null))) return false;
        if (!ValidSources(draft.FundingSources)) return false;
        var sourceIds = draft.FundingSources.Select(p => p.Id).ToHashSet();
        return sourceIds.Count == draft.FundingSources.Count
            && draft.Appointments.Select(j => j.Id).Distinct().Count() == draft.Appointments.Count
            && draft.Appointments.SelectMany(j => j.Allocations).All(f => f.FundingSourceId is null || sourceIds.Contains(f.FundingSourceId.Value));
    }

    /// <summary>Each source has an explicit capture and kind; a captured task may appear only once in a plan.</summary>
    private static bool ValidSources(List<ProjectionFundingSource> sources)
    {
        foreach (var source in sources)
        {
            if (!ValidToken(source.CapturedAt) || !Enum.IsDefined(source.SourceKind)
                || string.IsNullOrWhiteSpace(source.Name) || source.StartDate > source.EndDate) return false;
            if (source.SourceKind == ProjectionSourceKind.Task && string.IsNullOrWhiteSpace(source.ProjectNumber)) return false;
            if (source.SourceKind == ProjectionSourceKind.Planned
                && (source.ProjectNumber is not null || source.TaskNumber is not null || source.StartDate is null)) return false;
        }
        var tasks = sources.Where(s => s.SourceKind == ProjectionSourceKind.Task).ToList();
        return tasks.Select(s => ProjectionSeedPolicy.TaskKey(s.ProjectNumber, s.TaskNumber)).Distinct().Count() == tasks.Count;
    }

    private static void CopySnapshot(Projection projection, ProjectionDraft snapshot)
    {
        var copy = JsonSerializer.Deserialize<ProjectionDraft>(JsonSerializer.Serialize(snapshot))!;
        projection.SeededAt = copy.SeededAt;
        projection.FundingSources = copy.FundingSources!;
        projection.Appointments = copy.Appointments!;
    }

    private Task<Projection?> FindCreationAsync(string piEmployeeId, Guid creationKey, CancellationToken ct) =>
        db.Projections.AsNoTracking()
            .SingleOrDefaultAsync(p => p.PiEmployeeId == piEmployeeId && p.CreationKey == creationKey, ct);

    /// <summary>The database unique key chooses one creation winner; retries return that row without replacing subsequent edits.</summary>
    private async Task<IActionResult> InsertAsync(Projection projection, CancellationToken ct)
    {
        projection.CreatedBy = User.GetUserIdentifier();
        projection.CreatedAt = (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        Touch(projection);
        db.Projections.Add(projection);
        try
        {
            await db.SaveChangesAsync(ct);
            return Ok(projection);
        }
        catch (DbUpdateException exception) when (IsCreationKeyConflict(exception))
        {
            db.Entry(projection).State = EntityState.Detached;
            // A winning insert may have raced with an access change; never return it without rechecking.
            if (!await CanAccessPiAsync(projection.PiEmployeeId, ct)) return Forbid();
            var existing = await FindCreationAsync(projection.PiEmployeeId, projection.CreationKey, ct);
            if (existing is null) throw;
            return Ok(existing);
        }
    }

    /// <summary>Only the creation-key unique index represents a safely replayable insert race.</summary>
    private static bool IsCreationKeyConflict(DbUpdateException exception) =>
        exception.InnerException is SqlException sqlException && sqlException.Errors.Cast<SqlError>().Any(error =>
            error.Number is 2601 or 2627 && error.Message.Contains("IX_Projections_PiEmployeeId_CreationKey", StringComparison.OrdinalIgnoreCase));

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
