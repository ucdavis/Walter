using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Server.Controllers;
using Server.Tests;
using server.Helpers;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using server.tests.Fakes;
using server.Services;

namespace server.tests.Controllers;

public sealed class SearchControllerTests
{
    [Fact]
    public async Task GetCatalog_excludes_accruals_report_when_not_authorized()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            roles: []);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().NotContain("accruals");
    }

    [Fact]
    public async Task GetCatalog_includes_accruals_report_when_user_has_accrual_viewer_role()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            roles: [Role.Names.AccrualViewer]);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().Contain("accruals");
    }

    [Fact]
    public async Task GetCatalog_includes_accruals_report_when_user_is_admin()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            roles: [Role.Names.Admin]);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().Contain("accruals");
    }

    [Fact]
    public async Task GetCatalog_excludes_all_reports_entry_when_user_has_no_reports()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            roles: []);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().NotContain("reports");
    }

    [Fact]
    public async Task GetCatalog_includes_all_reports_entry_when_user_can_view_accruals()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            roles: [Role.Names.AccrualViewer]);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().Contain("reports");
    }

    [Fact]
    public async Task SearchPeople_returns_empty_for_non_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            datamartService: new FakeDatamartService(
                searchPeople:
                [
                    new SearchablePersonRecord
                    {
                        IamId = "1000000001",
                        EmployeeId = "E0000001",
                        Name = "Elisabeth Forrestel",
                        Email = "elisabeth.forrestel@ucdavis.edu",
                    },
                ]),
            roles: []);

        var result = await controller.SearchPeople("elis", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchController.SearchDirectoryPerson>>().Which;

        payload.Should().BeEmpty();
    }

    [Fact]
    public async Task SearchPeople_returns_datamart_people_for_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            datamartService: new FakeDatamartService(
                searchPeople:
                [
                    new SearchablePersonRecord
                    {
                        IamId = "1000000001",
                        EmployeeId = "E0000001",
                        Name = "Elisabeth Forrestel",
                        Email = "elisabeth.forrestel@ucdavis.edu",
                    },
                    new SearchablePersonRecord
                    {
                        IamId = "1000000002",
                        EmployeeId = "E0000002",
                        Name = "Edward Spang",
                        Email = "esspang@ucdavis.edu",
                    },
                ]),
            roles: [Role.Names.FinancialViewer]);

        var result = await controller.SearchPeople("spang", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchController.SearchDirectoryPerson>>().Which;

        payload.Should().HaveCount(2);
        payload.Select(p => p.IamId).Should().Contain("1000000002");
        payload.Select(p => p.Id).Should().Contain("1000000002");
        payload.Select(p => p.Name).Should().Contain("Edward Spang");
        payload.SelectMany(p => p.Keywords).Should().Contain("esspang@ucdavis.edu");
        payload.SelectMany(p => p.Keywords).Should().NotContain("E0000002");
    }

    [Fact]
    public async Task SearchPeople_reports_is_project_manager_when_person_manages_projects()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            datamartService: new FakeDatamartService(
                searchPeople:
                [
                    new SearchablePersonRecord
                    {
                        IamId = "1000000003",
                        EmployeeId = "PM000003",
                        Name = "Patty Manager",
                        Email = "patty@ucdavis.edu",
                    },
                ]),
            roles: [Role.Names.FinancialViewer],
            projectManagerEmployeeIds: ["PM000003"]);

        var result = await controller.SearchPeople("patty", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchController.SearchDirectoryPerson>>().Which;

        payload.Should().ContainSingle().Which.IsProjectManager.Should().BeTrue();
    }

    [Fact]
    public async Task SearchPeople_limits_results_to_top_five_for_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            datamartService: new FakeDatamartService(
                searchPeople: Enumerable.Range(1, 7)
                    .Select(i => new SearchablePersonRecord
                    {
                        IamId = $"100000000{i}",
                        EmployeeId = $"E000000{i}",
                        Name = $"Person {i}",
                        Email = $"person{i}@ucdavis.edu",
                    })
                    .ToArray()),
            roles: [Role.Names.FinancialViewer]);

        var result = await controller.SearchPeople("person", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchController.SearchDirectoryPerson>>().Which;

        payload.Should().HaveCount(5);
        payload.Select(p => p.IamId).Should().ContainInOrder(
            "1000000001",
            "1000000002",
            "1000000003",
            "1000000004",
            "1000000005");
    }

    [Fact]
    public async Task ResolveProjectPi_returns_pi_iam_id_when_pi_email_resolves()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            datamartService: new FakeDatamartService(
                searchPeople:
                [
                    new SearchablePersonRecord
                    {
                        IamId = "IAM-PI",
                        EmployeeId = "EPI",
                        Name = "Pat PI",
                        Email = "pi@ucdavis.edu",
                    },
                    new SearchablePersonRecord
                    {
                        IamId = "IAM-PM",
                        EmployeeId = "EPM",
                        Name = "Morgan PM",
                        Email = "pm@ucdavis.edu",
                    },
                ]),
            financialApiService: new FakeFinancialApiService(
                [],
                new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>
                {
                    ["ABC123"] =
                    [
                        new FakeFinancialProjectTeamMember(
                            PpmRole.PrincipalInvestigator,
                            "Pat PI",
                            "pi@ucdavis.edu"),
                        new FakeFinancialProjectTeamMember(
                            PpmRole.ProjectManager,
                            "Morgan PM",
                            "pm@ucdavis.edu"),
                    ],
                }),
            roles: [Role.Names.FinancialViewer]);

        var result = await controller.ResolveProjectPi("abc123", CancellationToken.None);

        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.ResolveProjectPiResponse>().Which;
        payload.IamId.Should().Be("IAM-PI");
        payload.ProjectNumber.Should().Be("ABC123");
    }

    [Fact]
    public async Task ResolveProjectPi_falls_back_to_pm_when_project_is_orphaned()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            datamartService: new FakeDatamartService(
                searchPeople:
                [
                    new SearchablePersonRecord
                    {
                        IamId = "IAM-PM",
                        EmployeeId = "EPM",
                        Name = "Morgan PM",
                        Email = "pm@ucdavis.edu",
                    },
                ]),
            financialApiService: new FakeFinancialApiService(
                [],
                new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>
                {
                    ["ABC123"] =
                    [
                        new FakeFinancialProjectTeamMember(
                            PpmRole.ProjectManager,
                            "Morgan PM",
                            "pm@ucdavis.edu"),
                    ],
                }),
            roles: [Role.Names.FinancialViewer]);

        var result = await controller.ResolveProjectPi("ABC123", CancellationToken.None);

        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.ResolveProjectPiResponse>().Which;
        payload.IamId.Should().Be("IAM-PM");
        payload.ProjectNumber.Should().Be("ABC123");
    }

    [Fact]
    public async Task ResolveProjectPi_does_not_fallback_to_pm_when_pi_exists_but_cannot_resolve()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(
            ctx,
            authorizationService,
            datamartService: new FakeDatamartService(
                searchPeople:
                [
                    new SearchablePersonRecord
                    {
                        IamId = "IAM-PM",
                        EmployeeId = "EPM",
                        Name = "Morgan PM",
                        Email = "pm@ucdavis.edu",
                    },
                ]),
            financialApiService: new FakeFinancialApiService(
                [],
                new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>
                {
                    ["ABC123"] =
                    [
                        new FakeFinancialProjectTeamMember(
                            PpmRole.PrincipalInvestigator,
                            "Pat PI",
                            "missing-pi@ucdavis.edu"),
                        new FakeFinancialProjectTeamMember(
                            PpmRole.ProjectManager,
                            "Morgan PM",
                            "pm@ucdavis.edu"),
                    ],
                }),
            roles: [Role.Names.FinancialViewer]);

        var result = await controller.ResolveProjectPi("ABC123", CancellationToken.None);

        result.Should().BeOfType<NotFoundResult>();
    }

    private static IAuthorizationService CreateAuthorizationService()
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddDebug().SetMinimumLevel(LogLevel.Trace));
        services.AddAuthorizationPolicies();
        var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IAuthorizationService>();
    }

    private static SearchController CreateController(
        AppDbContext ctx,
        IAuthorizationService authorizationService,
        IReadOnlyList<string> roles,
        IDatamartService? datamartService = null,
        IFinancialApiService? financialApiService = null,
        IEnumerable<string>? projectManagerEmployeeIds = null)
    {
        var httpContext = new DefaultHttpContext
        {
            User = CreateUser(roles),
        };

        return new SearchController(
            ctx,
            financialApiService ?? new FakeFinancialApiService(projectManagerEmployeeIds ?? Array.Empty<string>()),
            authorizationService,
            datamartService ?? new FakeDatamartService())
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
    }

    private sealed class FakeDatamartService : IDatamartService
    {
        private readonly IReadOnlyList<SearchablePersonRecord> _searchPeople;

        public FakeDatamartService(IReadOnlyList<SearchablePersonRecord>? searchPeople = null)
        {
            _searchPeople = searchPeople ?? [];
        }

        public Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(
            string query,
            int limit,
            CancellationToken ct = default)
        {
            return Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(_searchPeople.Take(limit).ToArray());
        }

        public Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(
            string iamId,
            CancellationToken ct = default)
        {
            return Task.FromResult(_searchPeople.FirstOrDefault(p =>
                string.Equals(p.IamId, iamId, StringComparison.OrdinalIgnoreCase)));
        }

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(
            string employeeId,
            CancellationToken ct = default)
        {
            return Task.FromResult(_searchPeople.FirstOrDefault(p =>
                string.Equals(p.EmployeeId, employeeId, StringComparison.OrdinalIgnoreCase)));
        }

        public Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(
            IEnumerable<string> employeeIds,
            CancellationToken ct = default)
        {
            var employeeIdSet = employeeIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            return Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(
                _searchPeople.Where(p => employeeIdSet.Contains(p.EmployeeId)).ToArray());
        }

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(
            string email,
            CancellationToken ct = default)
        {
            return Task.FromResult(_searchPeople.FirstOrDefault(p =>
                string.Equals(p.Email, email, StringComparison.OrdinalIgnoreCase)));
        }

        public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
            DateTime startDate,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new NotImplementedException();
        }

        public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new NotImplementedException();
        }

        public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new NotImplementedException();
        }

        public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new NotImplementedException();
        }

        public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new NotImplementedException();
        }
    }
}
