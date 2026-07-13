using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Server.Controllers;
using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.tests.Controllers;

public sealed class DepartmentBalancesControllerTests
{
    [Fact]
    public async Task Query_returns_bad_request_when_no_dimensions()
    {
        var controller = MakeController();

        var result = await controller.QueryAsync(new DepartmentBalancesQuery { Dimensions = Array.Empty<string>() }, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Query_returns_rows_for_valid_request()
    {
        var rows = new List<DepartmentBalanceRow>
        {
            new() { Fund = "13U00", FundDesc = "General", Revenue = 100m, Expenses = 40m, EndingBalance = 60m },
        };
        var controller = MakeController(new ResolvingDatamartService(summaryRows: rows));

        var result = await controller.QueryAsync(new DepartmentBalancesQuery { Dimensions = new[] { "Fund" } }, CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        ok.Value.Should().BeEquivalentTo(rows);
    }

    [Fact]
    public async Task Options_returns_bad_request_when_segment_missing()
    {
        var controller = MakeController();

        var result = await controller.OptionsAsync(new DepartmentBalancesOptionsQuery { Segment = "" }, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    private static DepartmentBalancesController MakeController(IDatamartService? datamart = null)
    {
        return new DepartmentBalancesController(datamart ?? new ResolvingDatamartService())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: [Role.Names.DepartmentViewer]),
                },
            },
        };
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
    }

    private sealed class ResolvingDatamartService : IDatamartService
    {
        private readonly IReadOnlyList<DepartmentBalanceRow> _summaryRows;
        private readonly IReadOnlyList<DepartmentBalanceOption> _options;

        public ResolvingDatamartService(
            IReadOnlyList<DepartmentBalanceRow>? summaryRows = null,
            IReadOnlyList<DepartmentBalanceOption>? options = null)
        {
            _summaryRows = summaryRows ?? Array.Empty<DepartmentBalanceRow>();
            _options = options ?? Array.Empty<DepartmentBalanceOption>();
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

        public Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(string query, int limit, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(Array.Empty<SearchablePersonRecord>());

        public Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(string iamId, CancellationToken ct = default)
            => Task.FromResult<SearchablePersonRecord?>(null);

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(string employeeId, CancellationToken ct = default)
            => Task.FromResult<SearchablePersonRecord?>(null);

        public Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(Array.Empty<SearchablePersonRecord>());

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(string email, CancellationToken ct = default)
            => Task.FromResult<SearchablePersonRecord?>(null);

        public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(DateTime startDate, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for DepartmentBalancesController tests.");

        public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for DepartmentBalancesController tests.");

        public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for DepartmentBalancesController tests.");

        public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for DepartmentBalancesController tests.");

        public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for DepartmentBalancesController tests.");

        public Task<ProjectProjectionResult> GetProjectProjectionAsync(string projectNumber, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for DepartmentBalancesController tests.");
    }
}
