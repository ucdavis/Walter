using System.Reflection;
using System.Security.Claims;
using AggieEnterpriseApi;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Identity.Web;
using Server.Controllers;
using Server.Services;
using Server.Tests;
using server.Helpers;
using server.core.Domain;
using server.core.Services;
using server.core.Data;
using StrawberryShake;

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
            roles: [Role.Names.FinancialViewer]);

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
            roles: [Role.Names.FinancialViewer]);

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
            roles: [Role.Names.FinancialViewer]);

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

    [Fact]
    public async Task GetProjectsWhereCurrentUserIsTeamMember_filters_inaccessible_principal_investigators_for_non_financial_users()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();
        var userId = Guid.NewGuid();
        const string requesterEmployeeId = "E-SELF";
        const string visiblePiEmployeeId = "E-VISIBLE";
        const string hiddenPiEmployeeId = "E-HIDDEN";

        ctx.Users.Add(new User
        {
            Id = userId,
            DisplayName = "Self PI",
            Email = "self@example.com",
            EmployeeId = requesterEmployeeId,
            IamId = "IAM-SELF",
            Kerberos = "self",
        });
        await ctx.SaveChangesAsync();

        var controller = CreateController(
            ctx,
            authorizationService,
            new FakeGraphService(),
            new FakeIdentityService(),
            roles: [],
            financialApiService: new FakeFinancialApiService(new Dictionary<string, IReadOnlyList<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>>(StringComparer.OrdinalIgnoreCase)
            {
                [Key(requesterEmployeeId, PpmRole.PrincipalInvestigator)] =
                [
                    CreateProject(
                        "Shared Project",
                        "P-100",
                        (requesterEmployeeId, "Self PI", PpmRole.PrincipalInvestigator),
                        (visiblePiEmployeeId, "Visible PI", PpmRole.PrincipalInvestigator),
                        (hiddenPiEmployeeId, "Hidden PI", PpmRole.PrincipalInvestigator))
                ],
                [Key(requesterEmployeeId, PpmRole.ProjectManager)] = [],
                [Key(visiblePiEmployeeId, PpmRole.PrincipalInvestigator)] =
                [
                    CreateProject(
                        "Shared Project",
                        "P-100",
                        (requesterEmployeeId, "Self PI", PpmRole.PrincipalInvestigator),
                        (visiblePiEmployeeId, "Visible PI", PpmRole.PrincipalInvestigator))
                ],
                [Key(hiddenPiEmployeeId, PpmRole.PrincipalInvestigator)] =
                [
                    CreateProject(
                        "Unrelated Project",
                        "P-999",
                        (hiddenPiEmployeeId, "Hidden PI", PpmRole.PrincipalInvestigator))
                ],
            }),
            userId: userId);

        var result = await controller.GetProjectsWhereCurrentUserIsTeamMember(CancellationToken.None);
        var payload = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchTeamMemberProjectsResponse>().Which;

        payload.PrincipalInvestigators.Select(pi => pi.EmployeeId)
            .Should().BeEquivalentTo([requesterEmployeeId, visiblePiEmployeeId]);
        payload.PrincipalInvestigators.Select(pi => pi.Name)
            .Should().NotContain("Hidden PI");
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
        IReadOnlyList<string> roles,
        server.Services.IFinancialApiService? financialApiService = null,
        Guid? userId = null)
    {
        var httpContext = new DefaultHttpContext
        {
            User = CreateUser(roles, userId),
        };

        return new SearchController(
            ctx,
            financialApiService ?? new FakeFinancialApiService(),
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
        private readonly IAggieEnterpriseClient _client;

        public FakeFinancialApiService(
            IReadOnlyDictionary<string, IReadOnlyList<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>>? projectsByEmployeeAndRole = null)
        {
            var projectLookup = projectsByEmployeeAndRole
                ?? new Dictionary<string, IReadOnlyList<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>>(StringComparer.OrdinalIgnoreCase);

            _client = CreateProxy<IAggieEnterpriseClient>((method, _) =>
            {
                if (method.Name == "get_PpmProjectByProjectTeamMemberEmployeeId")
                {
                    return new FakePpmProjectByProjectTeamMemberEmployeeIdQuery(projectLookup);
                }

                throw new NotImplementedException($"{method.Name} is not implemented for this test.");
            });
        }

        public AggieEnterpriseApi.IAggieEnterpriseClient GetClient()
        {
            return _client;
        }
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles, Guid? userId = null)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        if (userId.HasValue)
        {
            claims.Add(new Claim(ClaimConstants.ObjectId, userId.Value.ToString()));
        }

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

        public Task<string?> GetKerberosByIamId(string iamId)
        {
            return Task.FromResult<string?>(null);
        }
    }

    private sealed class FakePpmProjectByProjectTeamMemberEmployeeIdQuery : IPpmProjectByProjectTeamMemberEmployeeIdQuery
    {
        private readonly IReadOnlyDictionary<string, IReadOnlyList<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>> _projectsByEmployeeAndRole;

        public FakePpmProjectByProjectTeamMemberEmployeeIdQuery(
            IReadOnlyDictionary<string, IReadOnlyList<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>> projectsByEmployeeAndRole)
        {
            _projectsByEmployeeAndRole = projectsByEmployeeAndRole;
        }

        public Type ResultType => typeof(IPpmProjectByProjectTeamMemberEmployeeIdResult);

        public OperationRequest Create(IReadOnlyDictionary<string, object?>? variables)
        {
            return new OperationRequest(
                "FakePpmProjectByProjectTeamMemberEmployeeId",
                CreateProxy<IDocument>((_, _) => throw new NotImplementedException()),
                variables ?? new Dictionary<string, object?>(),
                new Dictionary<string, Upload?>(),
                default);
        }

        public Task<IOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>> ExecuteAsync(
            string employeeId,
            string? roleName,
            CancellationToken cancellationToken)
        {
            var key = Key(employeeId, roleName);
            var projects = _projectsByEmployeeAndRole.TryGetValue(key, out var result)
                ? result
                : [];

            return Task.FromResult<IOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>>(
                new FakeOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>(
                    new PpmProjectByProjectTeamMemberEmployeeIdResult(projects)));
        }

        public IObservable<IOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>> Watch(
            string employeeId,
            string? roleName,
            ExecutionStrategy? strategy = null)
        {
            throw new NotImplementedException();
        }
    }

    private sealed class FakeOperationResult<TResultData> : IOperationResult<TResultData>
        where TResultData : class
    {
        public FakeOperationResult(TResultData data)
        {
            Data = data;
        }

        public TResultData Data { get; }

        public IOperationResultDataFactory<TResultData> DataFactory => null!;

        object IOperationResult.Data => Data!;

        object IOperationResult.DataFactory => DataFactory;

        public IOperationResultDataInfo DataInfo => null!;

        public Type DataType => typeof(TResultData);

        public IReadOnlyList<IClientError> Errors => Array.Empty<IClientError>();

        public IReadOnlyDictionary<string, object?> Extensions => new Dictionary<string, object?>();

        public IReadOnlyDictionary<string, object?> ContextData => new Dictionary<string, object?>();

        public IOperationResult<TResultData> WithData(TResultData data, IOperationResultDataInfo dataInfo)
        {
            return new FakeOperationResult<TResultData>(data);
        }
    }

    private class InterfaceProxy<T> : DispatchProxy where T : class
    {
        public Func<MethodInfo, object?[]?, object?>? Handler { get; set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod == null || Handler == null)
            {
                throw new NotImplementedException();
            }

            return Handler(targetMethod, args);
        }
    }

    private static T CreateProxy<T>(Func<MethodInfo, object?[]?, object?> handler) where T : class
    {
        var proxy = DispatchProxy.Create<T, InterfaceProxy<T>>();
        ((InterfaceProxy<T>)(object)proxy).Handler = handler;
        return proxy;
    }

    private static string Key(string employeeId, string? roleName)
    {
        return $"{employeeId.Trim()}|{roleName?.Trim() ?? string.Empty}";
    }

    private static IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId CreateProject(
        string name,
        string projectNumber,
        params (string EmployeeId, string Name, string RoleName)[] teamMembers)
    {
        var members = teamMembers
            .Select(member => CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId_TeamMembers>((method, _) =>
            {
                return method.Name switch
                {
                    "get_EmployeeId" => member.EmployeeId,
                    "get_Name" => member.Name,
                    "get_RoleName" => member.RoleName,
                    _ => throw new NotImplementedException($"{method.Name} is not implemented for this test."),
                };
            }))
            .ToArray();

        return CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>((method, _) =>
        {
            return method.Name switch
            {
                "get_Name" => name,
                "get_ProjectNumber" => projectNumber,
                "get_ProjectStartDate" => "2025-01-01",
                "get_ProjectEndDate" => "2025-12-31",
                "get_ProjectStatus" => "ACTIVE",
                "get_TeamMembers" => members,
                "get_Awards" => Array.Empty<object>(),
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this test."),
            };
        });
    }
}
