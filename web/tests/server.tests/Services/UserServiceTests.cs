using System;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Server.Services;
using server.core.Data;
using server.core.Domain;
using Server.Tests;
using Xunit;

namespace server.tests.Services;

public class UserServiceTests
{
    [Fact]
    public async Task GetRolesForUser_returns_assigned_role()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "jdoe",
            IamId = "123456789",
            EmployeeId = "E12345",
            DisplayName = "John Doe",
            Email = "jdoe@example.com"
        };

        var role = new Role
        {
            Name = "TestRole"
        };

        ctx.Users.Add(user);
        ctx.Roles.Add(role);
        await ctx.SaveChangesAsync();

        ctx.Permissions.Add(new Permission
        {
            UserId = user.Id,
            RoleId = role.Id
        });

        await ctx.SaveChangesAsync();

        var service = new UserService(NullLogger<UserService>.Instance, ctx);

        var roles = await service.GetRolesForUser(user.Id);

        roles.Should().Equal(role.Name);
    }

    [Fact]
    public async Task AddRoleToUserAsync_inserts_permission_and_returns_true()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "targetuser",
            IamId = "IAM-TARGET",
            EmployeeId = "E-TARGET",
            DisplayName = "Target User",
            Email = "target@example.com",
        };

        var grantingUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "grantinguser",
            IamId = "IAM-GRANT",
            EmployeeId = "E-GRANT",
            DisplayName = "Granting User",
            Email = "grant@example.com",
        };

        var role = new Role { Name = "TestRole" };

        ctx.Users.AddRange(targetUser, grantingUser);
        ctx.Roles.Add(role);
        await ctx.SaveChangesAsync();

        var service = new UserService(NullLogger<UserService>.Instance, ctx);

        var added = await service.AddRoleToUserAsync(targetUser.Id, role.Name, grantingUser.Id);

        added.Should().BeTrue();

        var roles = await service.GetRolesForUser(targetUser.Id);
        roles.Should().Equal(role.Name);

        ctx.Permissions.Should().ContainSingle(p =>
            p.UserId == targetUser.Id &&
            p.RoleId == role.Id &&
            p.DeptCode == null &&
            p.GrantedByUserId == grantingUser.Id);
    }

    [Fact]
    public async Task AddRoleToUserAsync_is_idempotent()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "targetuser",
            IamId = "IAM-TARGET",
            EmployeeId = "E-TARGET",
            DisplayName = "Target User",
            Email = "target@example.com",
        };

        var grantingUser = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "grantinguser",
            IamId = "IAM-GRANT",
            EmployeeId = "E-GRANT",
            DisplayName = "Granting User",
            Email = "grant@example.com",
        };

        var role = new Role { Name = "TestRole" };

        ctx.Users.AddRange(targetUser, grantingUser);
        ctx.Roles.Add(role);
        await ctx.SaveChangesAsync();

        var service = new UserService(NullLogger<UserService>.Instance, ctx);

        (await service.AddRoleToUserAsync(targetUser.Id, role.Name, grantingUser.Id)).Should().BeTrue();
        (await service.AddRoleToUserAsync(targetUser.Id, role.Name, grantingUser.Id)).Should().BeFalse();

        ctx.Permissions.Count(p => p.UserId == targetUser.Id && p.RoleId == role.Id).Should().Be(1);
    }
}
