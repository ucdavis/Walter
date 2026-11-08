using server.core.Models;

namespace server.core.Services;

public interface IProjectionDataSource
{
    /// <summary>Latest imported inputs for active projects where the employee is project PI; snapshotAtUtc anchors the actuals and averaging windows.</summary>
    Task<ProjectionSeedData> GetProjectionSeedAsync(
        string piEmployeeId, DateTime snapshotAtUtc, string? applicationUser, string? emulatingUser, CancellationToken ct);

    /// <summary>Personnel funding lines, always from the Cognos source regardless of the configured personnel source.</summary>
    Task<IReadOnlyList<PositionBudgetRecord>> GetCognosPositionBudgetsAsync(
        IReadOnlyList<string> projectNumbers, string? applicationUser, string? emulatingUser, CancellationToken ct);

    Task<IReadOnlyList<JobCodeRecord>> GetJobCodesAsync(CancellationToken ct);

    Task<IReadOnlyList<string>> GetExpenditureCategoriesAsync(CancellationToken ct);
}
