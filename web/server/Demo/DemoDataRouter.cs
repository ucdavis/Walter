using server.core.Models;
using server.core.Services;

namespace Server.Demo;

/// <summary>Answers DEMO-prefixed ids from in-memory demo data and sends every other id to the datamart.</summary>
public sealed class DemoDataRouter(
    IDatamartService datamart,
    IPpmPortfolioReader reader,
    IProjectionDataSource projections,
    DemoDataSource demo) : IDatamartService, IPpmPortfolioReader, IProjectionDataSource
{
    private static bool IsDemo(string? id) =>
        id?.TrimStart().StartsWith("DEMO", StringComparison.OrdinalIgnoreCase) == true;

    public Task<IReadOnlyList<ProjectSearchRecord>> SearchProjectsAsync(string fuzzyQuery, string exactProjectNumber, CancellationToken ct = default) =>
        datamart.SearchProjectsAsync(fuzzyQuery, exactProjectNumber, ct);

    public Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(string query, int limit, CancellationToken ct = default) =>
        datamart.SearchPeopleAsync(query, limit, ct);

    public Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(string iamId, CancellationToken ct = default) =>
        IsDemo(iamId) ? demo.GetSearchablePersonByIamIdAsync(iamId, ct) : datamart.GetSearchablePersonByIamIdAsync(iamId, ct);

    public Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(string employeeId, CancellationToken ct = default) =>
        IsDemo(employeeId)
            ? demo.GetSearchablePersonByEmployeeIdAsync(employeeId, ct)
            : datamart.GetSearchablePersonByEmployeeIdAsync(employeeId, ct);

    public Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct = default) =>
        SplitAsync(employeeIds,
            ids => demo.GetSearchablePeopleByEmployeeIdsAsync(ids, ct),
            ids => datamart.GetSearchablePeopleByEmployeeIdsAsync(ids, ct));

    public Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(string email, CancellationToken ct = default) =>
        datamart.GetSearchablePersonByEmailAsync(email, ct);

    public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(DateTime startDate, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        datamart.GetEmployeeAccrualBalancesAsync(startDate, applicationUser, emulatingUser, ct);

    public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        SplitAsync(projectNumbers,
            ids => demo.GetFacultyPortfolioAsync(ids, applicationUser, emulatingUser, ct),
            ids => datamart.GetFacultyPortfolioAsync(ids, applicationUser, emulatingUser, ct));

    public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        SplitAsync(projectNumbers,
            ids => demo.GetPositionBudgetsAsync(ids, applicationUser, emulatingUser, ct),
            ids => datamart.GetPositionBudgetsAsync(ids, applicationUser, emulatingUser, ct));

    public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        SplitAsync(projectNumbers,
            ids => demo.GetGLPPMReconciliationAsync(ids, applicationUser, emulatingUser, ct),
            ids => datamart.GetGLPPMReconciliationAsync(ids, applicationUser, emulatingUser, ct));

    public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        SplitAsync(projectNumbers,
            ids => demo.GetGLTransactionListingsAsync(ids, applicationUser, emulatingUser, ct),
            ids => datamart.GetGLTransactionListingsAsync(ids, applicationUser, emulatingUser, ct));

    public Task<ProjectProjectionResult> GetProjectProjectionAsync(string projectNumber, int historyMonths, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        IsDemo(projectNumber)
            ? demo.GetProjectProjectionAsync(projectNumber, historyMonths, applicationUser, emulatingUser, ct)
            : datamart.GetProjectProjectionAsync(projectNumber, historyMonths, applicationUser, emulatingUser, ct);

    public Task<IReadOnlyList<ProjectCostRecord>> GetProjectCostsAsync(string projectNumber, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        IsDemo(projectNumber)
            ? demo.GetProjectCostsAsync(projectNumber, applicationUser, emulatingUser, ct)
            : datamart.GetProjectCostsAsync(projectNumber, applicationUser, emulatingUser, ct);

    public Task<IReadOnlyList<DepartmentBalanceRow>> GetGlBalanceSummaryAsync(DepartmentBalancesQuery query, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        datamart.GetGlBalanceSummaryAsync(query, applicationUser, emulatingUser, ct);

    public Task<IReadOnlyList<DepartmentBalanceOption>> GetGlBalanceFilterOptionsAsync(DepartmentBalancesOptionsQuery query, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        datamart.GetGlBalanceFilterOptionsAsync(query, applicationUser, emulatingUser, ct);

    public Task<IReadOnlyList<PpmProjectMembership>> GetEmployeeProjectsAsync(string employeeId, string roleName, CancellationToken ct = default) =>
        IsDemo(employeeId)
            ? demo.GetEmployeeProjectsAsync(employeeId, roleName, ct)
            : reader.GetEmployeeProjectsAsync(employeeId, roleName, ct);

    public Task<IReadOnlyList<PpmTeamMember>> GetProjectTeamAsync(string projectNumber, string roleName, CancellationToken ct = default) =>
        IsDemo(projectNumber)
            ? demo.GetProjectTeamAsync(projectNumber, roleName, ct)
            : reader.GetProjectTeamAsync(projectNumber, roleName, ct);

    public Task<IReadOnlySet<string>> GetProjectManagerEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct = default) =>
        reader.GetProjectManagerEmployeeIdsAsync(employeeIds, ct);

    public Task<ProjectionSeedData> GetProjectionSeedAsync(string piEmployeeId, string? applicationUser, string? emulatingUser, CancellationToken ct) =>
        IsDemo(piEmployeeId)
            ? demo.GetProjectionSeedAsync(piEmployeeId, ct)
            : projections.GetProjectionSeedAsync(piEmployeeId, applicationUser, emulatingUser, ct);

    public Task<IReadOnlyList<PositionBudgetRecord>> GetCognosPositionBudgetsAsync(IReadOnlyList<string> projectNumbers, string? applicationUser, string? emulatingUser, CancellationToken ct) =>
        SplitAsync(projectNumbers,
            ids => demo.GetPositionBudgetsAsync(ids, applicationUser, emulatingUser, ct),
            ids => projections.GetCognosPositionBudgetsAsync(ids, applicationUser, emulatingUser, ct));

    public Task<IReadOnlyList<JobCodeRecord>> GetJobCodesAsync(CancellationToken ct) => projections.GetJobCodesAsync(ct);

    public Task<IReadOnlyList<string>> GetExpenditureCategoriesAsync(CancellationToken ct) => projections.GetExpenditureCategoriesAsync(ct);

    /// <summary>Answers the demo ids in memory and sends the rest to the datamart in one call.</summary>
    private static async Task<IReadOnlyList<T>> SplitAsync<T>(
        IEnumerable<string> ids,
        Func<IReadOnlyList<string>, Task<IReadOnlyList<T>>> fromDemo,
        Func<IReadOnlyList<string>, Task<IReadOnlyList<T>>> fromDatamart)
    {
        var all = ids.ToList();
        var demoIds = all.Where(IsDemo).ToList();
        if (demoIds.Count == 0) return await fromDatamart(all);

        var rows = new List<T>(await fromDemo(demoIds));
        var realIds = all.Except(demoIds).ToList();
        if (realIds.Count > 0) rows.AddRange(await fromDatamart(realIds));
        return rows;
    }
}
