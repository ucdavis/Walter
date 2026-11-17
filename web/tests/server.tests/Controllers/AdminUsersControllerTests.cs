using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Identity.Web;
using Microsoft.Kiota.Abstractions;
using Server.Controllers;
using Server.Services;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using server.tests.Fakes;

namespace server.tests.Controllers;

public sealed class AdminUsersControllerTests
{
    private const string IamId = "1000000123";
    private static readonly Guid EntraId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public async Task SearchUsers_reads_people_without_graph_and_preserves_campus_email()
    {
        using var h = new Harness();
        var result = await h.Controller.SearchUsers("  person@ucdavis.edu  ", default);
        var people = result.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchablePersonRecord>>().Which;
        people.Should().ContainSingle().Which.Should().BeSameAs(h.Person);
        h.Datamart.LastPeopleQuery.Should().Be("person@ucdavis.edu");
        h.Datamart.LastPeopleLimit.Should().Be(25);
        h.Graph.LookupCalls.Should().Be(0);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(" ")]
    [InlineData("ab")]
    public async Task SearchUsers_does_not_query_for_short_input(string? query)
    {
        using var h = new Harness();
        var result = await h.Controller.SearchUsers(query, default);
        result.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<SearchablePersonRecord>>().Which.Should().BeEmpty();
        h.Datamart.LastPeopleQuery.Should().BeNull();
        h.Graph.LookupCalls.Should().Be(0);
    }

