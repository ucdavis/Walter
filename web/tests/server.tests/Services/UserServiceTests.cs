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
}
