using System.Security.Claims;
using AggieEnterpriseApi;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Server.Controllers;
using Server.Services;
using server.core.Models;
using server.core.Services;
using server.Helpers;
using server.Services;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using server.tests.Fakes;

namespace server.tests.Controllers;

public sealed class ProjectControllerTests
{
    [Fact]
    public async Task GetManagedFaculty_returns_empty_array_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ResolvingDatamartService(
                new SearchablePersonRecord
                {
                    IamId = "IAM-PM",
                    EmployeeId = "1000",
                    Name = "Project Manager",
                }),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader(), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions())))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetManagedFaculty("IAM-PM", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        var envelope = ok.Value.Should().BeOfType<ProjectController.ManagedPisEnvelope>().Which;
        envelope.ProjectManager.Should().BeNull();
        envelope.Pis.Should().BeEmpty();
    }

    [Fact]
    public async Task GetByIamId_returns_forbid_for_unknown_iam_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader(), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions())))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetByIamIdAsync("UNKNOWN-IAM", CancellationToken.None);

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetPersonnelForProjects_returns_forbid_for_unknown_iam_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader(), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions())))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetPersonnelForProjects(
            CancellationToken.None,
            iamId: "UNKNOWN-IAM",
            projectCodes: "PROJ-001");

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetManagedFaculty_returns_empty_array_for_unknown_iam_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader(), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions())))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetManagedFaculty("UNKNOWN-IAM", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        var envelope = ok.Value.Should().BeOfType<ProjectController.ManagedPisEnvelope>().Which;
        envelope.ProjectManager.Should().BeNull();
        envelope.Pis.Should().BeEmpty();
    }

    [Fact]
    public async Task GetProjection_returns_forbid_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader(), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions())))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetProjectionAsync("PROJ-001", CancellationToken.None);

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetProjection_returns_envelope_for_financial_viewer()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var projection = new ProjectProjectionResult
        {
            Categories = new[]
            {
                new ProjectProjectionCategory
                {
                    ExpenditureCategory = "01 - Salaries and Wages",
                    IsPersonnel = 1,
                    Budget = 500m,
                    SpentToDate = 100m,
                    Committed = 0m,
                    RemainingNow = 400m,
                },
            },
            Periods = new[]
            {
                new ProjectProjectionPeriod
                {
                    Month = "2026-06",
                    DisplayPeriod = "Jun-26",
                    Kind = "blended",
                    ExpenditureCategory = "01 - Salaries and Wages",
                    IsPersonnel = 1,
                    ActualAmount = 0m,
                    ProjectedAmount = 50m,
                    Remaining = 350m,
                },
            },
        };

        var controller = new ProjectController(
            new ResolvingDatamartService(projection: projection),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader(), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions())))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: [Role.Names.FinancialViewer]),
                },
            },
        };

        var result = await controller.GetProjectionAsync("PROJ-001", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        var envelope = ok.Value.Should().BeOfType<ProjectProjectionResult>().Which;
        envelope.Categories.Should().HaveCount(1);
        envelope.Periods.Should().HaveCount(1);
        envelope.Periods[0].Remaining.Should().Be(350m);
    }

    [Theory]
    [InlineData(6)]
    [InlineData(12)]
    public async Task GetProjection_passes_history_months_to_datamart(int historyMonths)
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var datamart = new ResolvingDatamartService(projection: new ProjectProjectionResult());
        var controller = CreateProjectionController(ctx, datamart);

        var result = await controller.GetProjectionAsync("PROJ-001", CancellationToken.None, historyMonths);

        result.Should().BeOfType<OkObjectResult>();
        datamart.LastHistoryMonths.Should().Be(historyMonths);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    [InlineData(24)]
    public async Task GetProjection_rejects_unsupported_history_months(int historyMonths)
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var datamart = new ResolvingDatamartService(projection: new ProjectProjectionResult());
        var controller = CreateProjectionController(ctx, datamart);

        var result = await controller.GetProjectionAsync("PROJ-001", CancellationToken.None, historyMonths);

        result.Should().BeOfType<BadRequestObjectResult>();
        datamart.LastHistoryMonths.Should().BeNull();
    }

    private static ProjectController CreateProjectionController(AppDbContext ctx, ResolvingDatamartService datamart)
        => new(
            datamart,
            CreateAuthorizationService(),
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader(), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions())))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: [Role.Names.FinancialViewer]),
                },
            },
        };

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetByIamId_forbids_requester_who_is_only_award_pi_on_target_pi_project(bool useGraphQLAPI)
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, employeeId: "EAWARDPI");

        var controller = CreatePortfolioController(
            ctx,
            useGraphQLAPI: useGraphQLAPI,
            targetPerson: new SearchablePersonRecord { IamId = "IAM-PI", EmployeeId = "EPI", Name = "Target PI" },
            projects: [TargetPiProjectWithAwardPi(awardPiEmployeeId: "EAWARDPI")],
            user: CreateUser(roles: [], objectId: requester.Id));

        var result = await controller.GetByIamIdAsync("IAM-PI", CancellationToken.None);

        result.Should().BeOfType<ForbidResult>();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetPersonnelForProjects_forbids_requester_who_is_only_award_pi_on_target_pi_project(bool useGraphQLAPI)
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, employeeId: "EAWARDPI");

        var controller = CreatePortfolioController(
            ctx,
            useGraphQLAPI: useGraphQLAPI,
            targetPerson: new SearchablePersonRecord { IamId = "IAM-PI", EmployeeId = "EPI", Name = "Target PI" },
            projects: [TargetPiProjectWithAwardPi(awardPiEmployeeId: "EAWARDPI")],
            user: CreateUser(roles: [], objectId: requester.Id));

        var result = await controller.GetPersonnelForProjects(
            CancellationToken.None,
            iamId: "IAM-PI",
            projectCodes: "SP001");

        result.Should().BeOfType<ForbidResult>();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetByIamId_allows_team_project_manager_of_target_pi(bool useGraphQLAPI)
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, employeeId: "EPM");

        var controller = CreatePortfolioController(
            ctx,
            useGraphQLAPI: useGraphQLAPI,
            targetPerson: new SearchablePersonRecord { IamId = "IAM-PI", EmployeeId = "EPI", Name = "Target PI" },
            projects: [TargetPiProjectWithAwardPi(awardPiEmployeeId: "EAWARDPI")],
            user: CreateUser(roles: [], objectId: requester.Id),
            portfolio: [new FacultyPortfolioRecord { ProjectNumber = "SP001", ProjectStatus = "ACTIVE" }]);

        var result = await controller.GetByIamIdAsync("IAM-PI", CancellationToken.None);

        var projects = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IEnumerable<FacultyPortfolioRecord>>().Which;
        projects.Should().ContainSingle(p => p.ProjectNumber == "SP001");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetByIamId_self_lookup_includes_projects_where_user_is_award_pi(bool useGraphQLAPI)
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, employeeId: "EAWARDPI");

        var controller = CreatePortfolioController(
            ctx,
            useGraphQLAPI: useGraphQLAPI,
            targetPerson: new SearchablePersonRecord { IamId = "IAM-AWARDPI", EmployeeId = "EAWARDPI", Name = "Award PI" },
            projects: [TargetPiProjectWithAwardPi(awardPiEmployeeId: "EAWARDPI")],
            user: CreateUser(roles: [], objectId: requester.Id),
            portfolio: [new FacultyPortfolioRecord { ProjectNumber = "SP001", ProjectStatus = "ACTIVE" }]);

        var result = await controller.GetByIamIdAsync("IAM-AWARDPI", CancellationToken.None);

        var projects = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IEnumerable<FacultyPortfolioRecord>>().Which;
        projects.Should().ContainSingle(p => p.ProjectNumber == "SP001");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Managed_faculty_preserves_missing_iam_and_merges_orphans_with_pm_pi_entry(bool useGraphQLAPI)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        FakeFinancialProjectTeamMember pm = new(PpmRole.ProjectManager, "Manager", "PM", null);
        var controller = CreatePortfolioController(ctx,
            new SearchablePersonRecord { IamId = "IAM-PM", EmployeeId = "PM", Name = "Manager" },
            [
                new("ORPHAN", [pm], []),
                new("SHARED", [pm, new(PpmRole.PrincipalInvestigator, "Manager", "PM", null),
                    new(PpmRole.PrincipalInvestigator, "Unmapped", "UNMAPPED", null)], [])
            ], CreateUser([Role.Names.FinancialViewer]), useGraphQLAPI: useGraphQLAPI);

        var result = (await controller.GetManagedFaculty("IAM-PM", default)).Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<ProjectController.ManagedPisEnvelope>().Which;
        result.ProjectManager!.Name.Should().Be("Manager");
        result.Pis.Should().HaveCount(2);
        result.Pis.Should().Contain(p => p.EmployeeId == "PM" && p.ProjectCount == 2 && p.IamId == "IAM-PM");
        result.Pis.Should().Contain(p => p.EmployeeId == "UNMAPPED" && p.ProjectCount == 1 && p.IamId == null);
    }

    public static IEnumerable<object[]> ProjectAccessCases()
    {
        foreach (var legacy in new[] { true, false })
            foreach (var endpoint in new[] { "byNumber", "personnel", "transactions", "reconciliation", "projection" })
                foreach (var membership in new[] { "team-pi", "team-pm", "award-pi", "award-pm", "administrator", "none" })
                    foreach (var forbidden in new[] { false, true })
                        yield return [legacy, endpoint, membership, forbidden];
    }

    [Theory]
    [MemberData(nameof(ProjectAccessCases))]
    public async Task Project_access_preserves_role_scope_and_rejects_forbidden_requests(
        bool legacy, string endpoint, string membership, bool forbidden)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, "CALLER");
        var role = membership.EndsWith("pm") ? PpmRole.ProjectManager :
            membership == "administrator" ? "Project Administrator" : PpmRole.PrincipalInvestigator;
        FakeFinancialProjectTeamMember member = new(role, "Caller", "CALLER", null);
        FakeFinancialProject project = new("ALLOWED",
            membership.StartsWith("team") || membership == "administrator" ? [member] : [],
            membership.StartsWith("award") ? [member] : []);
        var dm = new ResolvingDatamartService(
            new SearchablePersonRecord { IamId = requester.IamId, EmployeeId = "CALLER", Name = "Caller" },
            projection: new ProjectProjectionResult(), portfolio: [], allowReports: true);
        var controller = new ProjectController(dm, CreateAuthorizationService(),
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(legacy ? new FakeFinancialApiService([], null, [project]) : new ThrowingFinancialApiService(),
                legacy ? new FakePpmPortfolioReader { Error = new Exception("Imported reader must not run") } : new FakePpmPortfolioReader([project]),
                Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions { UseGraphQLAPI = legacy })))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = CreateUser([], requester.Id) } }
        };
        var codes = forbidden ? "ALLOWED,FORBIDDEN" : "allowed";
        var result = await InvokeProjectEndpoint(controller, endpoint, codes, requester.IamId);
        var allowed = !forbidden && membership is not ("administrator" or "none");
        if (allowed) result.Should().BeOfType<OkObjectResult>();
        else result.Should().BeOfType<ForbidResult>();
        dm.ReportCalls.Should().Be(allowed ? 1 : 0);
    }

    [Theory]
    [InlineData("byNumber")]
    [InlineData("personnel")]
    [InlineData("transactions")]
    [InlineData("reconciliation")]
    [InlineData("projection")]
    [InlineData("portfolio")]
    public async Task Imported_authorization_propagates_failure_and_cancellation_without_reading_reports(string endpoint)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, "CALLER");
        foreach (var error in new Exception[] { new InvalidOperationException("Snapshot unavailable"), new OperationCanceledException() })
        {
            var dm = new ResolvingDatamartService(new SearchablePersonRecord { IamId = "IAM-PI", EmployeeId = "PI", Name = "PI" });
            var controller = new ProjectController(dm, CreateAuthorizationService(),
                new UserService(NullLogger<UserService>.Instance, ctx),
                new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader { Error = error },
                    Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions { UseGraphQLAPI = false })))
            {
                ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = CreateUser([], requester.Id) } }
            };
            Func<Task> request = async () => await InvokeProjectEndpoint(controller, endpoint, "ALLOWED", "IAM-PI");
            (await request.Should().ThrowAsync<Exception>()).Which.Should().BeSameAs(error);
            dm.ReportCalls.Should().Be(0);
        }
    }

    [Theory]
    [InlineData(Role.Names.Admin, true)]
    [InlineData(Role.Names.Admin, false)]
    [InlineData(Role.Names.FinancialViewer, true)]
    [InlineData(Role.Names.FinancialViewer, false)]
    public async Task Privileged_project_access_bypasses_membership_sources(string role, bool legacy)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var dm = new ResolvingDatamartService(projection: new ProjectProjectionResult(), portfolio: [], allowReports: true);
        var controller = new ProjectController(dm, CreateAuthorizationService(),
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new ThrowingFinancialApiService(), new FakePpmPortfolioReader { Error = new Exception("Must bypass membership") },
                Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions { UseGraphQLAPI = legacy })))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = CreateUser([role]) } }
        };
        foreach (var endpoint in new[] { "byNumber", "personnel", "transactions", "reconciliation", "projection" })
            (await InvokeProjectEndpoint(controller, endpoint, "UNRELATED", null)).Should().BeOfType<OkObjectResult>();
        dm.ReportCalls.Should().Be(5);
    }

    private static Task<IActionResult> InvokeProjectEndpoint(ProjectController controller, string endpoint, string codes, string? iamId)
        => endpoint switch
        {
            "byNumber" => controller.GetByProjectNumberAsync(default, codes),
            "personnel" => controller.GetPersonnelForProjects(default, iamId, codes),
            "transactions" => controller.GetTransactionsForProjectsAsync(default, codes),
            "reconciliation" => controller.GetGLPPMReconciliationAsync(default, codes),
            "projection" => controller.GetProjectionAsync(codes.Contains(',') ? "FORBIDDEN" : codes, default),
            "portfolio" => controller.GetByIamIdAsync(iamId!, default),
            _ => throw new ArgumentOutOfRangeException(nameof(endpoint))
        };

    /// <summary>
    /// A project owned by team PI "EPI" (with team PM "EPM") whose award lists the given
    /// employee as award PI without them being on the project team.
    /// </summary>
    private static FakeFinancialProject TargetPiProjectWithAwardPi(string awardPiEmployeeId)
    {
        return new FakeFinancialProject(
            ProjectNumber: "SP001",
            TeamMembers:
            [
                new FakeFinancialProjectTeamMember(PpmRole.PrincipalInvestigator, "Target PI", "EPI", null),
                new FakeFinancialProjectTeamMember(PpmRole.ProjectManager, "Team PM", "EPM", null),
            ],
            AwardPersonnel:
            [
                new FakeFinancialProjectTeamMember(PpmRole.PrincipalInvestigator, "Award PI", awardPiEmployeeId, null),
            ]);
    }

    private ProjectController CreatePortfolioController(
        AppDbContext ctx,
        SearchablePersonRecord targetPerson,
        IReadOnlyList<FakeFinancialProject> projects,
        ClaimsPrincipal user,
        IReadOnlyList<FacultyPortfolioRecord>? portfolio = null,
        bool useGraphQLAPI = true)
    {
        return new ProjectController(
            new ResolvingDatamartService(targetPerson, portfolio: portfolio),
            CreateAuthorizationService(),
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(useGraphQLAPI ? new FakeFinancialApiService([], null, projects) : new ThrowingFinancialApiService(), new FakePpmPortfolioReader(projects), Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions { UseGraphQLAPI = useGraphQLAPI })))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = user },
            },
        };
    }

    [Fact]
    public void Project_routes_do_not_expose_employee_id_lookup_contracts()
    {
        var templates = typeof(ProjectController)
            .GetMethods()
            .SelectMany(method => method.GetCustomAttributes(typeof(HttpGetAttribute), inherit: false))
            .Cast<HttpGetAttribute>()
            .Select(attribute => attribute.Template)
            .Where(template => template is not null)
            .Select(template => template!)
            .ToArray();

        templates.Should().Contain("by-iam/{iamId}");
        templates.Should().Contain("managed/by-iam/{iamId}");
        templates.Should().OnlyContain(template =>
            !template.Contains("employeeId", StringComparison.OrdinalIgnoreCase));
    }

    private static IAuthorizationService CreateAuthorizationService()
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddDebug().SetMinimumLevel(LogLevel.Trace));
        services.AddAuthorizationPolicies();
        var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IAuthorizationService>();
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles, Guid? objectId = null)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        if (objectId is not null)
        {
            claims.Add(new Claim(Microsoft.Identity.Web.ClaimConstants.ObjectId, objectId.Value.ToString()));
        }

        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
    }

    private static User SeedUser(AppDbContext ctx, string employeeId)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "testuser",
            IamId = $"IAM-{employeeId}",
            EmployeeId = employeeId,
        };
        ctx.Users.Add(user);
        ctx.SaveChanges();
        return user;
    }

    private sealed class ThrowingFinancialApiService : IFinancialApiService
    {
        public IAggieEnterpriseClient GetClient()
        {
            throw new InvalidOperationException("Financial API should not be called for unauthorized users.");
        }
    }

    private sealed class ResolvingDatamartService : IDatamartService
    {
        private readonly SearchablePersonRecord? _person;
        private readonly ProjectProjectionResult? _projection;
        private readonly IReadOnlyList<FacultyPortfolioRecord>? _portfolio;
        private readonly IReadOnlyList<DepartmentBalanceRow> _summaryRows;
        private readonly IReadOnlyList<DepartmentBalanceOption> _options;

        private readonly bool _allowReports;
        public int ReportCalls { get; private set; }

        public int? LastHistoryMonths { get; private set; }

        public ResolvingDatamartService(
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
}
