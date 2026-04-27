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
    public async Task EnsureUserProfileAsync_uses_iam_kerberos_and_persists_user()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        ctx.Roles.Add(new Role { Name = Role.Names.ProjectManager });
        await ctx.SaveChangesAsync();

        var userId = Guid.NewGuid();
        var principal = CreatePrincipal(userId, "person@ucdavis.edu");

        var orchestrator = new UserProfileOrchestrator(
            new FakeEntraUserAttributeService(new EntraUserAttributes("IAM-123")),
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

        var orchestrator = new UserProfileOrchestrator(
            new FakeEntraUserAttributeService(new EntraUserAttributes("IAM-123")),
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
    }

    private static ClaimsPrincipal CreatePrincipal(Guid userId, string email)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimConstants.ObjectId, userId.ToString()),
            new Claim("preferred_username", email),
        ],
            authenticationType: "Test");

        return new ClaimsPrincipal(identity);
    }

    private sealed class FakeEntraUserAttributeService : IEntraUserAttributeService
    {
        private readonly EntraUserAttributes? _attributes;

        public FakeEntraUserAttributeService(EntraUserAttributes? attributes)
        {
            _attributes = attributes;
        }

        public Task<EntraUserAttributes?> GetAttributesAsync(
            string userId,
            ClaimsPrincipal principal,
            CancellationToken cancellationToken = default)
        {
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
