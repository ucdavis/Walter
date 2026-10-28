using System.Security.Claims;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Identity.Web;
using Server.Services;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using server.core.Services;
using server.Services;
using server.tests.Fakes;
using server.Helpers;
using Microsoft.Extensions.Options;

namespace server.tests.Services;

public sealed class UserProfileOrchestratorTests
{
    [Fact]
    public async Task EnsureUserProfileAsync_uses_token_iam_without_loading_graph_attributes()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        ctx.Roles.Add(new Role { Name = Role.Names.ProjectManager });
        await ctx.SaveChangesAsync();

        var userId = Guid.NewGuid();
        var principal = CreatePrincipal(userId, "person@ucdavis.edu", "IAM-123");
        var attributeService = new FakeEntraUserAttributeService(new EntraUserAttributes("GRAPH-IAM"));

        var orchestrator = new UserProfileOrchestrator(
            attributeService,
            new FakeIdentityService(
                iamIdentity: new IamIdentity("IAM-123", "E12345", "Iam FullName"),
                kerberosByIamId: new Dictionary<string, string?> { ["IAM-123"] = "guser" }),
            new UserService(NullLogger<UserService>.Instance, ctx),
            CreatePortfolioService(true, []),
            NullLogger<UserProfileOrchestrator>.Instance);

        var profile = await orchestrator.EnsureUserProfileAsync(
            userId,
            userId.ToString(),
            principal,
            CancellationToken.None);

        profile.Kerberos.Should().Be("guser");
        profile.IamId.Should().Be("IAM-123");
        profile.EmployeeId.Should().Be("E12345");
        profile.DisplayName.Should().Be("Iam FullName");
        profile.Email.Should().Be("person@ucdavis.edu");

