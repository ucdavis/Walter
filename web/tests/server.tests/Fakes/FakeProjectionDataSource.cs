using server.core.Models;
using server.core.Services;

namespace server.tests.Fakes;

public sealed class FakeProjectionDataSource : IProjectionDataSource
{
    public ProjectionSeedData Seed { get; set; } = new();
    public List<PositionBudgetRecord> Personnel { get; set; } = [];
    public List<JobCodeRecord> JobCodes { get; set; } = [];
    public List<string> Categories { get; set; } = [];

    public Task<ProjectionSeedData> GetProjectionSeedAsync(
        string piEmployeeId, string? applicationUser, string? emulatingUser, CancellationToken ct) =>
        Task.FromResult(Seed);

    public Task<IReadOnlyList<PositionBudgetRecord>> GetCognosPositionBudgetsAsync(
        IReadOnlyList<string> projectNumbers, string? applicationUser, string? emulatingUser, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<PositionBudgetRecord>>(Personnel.Where(p => projectNumbers.Contains(p.ProjectId)).ToList());

    public Task<IReadOnlyList<JobCodeRecord>> GetJobCodesAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<JobCodeRecord>>(JobCodes);

    public Task<IReadOnlyList<string>> GetExpenditureCategoriesAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<string>>(Categories);
}
