using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using System.Reflection;

namespace server.tests.Data;

public sealed class DbInitializerTests
{
    [Fact]
    public async Task InitializeAsync_in_development_seeds_fake_accrual_viewer_idempotently()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var initializer = new DbInitializer(ctx, NullLogger<DbInitializer>.Instance);

        await InvokeSeedAsync(initializer, "SeedDevelopmentAsync");
        await InvokeSeedAsync(initializer, "SeedDevelopmentAsync");

        var seededUser = await ctx.Users
            .SingleAsync(u => u.Id == DevelopmentSeedData.AccrualViewerUserId);

        seededUser.DisplayName.Should().Be(DevelopmentSeedData.AccrualViewerDisplayName);
        seededUser.Kerberos.Should().Be(DevelopmentSeedData.AccrualViewerKerberos);
        seededUser.Email.Should().Be(DevelopmentSeedData.AccrualViewerEmail);
        seededUser.IamId.Should().Be(DevelopmentSeedData.AccrualViewerIamId);
        seededUser.EmployeeId.Should().Be(DevelopmentSeedData.AccrualViewerEmployeeId);

        var roleNames = await ctx.Roles
            .OrderBy(r => r.Name)
            .Select(r => r.Name)
            .ToListAsync();

        roleNames.Should().BeEquivalentTo(
            [
                Role.Names.System,
                Role.Names.Admin,
                Role.Names.Manager,
                Role.Names.AccrualViewer,
                Role.Names.FinancialViewer,
                Role.Names.ProjectManager,
            ]);

        var permissions = await ctx.Permissions
            .Where(p => p.UserId == DevelopmentSeedData.AccrualViewerUserId)
            .ToListAsync();

        permissions.Should().ContainSingle();
        permissions[0].GrantedByUserId.Should().BeNull();

        var accrualViewerRoleId = await ctx.Roles
            .Where(r => r.Name == Role.Names.AccrualViewer)
            .Select(r => r.Id)
            .SingleAsync();

        permissions[0].RoleId.Should().Be(accrualViewerRoleId);
        permissions[0].DeptCode.Should().BeNull();

        ctx.Users.Count().Should().Be(1);
        ctx.Permissions.Count().Should().Be(1);
    }

    [Fact]
    public async Task InitializeAsync_in_production_safe_mode_does_not_seed_fake_user()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var initializer = new DbInitializer(ctx, NullLogger<DbInitializer>.Instance);

        await InvokeSeedAsync(initializer, "SeedProductionSafeAsync");

        ctx.Users.Should().BeEmpty();
        ctx.Permissions.Should().BeEmpty();
        ctx.Roles.Select(r => r.Name).Should().Contain(Role.Names.AccrualViewer);
    }

    private static async Task InvokeSeedAsync(DbInitializer initializer, string methodName)
    {
        var method = typeof(DbInitializer).GetMethod(methodName, BindingFlags.Instance | BindingFlags.NonPublic);
        method.Should().NotBeNull();

        var result = method!.Invoke(initializer, [CancellationToken.None]);
        result.Should().BeAssignableTo<Task>();

        await (Task)result!;
    }
}
