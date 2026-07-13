using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Server.Controllers;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.tests.Controllers;

public sealed class FinancialSummaryControllerTests
{
    [Fact]
    public async Task Query_returns_bad_request_when_no_dimensions()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        var result = await controller.QueryAsync(new FinancialSummaryQuery { Dimensions = Array.Empty<string>() }, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Query_returns_rows_for_valid_request()
    {
        var rows = new List<FinancialSummaryRow>
        {
            new() { Fund = "13U00", FundDesc = "General", Revenue = 100m, Expenses = 40m, EndingBalance = 60m },
        };
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx, new ResolvingDatamartService(summaryRows: rows));

        var result = await controller.QueryAsync(new FinancialSummaryQuery { Dimensions = new[] { "Fund" } }, CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        ok.Value.Should().BeEquivalentTo(rows);
    }

    [Fact]
    public async Task Options_returns_bad_request_when_segment_missing()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        var result = await controller.OptionsAsync(new FinancialSummaryOptionsQuery { Segment = "" }, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task UpsertLabel_rejects_all_empty_segments()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        var result = await controller.UpsertLabelAsync(
            new FinancialSummaryController.UpsertLabelRequest(null, "", "  ", null, null, null, "some text"),
            CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
        ctx.FinancialSummaryLabels.Should().BeEmpty();
    }

    [Fact]
    public async Task UpsertLabel_creates_then_updates_then_deletes()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        var create = await controller.UpsertLabelAsync(
            new FinancialSummaryController.UpsertLabelRequest(null, "13U00", null, null, null, null, "summer employment 2026"),
            CancellationToken.None);
        create.Should().BeOfType<OkObjectResult>();
        ctx.FinancialSummaryLabels.Should().ContainSingle(l => l.Fund == "13U00" && l.Text == "summer employment 2026");

        var update = await controller.UpsertLabelAsync(
            new FinancialSummaryController.UpsertLabelRequest(null, "13U00", null, null, null, null, "updated"),
            CancellationToken.None);
        update.Should().BeOfType<OkObjectResult>();
        ctx.FinancialSummaryLabels.Should().ContainSingle(l => l.Fund == "13U00" && l.Text == "updated");

        var delete = await controller.UpsertLabelAsync(
            new FinancialSummaryController.UpsertLabelRequest(null, "13U00", null, null, null, null, "  "),
            CancellationToken.None);
        delete.Should().BeOfType<NoContentResult>();
        ctx.FinancialSummaryLabels.Should().BeEmpty();
    }

    [Fact]
    public async Task UpsertLabel_treats_different_segment_combinations_as_distinct()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        await controller.UpsertLabelAsync(
            new FinancialSummaryController.UpsertLabelRequest(null, "13U00", null, null, null, null, "fund only"),
            CancellationToken.None);
        await controller.UpsertLabelAsync(
            new FinancialSummaryController.UpsertLabelRequest("ADNO001", "13U00", null, null, null, null, "dept and fund"),
            CancellationToken.None);

        ctx.FinancialSummaryLabels.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetLabels_returns_the_shared_layer()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);
        await controller.UpsertLabelAsync(
            new FinancialSummaryController.UpsertLabelRequest(null, "13U00", null, null, null, null, "summer employment 2026"),
            CancellationToken.None);

        var result = await controller.GetLabelsAsync(CancellationToken.None);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Which;
        var labels = ok.Value.Should().BeAssignableTo<IReadOnlyList<FinancialSummaryController.LabelResponse>>().Which;
        labels.Should().ContainSingle(l => l.Fund == "13U00" && l.Text == "summer employment 2026");
    }

    private static FinancialSummaryController MakeController(
        AppDbContext ctx,
        IDatamartService? datamart = null)
    {
        return new FinancialSummaryController(datamart ?? new ResolvingDatamartService(), ctx)
        {
            ControllerContext = MakeContext(),
        };
    }

    private static ControllerContext MakeContext()
    {
        return new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = CreateUser(roles: [Role.Names.DepartmentViewer]),
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
        private readonly IReadOnlyList<FinancialSummaryRow> _summaryRows;
        private readonly IReadOnlyList<FinancialSummaryOption> _options;

        public ResolvingDatamartService(
            IReadOnlyList<FinancialSummaryRow>? summaryRows = null,
            IReadOnlyList<FinancialSummaryOption>? options = null)
        {
            _summaryRows = summaryRows ?? Array.Empty<FinancialSummaryRow>();
            _options = options ?? Array.Empty<FinancialSummaryOption>();
        }

        public Task<IReadOnlyList<FinancialSummaryRow>> GetGlBalanceSummaryAsync(
            FinancialSummaryQuery query,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => Task.FromResult(_summaryRows);

        public Task<IReadOnlyList<FinancialSummaryOption>> GetGlBalanceFilterOptionsAsync(
            FinancialSummaryOptionsQuery query,
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
            => throw new InvalidOperationException("Not needed for FinancialSummaryController tests.");

        public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for FinancialSummaryController tests.");

        public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for FinancialSummaryController tests.");

        public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for FinancialSummaryController tests.");

        public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for FinancialSummaryController tests.");

        public Task<ProjectProjectionResult> GetProjectProjectionAsync(string projectNumber, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
            => throw new InvalidOperationException("Not needed for FinancialSummaryController tests.");
    }
}