    [Fact]
    public async Task AssignRole_provisions_before_first_login_using_people_email_and_is_idempotent()
    {
        using var h = new Harness();
        var first = await h.Assign();
        var payload = first.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminUsersController.AssignRoleResponse>().Which;
        payload.Added.Should().BeTrue();
        payload.User.Id.Should().Be(EntraId);
        payload.User.IamId.Should().Be(IamId);
        payload.User.EmployeeId.Should().Be(h.Person.EmployeeId);
        payload.User.Name.Should().Be(h.Person.Name);
        payload.User.Email.Should().Be("person@ucdavis.edu");
        payload.User.Kerberos.Should().Be("pusername");
        h.Graph.LastIamId.Should().Be(IamId);
        h.Context.Users.Should().ContainSingle(u => u.Id == EntraId && u.Email == h.Person.Email);
        h.Context.Permissions.Should().ContainSingle(p => p.UserId == EntraId && p.GrantedByUserId == h.ManagerId);

        var second = await h.Assign();
        second.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminUsersController.AssignRoleResponse>().Which.Added.Should().BeFalse();
        h.Context.Permissions.Should().ContainSingle();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Permission_operations_require_people_record_and_employee_id(bool missingEmployeeId)
    {
        using var h = new Harness(includePerson: missingEmployeeId);
        if (missingEmployeeId) h.Person.EmployeeId = "";
        (await h.Assign()).Result.Should().BeOfType<NotFoundObjectResult>();
        (await h.Controller.GetRoles(IamId, default)).Result.Should().BeOfType<NotFoundObjectResult>();
        (await h.Controller.RemoveRole(IamId, new(Role.Names.AccrualViewer), default)).Result.Should().BeOfType<NotFoundObjectResult>();
        h.Graph.LookupCalls.Should().Be(0);
        h.Context.Permissions.Should().BeEmpty();
    }

    [Theory]
    [InlineData(0, 404)]
    [InlineData(2, 409)]
    public async Task AssignRole_rejects_missing_or_ambiguous_account_without_writes(int matchCount, int status)
    {
        using var h = new Harness();
        h.Graph.Profiles = Enumerable.Range(0, matchCount).Select(_ =>
            new GraphUserProfile(Guid.NewGuid().ToString(), "Account", "alias@ad3.ucdavis.edu", IamId)).ToArray();
        var result = await h.Assign();
        result.Result.Should().BeAssignableTo<ObjectResult>().Which.StatusCode.Should().Be(status);
        h.Context.Users.Should().ContainSingle(u => u.Id == h.ManagerId);
        h.Context.Permissions.Should().BeEmpty();
    }

    [Fact]
    public async Task AssignRole_rejects_mismatched_identity_from_graph()
    {
        using var h = new Harness();
        h.Graph.Profiles = [new(EntraId.ToString(), "Other", "other@ucdavis.edu", "1000000999")];
        (await h.Assign()).Result.Should().BeOfType<ConflictObjectResult>();
        h.Context.Permissions.Should().BeEmpty();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AssignRole_does_not_overwrite_an_existing_account_link(bool sameIamDifferentEntra)
    {
        using var h = new Harness();
        h.Context.Users.Add(new User
        {
            Id = sameIamDifferentEntra ? Guid.NewGuid() : EntraId,
            IamId = sameIamDifferentEntra ? IamId : "1000000999",
            EmployeeId = "99999999",
            Kerberos = "existing",
        });
        await h.Context.SaveChangesAsync();
        (await h.Assign()).Result.Should().BeOfType<ConflictObjectResult>();
        h.Context.Users.Should().HaveCount(2);
        h.Context.Permissions.Should().BeEmpty();
    }

    [Fact]
    public async Task AssignRole_reports_graph_failure_without_creating_user()
    {
        using var h = new Harness();
        h.Graph.Error = new ApiException { ResponseStatusCode = 503 };
        (await h.Assign()).Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(502);
        h.Context.Users.Should().ContainSingle();
        h.Context.Permissions.Should().BeEmpty();
    }

    [Fact]
    public async Task AssignRole_rejects_unassignable_role_before_lookup()
    {
        using var h = new Harness();
        (await h.Controller.AssignRole(IamId, new(Role.Names.Admin), default)).Result.Should().BeOfType<BadRequestObjectResult>();
        h.Graph.LookupCalls.Should().Be(0);
        h.Context.Permissions.Should().BeEmpty();
    }

    [Fact]
    public async Task AssignRole_requires_campus_username()
    {
        using var h = new Harness();
        h.Identity.Kerberos = null;
        (await h.Assign()).Result.Should().BeOfType<BadRequestObjectResult>();
        h.Context.Permissions.Should().BeEmpty();
    }

    [Fact]
    public async Task GetRoles_and_RemoveRole_use_iam_link_without_graph()
    {
        using var h = new Harness();
        var unregistered = await h.Controller.GetRoles(IamId, default);
        var before = unregistered.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminUsersController.UserRolesResponse>().Which;
        before.Roles.Should().BeEmpty();
        before.Email.Should().Be(h.Person.Email);
        before.EmployeeId.Should().Be(h.Person.EmployeeId);
        h.Graph.LookupCalls.Should().Be(0);

        await h.Assign();
        h.Graph.Error = new ApiException { ResponseStatusCode = 503 };
        var existing = await h.Controller.GetRoles(IamId, default);
        existing.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminUsersController.UserRolesResponse>().Which.Roles.Should().Contain(Role.Names.AccrualViewer);
        var removed = await h.Controller.RemoveRole(IamId, new(Role.Names.AccrualViewer), default);
        var after = removed.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminUsersController.RemoveRoleResponse>().Which;
        after.Removed.Should().BeTrue();
        after.Roles.Should().BeEmpty();
        h.Graph.LookupCalls.Should().Be(1);
        h.Context.Permissions.Should().BeEmpty();
    }

    private sealed class Harness : IDisposable
    {
        public AppDbContext Context { get; } = TestDbContextFactory.CreateInMemory();
        public Guid ManagerId { get; } = Guid.NewGuid();
        public SearchablePersonRecord Person { get; } = new()
        {
            IamId = AdminUsersControllerTests.IamId,
            EmployeeId = "12345678",
            Name = "Campus Person",
            Email = "person@ucdavis.edu",
        };
        public FakeGraphService Graph { get; } = new();
        public FakeIdentityService Identity { get; } = new();
        public FakeDatamartService Datamart { get; }
        public AdminUsersController Controller { get; }

        public Harness(bool includePerson = true)
        {
            Context.Users.Add(new User { Id = ManagerId, IamId = "1000000001", EmployeeId = "10000001", Kerberos = "manager" });
            Context.Roles.Add(new Role { Name = Role.Names.AccrualViewer });
            Context.SaveChanges();
            Datamart = new FakeDatamartService(person: includePerson ? Person : null, searchPeople: [Person]);
            Controller = new AdminUsersController(Graph, new UserService(NullLogger<UserService>.Instance, Context),
                Identity, Datamart, NullLogger<AdminUsersController>.Instance)
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimConstants.ObjectId, ManagerId.ToString())], "Test")),
                    },
                },
            };
        }

        public Task<ActionResult<AdminUsersController.AssignRoleResponse>> Assign()
            => Controller.AssignRole(IamId, new(Role.Names.AccrualViewer), default);
        public void Dispose() => Context.Dispose();
    }

    private sealed class FakeGraphService : IGraphService
    {
        public IReadOnlyList<GraphUserProfile> Profiles { get; set; } =
            [new(EntraId.ToString(), "Graph Person", "pusername@ad3.ucdavis.edu", IamId)];
        public int LookupCalls { get; private set; }
        public string? LastIamId { get; private set; }
        public Exception? Error { get; set; }
        public Task<IReadOnlyList<GraphUserProfile>> FindEligibleUsersByIamIdAsync(
            ClaimsPrincipal principal, string iamId, CancellationToken cancellationToken = default)
        {
            LookupCalls++;
            LastIamId = iamId;
            if (Error is not null) throw Error;
            return Task.FromResult(Profiles);
        }
        public Task<GraphUserPhoto?> GetMePhotoAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<IReadOnlyList<GraphUserSearchResult>> SearchUsersAsync(ClaimsPrincipal principal, string query, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<GraphUserProfile?> FindUserByEmailAsync(ClaimsPrincipal principal, string email, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<GraphUserProfile?> GetUserProfileAsync(ClaimsPrincipal principal, string userObjectId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }

    private sealed class FakeIdentityService : IIdentityService
    {
        public string? Kerberos { get; set; } = "pusername";
        public Task<IamIdentity?> GetByIamId(string iamId) => throw new NotImplementedException();
        public Task<string?> GetKerberosByIamId(string iamId) => Task.FromResult(Kerberos);
    }
}
