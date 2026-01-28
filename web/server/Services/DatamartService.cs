using server.Helpers;
using server.Models;

namespace server.Services;

public interface IDatamartService
{
    Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
        IEnumerable<string> projectIds, CancellationToken ct = default);

    Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
        IEnumerable<string> projectIds, CancellationToken ct = default);
}

public sealed class DatamartService : IDatamartService
{
    private readonly DmConnectionHelper _db;
    private readonly string _appName;

    public DatamartService(DmConnectionHelper db, IWebHostEnvironment env)
    {
        _db = db;
        _appName = $"Walter-{env.EnvironmentName}";
    }

    public async Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
        IEnumerable<string> projectIds, CancellationToken ct = default)
    {
        var projectIdsParam = string.Join(",", projectIds);
        return await _db.ExecuteSprocAsync<FacultyPortfolioRecord>(
            "dbo.usp_GetFacultyDeptPortfolio",
            new { ProjectIds = projectIdsParam, ApplicationName = _appName },
            ct: ct);
    }

    public async Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
        IEnumerable<string> projectIds, CancellationToken ct = default)
    {
        var projectIdsParam = string.Join(",", projectIds);
        return await _db.ExecuteSprocAsync<PositionBudgetRecord>(
            "dbo.usp_GetPositionBudgets",
            new { ProjectIds = projectIdsParam, ApplicationName = _appName },
            ct: ct);
    }
}
