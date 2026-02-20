using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Identity.Web;
using Server.Controllers;
using Server.Services;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using server.core.Services;

namespace server.tests.Controllers;

public sealed class AdminUsersControllerTests
{
    [Fact]
    public async Task AssignRole_upserts_user_and_assigns_role()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var grantingUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "manager",
            IamId = "IAM-MANAGER",
            EmployeeId = "E-MANAGER",
            DisplayName = "Manager User",
            Email = "manager@example.com",
        };

        var accrualViewerRole = new Role { Name = Role.Names.AccrualViewer };

        ctx.Users.Add(grantingUser);
        ctx.Roles.Add(accrualViewerRole);
        await ctx.SaveChangesAsync();

        var entraUserId = Guid.NewGuid();

        var graphProfile = new GraphUserProfile(
            Id: entraUserId.ToString(),
            DisplayName: "Graph User",
            Email: "graph.user@example.com",
            Kerberos: "guser",
            IamId: "IAM-123");

        var controller = CreateController(ctx, grantingUser.Id, graphProfile);

        var first = await controller.AssignRole(
            entraUserId,
            new AdminUsersController.AssignRoleRequest(Role.Names.AccrualViewer),
            CancellationToken.None);

        var firstPayload = first.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminUsersController.AssignRoleResponse>().Which;

        firstPayload.Added.Should().BeTrue();
        firstPayload.User.Id.Should().Be(entraUserId);
        firstPayload.User.Roles.Should().Contain(Role.Names.AccrualViewer);
        firstPayload.User.Kerberos.Should().Be(graphProfile.Kerberos);
        firstPayload.User.IamId.Should().Be(graphProfile.IamId);
        firstPayload.User.EmployeeId.Should().Be("E12345");
        firstPayload.User.Name.Should().Be("Iam FullName");

        ctx.Users.Should().ContainSingle(u => u.Id == entraUserId && u.IamId == graphProfile.IamId);
        ctx.Permissions.Should().ContainSingle(p =>
            p.UserId == entraUserId &&
            p.RoleId == accrualViewerRole.Id &&
            p.DeptCode == null &&
            p.GrantedByUserId == grantingUser.Id);

        var second = await controller.AssignRole(
            entraUserId,
            new AdminUsersController.AssignRoleRequest(Role.Names.AccrualViewer),
            CancellationToken.None);

        var secondPayload = second.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminUsersController.AssignRoleResponse>().Which;

        secondPayload.Added.Should().BeFalse();
        ctx.Permissions.Count(p => p.UserId == entraUserId && p.RoleId == accrualViewerRole.Id).Should().Be(1);
    }

    [Fact]
    public async Task AssignRole_rejects_unassignable_roles()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var grantingUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "manager",
            IamId = "IAM-MANAGER",
            EmployeeId = "E-MANAGER",
        };

        ctx.Users.Add(grantingUser);
        ctx.Roles.Add(new Role { Name = Role.Names.Admin });
        await ctx.SaveChangesAsync();

        var entraUserId = Guid.NewGuid();

        var graphProfile = new GraphUserProfile(
            Id: entraUserId.ToString(),
            DisplayName: "Graph User",
            Email: "graph.user@example.com",
            Kerberos: "guser",
            IamId: "IAM-123");

        var controller = CreateController(ctx, grantingUser.Id, graphProfile);

        var result = await controller.AssignRole(
            entraUserId,
            new AdminUsersController.AssignRoleRequest(Role.Names.Admin),
            CancellationToken.None);

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    private static AdminUsersController CreateController(AppDbContext ctx, Guid grantingUserId, GraphUserProfile graphProfile)
    {
        var graphService = new FakeGraphService(graphProfile);
        var userService = new UserService(NullLogger<UserService>.Instance, ctx);
        var identityService = new FakeIdentityService();

        var controller = new AdminUsersController(
            graphService,
            userService,
            identityService,
            NullLogger<AdminUsersController>.Instance);

        var httpContext = new DefaultHttpContext
        {
            User = CreateUser(grantingUserId),
        };

        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    private static ClaimsPrincipal CreateUser(Guid userId)
    {
        var claims = new List<Claim>
        {
            new(ClaimConstants.ObjectId, userId.ToString()),
        };

        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
    }

    private sealed class FakeGraphService : IGraphService
    {
        private readonly GraphUserProfile _profile;

        public FakeGraphService(GraphUserProfile profile)
        {
            _profile = profile;
        }

        public Task<GraphUserPhoto?> GetMePhotoAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException();
        }

        public Task<IReadOnlyList<GraphUserSearchResult>> SearchUsersAsync(
            ClaimsPrincipal principal,
            string query,
            CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException();
        }

        public Task<GraphUserProfile?> GetUserProfileAsync(
            ClaimsPrincipal principal,
            string userObjectId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<GraphUserProfile?>(userObjectId == _profile.Id ? _profile : null);
        }
    }

    private sealed class FakeIdentityService : IIdentityService
    {
        public Task<IamIdentity?> GetByIamId(string iamId)
        {
            if (iamId == "IAM-123")
            {
                return Task.FromResult<IamIdentity?>(new IamIdentity(iamId, "E12345", "Iam FullName"));
            }

            return Task.FromResult<IamIdentity?>(null);
        }
    }
}

