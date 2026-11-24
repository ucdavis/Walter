using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Server.Controllers;
using Server.Services;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using server.Helpers;
using server.Services;
using server.tests.Fakes;

namespace server.tests.Controllers;

public sealed class ProjectNicknamesControllerTests
{
    private static readonly SearchablePersonRecord TargetPi =
        new() { IamId = "IAM-PI", EmployeeId = "EPI", Name = "Target PI" };

    [Fact]
    public async Task Upsert_creates_then_updates_then_clears_for_financial_viewer()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx, CreateUser([Role.Names.FinancialViewer]));

        (await Put(controller, null, "SP001", null, "Smith startup")).Should().BeOfType<OkObjectResult>();
        ctx.ProjectNicknames.Should().ContainSingle(n =>
            n.ProjectNumber == "SP001" && n.TaskNumber == "" && n.Nickname == "Smith startup");

        (await Put(controller, null, "SP001", null, "Lab funds")).Should().BeOfType<OkObjectResult>();
        ctx.ProjectNicknames.Should().ContainSingle(n => n.Nickname == "Lab funds");

        (await Put(controller, null, "SP001", null, "   ")).Should().BeOfType<NoContentResult>();
        ctx.ProjectNicknames.Should().BeEmpty();
    }

    [Fact]
    public async Task Upsert_keeps_project_and_task_nicknames_separate()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx, CreateUser([Role.Names.FinancialViewer]));

        await Put(controller, null, "SP001", null, "A");
        await Put(controller, null, "SP001", "TASK01", "B");

        ctx.ProjectNicknames.Should().HaveCount(2);
    }

    [Fact]
    public async Task Upsert_normalizes_numbers_so_case_and_padding_hit_the_same_row()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx, CreateUser([Role.Names.FinancialViewer]));

        await Put(controller, null, "SP001", "TASK01", "A");
        await Put(controller, null, " sp001 ", "task01 ", "B");

        ctx.ProjectNicknames.Should().ContainSingle(n =>
            n.ProjectNumber == "SP001" && n.TaskNumber == "TASK01" && n.Nickname == "B");
    }

    [Fact]
    public async Task Upsert_accepts_40_characters_and_rejects_41()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx, CreateUser([Role.Names.FinancialViewer]));

        (await Put(controller, null, "SP001", null, new string('x', 40))).Should().BeOfType<OkObjectResult>();
        (await Put(controller, null, "SP002", null, new string('x', 41))).Should().BeOfType<BadRequestObjectResult>();

        ctx.ProjectNicknames.Should().ContainSingle(n => n.ProjectNumber == "SP001");
    }

    [Fact]
    public async Task Upsert_rejects_blank_project_number()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx, CreateUser([Role.Names.FinancialViewer]));

        (await Put(controller, null, "  ", null, "A")).Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Upsert_allows_project_manager_of_target_pi_for_project_in_that_portfolio()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, "EPM");
        var controller = MakeController(ctx, CreateUser([], requester.Id), [PiProject("SP001", pm: "EPM")]);

        (await Put(controller, "IAM-PI", "SP001", null, "Smith startup")).Should().BeOfType<OkObjectResult>();

        ctx.ProjectNicknames.Should().ContainSingle(n => n.UpdatedBy == "testuser");
    }

    [Fact]
    public async Task Upsert_allows_pm_on_one_project_to_nickname_another_project_of_the_same_pi()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, "EPM");
        var controller = MakeController(ctx, CreateUser([], requester.Id),
            [PiProject("SP001", pm: "EPM"), PiProject("SP002", pm: "EOTHERPM")]);

        (await Put(controller, "IAM-PI", "SP002", null, "Other one")).Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task Upsert_forbids_project_outside_the_named_portfolio()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, "EPM");
        var controller = MakeController(ctx, CreateUser([], requester.Id), [PiProject("SP001", pm: "EPM")]);

        (await Put(controller, "IAM-PI", "OTHER999", null, "Nope")).Should().BeOfType<ForbidResult>();
        ctx.ProjectNicknames.Should().BeEmpty();
    }

    [Fact]
    public async Task Upsert_forbids_requester_with_no_role_on_the_pi_portfolio()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, "ESTRANGER");
        var controller = MakeController(ctx, CreateUser([], requester.Id), [PiProject("SP001", pm: "EPM")]);

        (await Put(controller, "IAM-PI", "SP001", null, "Nope")).Should().BeOfType<ForbidResult>();
        ctx.ProjectNicknames.Should().BeEmpty();
    }

    [Fact]
    public async Task Upsert_forbids_non_financial_caller_without_iam_id()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var requester = SeedUser(ctx, "EPM");
        var controller = MakeController(ctx, CreateUser([], requester.Id), [PiProject("SP001", pm: "EPM")]);

        (await Put(controller, null, "SP001", null, "Nope")).Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task Get_returns_all_nicknames()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        ctx.ProjectNicknames.AddRange(
            new ProjectNickname { ProjectNumber = "SP001", TaskNumber = "", Nickname = "A" },
            new ProjectNickname { ProjectNumber = "SP001", TaskNumber = "TASK01", Nickname = "B" });
        ctx.SaveChanges();
        var controller = MakeController(ctx, CreateUser([]));

        var result = await controller.GetAsync(CancellationToken.None);

        result.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeAssignableTo<IReadOnlyList<ProjectNicknamesController.NicknameResponse>>()
            .Which.Should().HaveCount(2);
    }

    [Fact]
    public void Shared_list_does_not_expose_who_edited_a_nickname()
    {
        typeof(ProjectNicknamesController.NicknameResponse).GetProperties().Select(p => p.Name)
            .Should().BeEquivalentTo("ProjectNumber", "TaskNumber", "Nickname");
    }

    private static Task<IActionResult> Put(
        ProjectNicknamesController controller, string? iamId, string? project, string? task, string? nickname)
        => controller.UpsertAsync(
            new ProjectNicknamesController.UpsertNicknameRequest(iamId, project, task, nickname),
            CancellationToken.None);

    private static FakeFinancialProject PiProject(string number, string pm)
        => new(
            ProjectNumber: number,
            TeamMembers:
            [
                new FakeFinancialProjectTeamMember(PpmRole.PrincipalInvestigator, "Target PI", "EPI", null),
                new FakeFinancialProjectTeamMember(PpmRole.ProjectManager, "Team PM", pm, null),
            ],
            AwardPersonnel: []);

    private static ProjectNicknamesController MakeController(
        AppDbContext ctx, ClaimsPrincipal user, IReadOnlyList<FakeFinancialProject>? projects = null)
    {
        projects ??= [];
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAuthorizationPolicies();
        return new ProjectNicknamesController(
            ctx,
            new FakeDatamartService(TargetPi),
            services.BuildServiceProvider().GetRequiredService<IAuthorizationService>(),
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(
                new FakeFinancialApiService([], null, projects),
                new FakePpmPortfolioReader(projects),
                Microsoft.Extensions.Options.Options.Create(new FeatureFlagOptions { UseGraphQLAPI = false })))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = user },
            },
        };
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles, Guid? objectId = null)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        claims.Add(new Claim("kerberos", "testuser"));
        if (objectId is not null)
        {
            claims.Add(new Claim(Microsoft.Identity.Web.ClaimConstants.ObjectId, objectId.Value.ToString()));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, authenticationType: "Test"));
    }

    private static User SeedUser(AppDbContext ctx, string employeeId)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "testuser",
            IamId = $"IAM-{employeeId}",
            EmployeeId = employeeId,
        };
        ctx.Users.Add(user);
        ctx.SaveChanges();
        return user;
    }
}