        var user = await ctx.Users.SingleAsync(u => u.Id == userId);
        user.Kerberos.Should().Be("guser");
        user.IamId.Should().Be("IAM-123");
        user.EmployeeId.Should().Be("E12345");
        attributeService.CallCount.Should().Be(0);
    }

    [Fact]
    public async Task EnsureUserProfileAsync_fails_when_iam_kerberos_is_missing_even_if_user_exists()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var existingUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "storedkerb",
            IamId = "IAM-123",
            EmployeeId = "E12345",
            DisplayName = "Existing User",
            Email = "existing@ucdavis.edu",
        };

        ctx.Users.Add(existingUser);
        await ctx.SaveChangesAsync();

        var attributeService = new FakeEntraUserAttributeService(new EntraUserAttributes("IAM-123"));
        var orchestrator = new UserProfileOrchestrator(
            attributeService,
            new FakeIdentityService(
                iamIdentity: new IamIdentity("IAM-123", "E12345", "Iam FullName"),
                kerberosByIamId: new Dictionary<string, string?>()),
            new UserService(NullLogger<UserService>.Instance, ctx),
            CreatePortfolioService(true, []),
            NullLogger<UserProfileOrchestrator>.Instance);

        var act = () => orchestrator.EnsureUserProfileAsync(
            existingUser.Id,
            existingUser.Id.ToString(),
            CreatePrincipal(existingUser.Id, existingUser.Email!),
            CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Kerberos lookup failed for IAM ID 'IAM-123'.");
        attributeService.CallCount.Should().Be(1);
    }

    [Fact]
    public async Task EnsureUserProfileAsync_trims_stored_iam_before_lookup_and_persistence()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var existingUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "storedkerb",
            IamId = " IAM-123 ",
            EmployeeId = "E12345",
            DisplayName = "Existing User",
            Email = "existing@ucdavis.edu",
        };

        ctx.Roles.Add(new Role { Name = Role.Names.ProjectManager });
        ctx.Users.Add(existingUser);
        await ctx.SaveChangesAsync();

        var orchestrator = new UserProfileOrchestrator(
            new FakeEntraUserAttributeService(null),
            new FakeIdentityService(
                iamIdentity: new IamIdentity("IAM-123", "E12345", "Iam FullName"),
                kerberosByIamId: new Dictionary<string, string?> { ["IAM-123"] = "guser" }),
            new UserService(NullLogger<UserService>.Instance, ctx),
            CreatePortfolioService(true, []),
            NullLogger<UserProfileOrchestrator>.Instance);

        var profile = await orchestrator.EnsureUserProfileAsync(
            existingUser.Id,
            existingUser.Id.ToString(),
            CreatePrincipal(existingUser.Id, existingUser.Email!),
            CancellationToken.None);

        profile.IamId.Should().Be("IAM-123");

        var persistedUser = await ctx.Users.SingleAsync(u => u.Id == existingUser.Id);
        persistedUser.IamId.Should().Be("IAM-123");
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, false)]
    [InlineData(true, true)]
    [InlineData(false, true)]
    public async Task Role_sync_adds_retains_and_removes_pm_without_changing_other_roles(bool legacy, bool award)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var pm = new Role { Name = Role.Names.ProjectManager };
        var viewer = new Role { Name = Role.Names.FinancialViewer };
        ctx.Roles.AddRange(pm, viewer);
        var id = Guid.NewGuid();
        var projects = new List<FakeFinancialProject>();
        var orchestrator = CreateOrchestrator(ctx, CreatePortfolioService(legacy, projects));
        var principal = CreatePrincipal(id, "pm@example.com", "IAM-123");

        // A successful empty lookup creates the profile without granting the PM role.
        await orchestrator.EnsureUserProfileAsync(id, id.ToString(), principal);
        (await ctx.Permissions.ToListAsync()).Should().BeEmpty();
        await new UserService(NullLogger<UserService>.Instance, ctx).AddRoleToUserAsync(id, viewer.Name, id);

        FakeFinancialProjectTeamMember member = new(PpmRole.ProjectManager, "Manager", "E12345", null);
        projects.Add(new("P1", award ? [] : [member], award ? [member] : []));
        await orchestrator.EnsureUserProfileAsync(id, id.ToString(), principal);
        await orchestrator.EnsureUserProfileAsync(id, id.ToString(), principal);

        var grant = (await ctx.Permissions.Where(p => p.RoleId == pm.Id).ToListAsync()).Should().ContainSingle().Subject;
        grant.UserId.Should().Be(id);
        grant.GrantedByUserId.Should().Be(id);
        grant.DeptCode.Should().BeNull();

        projects.Clear();
        await orchestrator.EnsureUserProfileAsync(id, id.ToString(), principal);
        await orchestrator.EnsureUserProfileAsync(id, id.ToString(), principal);
        var remaining = (await ctx.Permissions.ToListAsync()).Should().ContainSingle().Subject;
        remaining.RoleId.Should().Be(viewer.Id);
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(false, false)]
    public async Task Source_failure_or_cancellation_does_not_mutate_roles(bool legacy, bool existingPm)
    {
        foreach (var error in new Exception[] { new InvalidOperationException("Source unavailable"), new OperationCanceledException() })
        {
            using var ctx = TestDbContextFactory.CreateInMemory();
            var id = Guid.NewGuid();
            ctx.Users.Add(new User { Id = id, Kerberos = "guser", IamId = "IAM-123", EmployeeId = "E12345" });
            var role = new Role { Name = Role.Names.ProjectManager };
            ctx.Roles.Add(role);
            await ctx.SaveChangesAsync();
            if (existingPm)
                await new UserService(NullLogger<UserService>.Instance, ctx).AddRoleToUserAsync(id, role.Name, id);
            var permissions = await ctx.Permissions.AsNoTracking().ToListAsync();
            var service = new PpmPortfolioService(new ThrowingFinancialApiService(error),
                new FakePpmPortfolioReader { Error = error }, Options.Create(new FeatureFlagOptions { UseGraphQLAPI = legacy }));
            var orchestrator = CreateOrchestrator(ctx, service);

            Func<Task> action = () => orchestrator.EnsureUserProfileAsync(id, id.ToString(), CreatePrincipal(id, "pm@example.com", "IAM-123"));
            (await action.Should().ThrowAsync<Exception>()).Which.Should().BeSameAs(error);
            (await ctx.Permissions.AsNoTracking().ToListAsync()).Should().BeEquivalentTo(permissions);
        }
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Non_pm_roles_do_not_grant_pm(bool legacy)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        ctx.Roles.Add(new Role { Name = Role.Names.ProjectManager });
        await ctx.SaveChangesAsync();
        var id = Guid.NewGuid();
        var service = CreatePortfolioService(legacy,
            [new("P1", [new(PpmRole.PrincipalInvestigator, "PI", "E12345", null)],
                [new("Project Administrator", "Admin", "E12345", null)])]);
        await CreateOrchestrator(ctx, service).EnsureUserProfileAsync(id, id.ToString(), CreatePrincipal(id, "pi@example.com", "IAM-123"));
        (await ctx.Permissions.ToListAsync()).Should().BeEmpty();
    }

    private static UserProfileOrchestrator CreateOrchestrator(AppDbContext ctx, PpmPortfolioService service)
        => new(new FakeEntraUserAttributeService(null),
            new FakeIdentityService(new IamIdentity("IAM-123", "E12345", "Manager"),
                new Dictionary<string, string?> { ["IAM-123"] = "guser" }),
            new UserService(NullLogger<UserService>.Instance, ctx), service, NullLogger<UserProfileOrchestrator>.Instance);

    private static PpmPortfolioService CreatePortfolioService(bool legacy, IReadOnlyList<FakeFinancialProject> projects)
        => new(legacy ? new FakeFinancialApiService([], null, projects) : new ThrowingFinancialApiService(new Exception("GraphQL must not be called")),
            legacy ? new FakePpmPortfolioReader { Error = new Exception("Imported reader must not be called") } : new FakePpmPortfolioReader(projects),
            Options.Create(new FeatureFlagOptions { UseGraphQLAPI = legacy }));

    private sealed class ThrowingFinancialApiService(Exception error) : IFinancialApiService
    {
        public AggieEnterpriseApi.IAggieEnterpriseClient GetClient() => throw error;
    }

    private static ClaimsPrincipal CreatePrincipal(Guid userId, string email, string? iamId = null)
    {
        var claims = new List<Claim>
        {
            new Claim(ClaimConstants.ObjectId, userId.ToString()),
            new Claim("preferred_username", email),
        };

        if (iamId is not null)
        {
            claims.Add(new Claim("ucdPersonIAMID", iamId));
        }

        var identity = new ClaimsIdentity(claims, authenticationType: "Test");

        return new ClaimsPrincipal(identity);
    }

    private sealed class FakeEntraUserAttributeService : IEntraUserAttributeService
    {
        private readonly EntraUserAttributes? _attributes;

        public FakeEntraUserAttributeService(EntraUserAttributes? attributes)
        {
            _attributes = attributes;
        }

        public int CallCount { get; private set; }

        public Task<EntraUserAttributes?> GetAttributesAsync(
            string userId,
            ClaimsPrincipal principal,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(_attributes);
        }
    }

    private sealed class FakeIdentityService : IIdentityService
    {
        private readonly IamIdentity? _iamIdentity;
        private readonly IReadOnlyDictionary<string, string?> _kerberosByIamId;

        public FakeIdentityService(
            IamIdentity? iamIdentity,
            IReadOnlyDictionary<string, string?> kerberosByIamId)
        {
            _iamIdentity = iamIdentity;
            _kerberosByIamId = kerberosByIamId;
        }

        public Task<IamIdentity?> GetByIamId(string iamId)
        {
            return Task.FromResult(_iamIdentity?.IamId == iamId ? _iamIdentity : null);
        }

        public Task<string?> GetKerberosByIamId(string iamId)
        {
            return Task.FromResult(_kerberosByIamId.TryGetValue(iamId, out var kerberos)
                ? kerberos
                : null);
        }
    }

}
