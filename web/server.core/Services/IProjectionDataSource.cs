using server.core.Models;

namespace server.core.Services;

public interface IProjectionDataSource
{
    /// <summary>Projects, budgets, actuals, and run-rates for active projects where the employee is project PI.</summary>
    Task<ProjectionSeedData> GetProjectionSeedAsync(
        string piEmployeeId, string? applicationUser, string? emulatingUser, CancellationToken ct);

    /// <summary>Personnel funding lines, always from the Cognos source regardless of the configured personnel source.</summary>
    Task<IReadOnlyList<PositionBudgetRecord>> GetCognosPositionBudgetsAsync(
        IReadOnlyList<string> projectNumbers, string? applicationUser, string? emulatingUser, CancellationToken ct);

    Task<IReadOnlyList<JobCodeRecord>> GetJobCodesAsync(CancellationToken ct);

    Task<IReadOnlyList<string>> GetExpenditureCategoriesAsync(CancellationToken ct);
}
