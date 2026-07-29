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
            new FakeFinancialApiService(),
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
            new FakeFinancialApiService(),
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
