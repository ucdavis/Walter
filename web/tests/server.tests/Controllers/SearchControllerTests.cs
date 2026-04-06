using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Server.Controllers;
using Server.Services;
using Server.Tests;
using server.Helpers;
using server.core.Domain;
using server.core.Services;
using server.core.Data;

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
            new FakeGraphService(),
            new FakeIdentityService(),
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
            new FakeGraphService(),
            new FakeIdentityService(),
            roles: [server.core.Domain.Role.Names.AccrualViewer]);

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
            new FakeGraphService(),
            new FakeIdentityService(),
            roles: [server.core.Domain.Role.Names.Admin]);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().Contain("accruals");
    }

    [Fact]
    public async Task SearchPeople_returns_empty_for_non_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();
        var graphService = new FakeGraphService(
            searchResults: [new GraphUserSearchResult("id-1", "Elisabeth Forrestel", "elisabeth.forrestel@ucdavis.edu")]);

        var controller = CreateController(
            ctx,
            authorizationService,
            graphService,
            new FakeIdentityService(),
            roles: []);

        var result = await controller.SearchPeople("elis", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchController.SearchDirectoryPerson>>().Which;

        payload.Should().BeEmpty();
    }

    [Fact]
    public async Task SearchPeople_returns_graph_results_for_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();
        var graphService = new FakeGraphService(
            searchResults:
            [
                new GraphUserSearchResult("id-1", "Elisabeth Forrestel", "elisabeth.forrestel@ucdavis.edu"),
                new GraphUserSearchResult("id-2", "Edward Spang", "esspang@ucdavis.edu"),
            ]);

        var controller = CreateController(
            ctx,
            authorizationService,
            graphService,
            new FakeIdentityService(),
            roles: [Role.Names.ProjectManager]);

        var result = await controller.SearchPeople("spang", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchController.SearchDirectoryPerson>>().Which;

        payload.Should().HaveCount(2);
        payload.Select(p => p.Name).Should().Contain("Edward Spang");
        payload.SelectMany(p => p.Keywords).Should().Contain("esspang@ucdavis.edu");
    }

    [Fact]
    public async Task SearchPeople_limits_results_to_top_five_for_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();
        var graphService = new FakeGraphService(
            searchResults: Enumerable.Range(1, 7)
                .Select(i => new GraphUserSearchResult(
                    $"id-{i}",
                    $"Person {i}",
                    $"person{i}@ucdavis.edu"))
                .ToArray());

        var controller = CreateController(
            ctx,
            authorizationService,
            graphService,
            new FakeIdentityService(),
            roles: [Role.Names.ProjectManager]);

        var result = await controller.SearchPeople("person", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchController.SearchDirectoryPerson>>().Which;

        payload.Should().HaveCount(5);
        payload.Select(p => p.Id).Should().ContainInOrder("id-1", "id-2", "id-3", "id-4", "id-5");
    }

    [Fact]
    public async Task ResolvePersonByDirectoryId_returns_employee_id_when_identity_is_found()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();
        var graphService = new FakeGraphService(
            profiles: new Dictionary<string, GraphUserProfile>
            {
                ["id-esspang"] = new GraphUserProfile(
                    Id: "id-esspang",
                    DisplayName: "Edward Spang",
                    Email: "esspang@ucdavis.edu",
                    Kerberos: "esspang",
                    IamId: "IAM-ESSPANG"),
            });
        var identityService = new FakeIdentityService(
            identities: new Dictionary<string, IamIdentity>
            {
                ["IAM-ESSPANG"] = new IamIdentity("IAM-ESSPANG", "200123", "Edward Spang"),
            });

        var controller = CreateController(
            ctx,
            authorizationService,
            graphService,
            identityService,
            roles: [Role.Names.ProjectManager]);

        var result = await controller.ResolvePersonByDirectoryId("id-esspang", CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.ResolveDirectoryPersonResponse>().Which;

        payload.EmployeeId.Should().Be("200123");
        payload.Name.Should().Be("Edward Spang");
    }

    [Fact]
    public async Task ResolvePersonByDirectoryId_forbids_non_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();
        var controller = CreateController(
            ctx,
            authorizationService,
            new FakeGraphService(),
            new FakeIdentityService(),
            roles: []);

        var result = await controller.ResolvePersonByDirectoryId("id-1", CancellationToken.None);

        result.Should().BeOfType<ForbidResult>();
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
        IGraphService graphService,
        IIdentityService identityService,
        IReadOnlyList<string> roles)
    {
        var httpContext = new DefaultHttpContext
        {
            User = CreateUser(roles),
        };

        return new SearchController(
            ctx,
            new FakeFinancialApiService(),
            authorizationService,
            graphService,
            identityService,
            NullLogger<SearchController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private sealed class FakeFinancialApiService : server.Services.IFinancialApiService
    {
        public AggieEnterpriseApi.IAggieEnterpriseClient GetClient()
        {
            throw new NotImplementedException("Not needed for GetCatalog tests.");
        }
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
    }

    private sealed class FakeGraphService : IGraphService
    {
        private readonly IReadOnlyList<GraphUserSearchResult> _searchResults;
        private readonly IReadOnlyDictionary<string, GraphUserProfile> _profiles;

        public FakeGraphService(
            IReadOnlyList<GraphUserSearchResult>? searchResults = null,
            IReadOnlyDictionary<string, GraphUserProfile>? profiles = null)
        {
            _searchResults = searchResults ?? [];
            _profiles = profiles ?? new Dictionary<string, GraphUserProfile>();
        }

        public Task<GraphUserPhoto?> GetMePhotoAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<GraphUserPhoto?>(null);
        }

        public Task<IReadOnlyList<GraphUserSearchResult>> SearchUsersAsync(
            ClaimsPrincipal principal,
            string query,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_searchResults);
        }

        public Task<GraphUserProfile?> FindUserByEmailAsync(
            ClaimsPrincipal principal,
            string email,
            CancellationToken cancellationToken = default)
        {
            var profile = _profiles.Values.FirstOrDefault(p =>
                string.Equals(p.Email, email, StringComparison.OrdinalIgnoreCase) ||
                GraphService.EnumerateEmailCandidates(email).Any(candidate =>
                    string.Equals(p.Email, candidate, StringComparison.OrdinalIgnoreCase)));

            return Task.FromResult(profile);
        }

        public Task<GraphUserProfile?> GetUserProfileAsync(
            ClaimsPrincipal principal,
            string userObjectId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_profiles.TryGetValue(userObjectId, out var profile)
                ? profile
                : null);
        }
    }

    private sealed class FakeIdentityService : IIdentityService
    {
        private readonly IReadOnlyDictionary<string, IamIdentity> _identities;

        public FakeIdentityService(IReadOnlyDictionary<string, IamIdentity>? identities = null)
        {
            _identities = identities ?? new Dictionary<string, IamIdentity>();
        }

        public Task<IamIdentity?> GetByIamId(string iamId)
        {
            return Task.FromResult(_identities.TryGetValue(iamId, out var identity)
                ? identity
                : null);
        }
    }
}
