using server.core.Models;
using server.core.Services;

namespace server.tests.Fakes;

public sealed class FakeDatamartService : IDatamartService
{
    private readonly SearchablePersonRecord? _person;
    private readonly ProjectProjectionResult? _projection;
    private readonly IReadOnlyList<FacultyPortfolioRecord>? _portfolio;
    private readonly IReadOnlyList<DepartmentBalanceRow> _summaryRows;
    private readonly IReadOnlyList<DepartmentBalanceOption> _options;

    private readonly bool _allowReports;
    public int ReportCalls { get; private set; }

    public int? LastHistoryMonths { get; private set; }

    public FakeDatamartService(
        SearchablePersonRecord? person = null,
        ProjectProjectionResult? projection = null,
        IReadOnlyList<FacultyPortfolioRecord>? portfolio = null,
        IReadOnlyList<DepartmentBalanceRow>? summaryRows = null,
        IReadOnlyList<DepartmentBalanceOption>? options = null,
        bool allowReports = false)
    {
        _allowReports = allowReports;
        _person = person;
        _projection = projection;
        _portfolio = portfolio;
        _summaryRows = summaryRows ?? Array.Empty<DepartmentBalanceRow>();
        _options = options ?? Array.Empty<DepartmentBalanceOption>();
    }

    public Task<IReadOnlyList<ProjectSearchRecord>> SearchProjectsAsync(
        string fuzzyQuery, string exactProjectNumber, CancellationToken ct = default)
        => throw new NotImplementedException();

    public Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(
        string query,
        int limit,
        CancellationToken ct = default)
    {
        return Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(Array.Empty<SearchablePersonRecord>());
    }

    public Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(
        string iamId,
        CancellationToken ct = default)
    {
        return Task.FromResult(_person is not null &&
            string.Equals(iamId, _person.IamId, StringComparison.OrdinalIgnoreCase)
            ? _person
            : null);
    }

    public Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(
        string employeeId,
        CancellationToken ct = default)
    {
        return Task.FromResult(_person is not null &&
            string.Equals(employeeId, _person.EmployeeId, StringComparison.OrdinalIgnoreCase)
            ? _person
            : null);
    }

    public Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(
        IEnumerable<string> employeeIds,
        CancellationToken ct = default)
    {
        return Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(
            _person is not null && employeeIds.Contains(_person.EmployeeId, StringComparer.OrdinalIgnoreCase)
                ? new[] { _person }
                : Array.Empty<SearchablePersonRecord>());
    }

    public Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(
        string email,
        CancellationToken ct = default)
    {
        return Task.FromResult<SearchablePersonRecord?>(null);
    }

    public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
        IEnumerable<string> projectNumbers,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        ReportCalls++;
        if (_portfolio is null)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        var requested = new HashSet<string>(projectNumbers, StringComparer.OrdinalIgnoreCase);
        return Task.FromResult<IReadOnlyList<FacultyPortfolioRecord>>(
            _portfolio.Where(p => requested.Contains(p.ProjectNumber)).ToList());
    }

    public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
        IEnumerable<string> projectNumbers,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        ReportCalls++;
        if (_allowReports) return Task.FromResult<IReadOnlyList<PositionBudgetRecord>>([]);
        throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
    }

    public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
        DateTime startDate,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
    }

    public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(
        IEnumerable<string> projectNumbers,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        ReportCalls++;
        if (_allowReports) return Task.FromResult<IReadOnlyList<GLPPMReconciliationRecord>>([]);
        throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
    }

    public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(
        IEnumerable<string> projectNumbers,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        ReportCalls++;
        if (_allowReports) return Task.FromResult<IReadOnlyList<GLTransactionRecord>>([]);
        throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
    }

    public Task<ProjectProjectionResult> GetProjectProjectionAsync(
        string projectNumber,
        int historyMonths,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        ReportCalls++;
        LastHistoryMonths = historyMonths;
        return _projection is not null
            ? Task.FromResult(_projection)
            : throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
    }

    public Task<IReadOnlyList<ProjectCostRecord>> GetProjectCostsAsync(
        string projectNumber,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        ReportCalls++;
        if (_allowReports) return Task.FromResult<IReadOnlyList<ProjectCostRecord>>([]);
        throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
    }

    public Task<IReadOnlyList<DepartmentBalanceRow>> GetGlBalanceSummaryAsync(
        DepartmentBalancesQuery query,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
        => Task.FromResult(_summaryRows);

    public Task<IReadOnlyList<DepartmentBalanceOption>> GetGlBalanceFilterOptionsAsync(
        DepartmentBalancesOptionsQuery query,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
        => Task.FromResult(_options);
}
