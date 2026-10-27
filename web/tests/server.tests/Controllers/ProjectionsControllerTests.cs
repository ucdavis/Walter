using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Server.Controllers;
using Server.Services;
using Server.Tests;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.Helpers;
using server.Services;
using server.tests.Fakes;

namespace server.tests.Controllers;

public sealed class ProjectionsControllerTests
{
    private const string PiIam = "IAM-100";
    private const string Supplies = "05 - Supplies";

    private static readonly FakeFinancialProject[] Portfolio =
    [
        new("P1", [new(PpmRole.PrincipalInvestigator, "PI", "100", null), new(PpmRole.ProjectManager, "PM", "200", null)], []),
    ];

    private static ProjectionsController CreateController(AppDbContext ctx, string? employeeId = null, bool financialViewer = false)
    {
        var claims = new List<Claim> { new("kerberos", "tester") };
        if (financialViewer) claims.Add(new Claim(ClaimTypes.Role, Role.Names.FinancialViewer));
        if (employeeId is not null)
        {
            var user = new User { Id = Guid.NewGuid(), Kerberos = "tester", IamId = $"IAM-{employeeId}", EmployeeId = employeeId };
            ctx.Users.Add(user);
            ctx.SaveChanges();
            claims.Add(new Claim(Microsoft.Identity.Web.ClaimConstants.ObjectId, user.Id.ToString()));
        }

        var data = new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData
            {
                Projects = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ProjectName = "Project 1" }],
                RunRates =
                [
                    new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, HistoryMonths = 3, MonthlyAmount = 50 },
                    new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, HistoryMonths = 12, MonthlyAmount = 20 },
                ],
            },
        };
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAuthorizationPolicies();

        return new ProjectionsController(
            ctx,
            new FakeDatamartService(new SearchablePersonRecord { IamId = PiIam, EmployeeId = "100", Name = "PI" }),
            services.BuildServiceProvider().GetRequiredService<IAuthorizationService>(),
            new UserService(NullLogger<UserService>.Instance, ctx),
            new PpmPortfolioService(new FakeFinancialApiService([], null, []), new FakePpmPortfolioReader(Portfolio),
                Options.Create(new FeatureFlagOptions { UseGraphQLAPI = false })),
            new ProjectionSeeder(data),
            data)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) },
            },
        };
    }

    private static async Task<Projection> CreateProjectionAsync(AppDbContext ctx)
    {
        var result = await CreateController(ctx, financialViewer: true)
            .Create(PiIam, new ProjectionsController.CreateProjectionRequest("Plan A", 3), default);
        return (Projection)((OkObjectResult)result).Value!;
    }

    [Fact]
    public async Task FinancialViewer_creates_and_gets_projection()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);

        created.Projects.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
        var result = await CreateController(ctx, financialViewer: true).Get(created.Id, default);
        result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Which.Name.Should().Be("Plan A");
    }

    [Fact]
    public async Task Pm_on_one_of_the_pis_projects_can_get_and_reset()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, employeeId: "200");

        (await controller.Get(created.Id, default)).Should().BeOfType<OkObjectResult>();
        (await controller.Reset(created.Id, new ProjectionsController.HistoryMonthsRequest(6), default)).Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task Unrelated_user_is_forbidden()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, employeeId: "999");

        (await controller.Get(created.Id, default)).Should().BeOfType<ForbidResult>();
        (await controller.ListByIam(PiIam, default)).Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task Reset_keeps_id_name_and_creator_and_drops_edits()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        ctx.ProjectionProjects.Add(new ProjectionProject { ProjectionId = created.Id, ProjectName = "Hypothetical" });
        ctx.SaveChanges();

        var result = await CreateController(ctx, financialViewer: true)
            .Reset(created.Id, new ProjectionsController.HistoryMonthsRequest(3), default);

        var reset = result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject;
        reset.Should().BeEquivalentTo(new { created.Id, Name = "Plan A", CreatedBy = "tester" });
        reset.Projects.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
        ctx.ProjectionProjects.Count().Should().Be(1);
    }

    [Fact]
    public async Task HistoryMonths_rejects_invalid_window()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);

        var result = await CreateController(ctx, financialViewer: true)
            .HistoryMonths(created.Id, new ProjectionsController.HistoryMonthsRequest(4), default);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Child_from_another_projection_is_not_found()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var a = await CreateProjectionAsync(ctx);
        var b = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var jobB = (ProjectionJob)((OkObjectResult)await controller.CreateJob(b.Id, new ProjectionJob { Name = "B job" }, default)).Value!;

        (await controller.UpdateJob(a.Id, jobB.Id, new ProjectionJob { Name = "Hijack" }, default)).Should().BeOfType<NotFoundResult>();
        jobB.Name.Should().Be("B job");
    }

    [Fact]
    public async Task Funding_pointing_at_another_projections_project_is_not_found()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var a = await CreateProjectionAsync(ctx);
        var b = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var jobA = (ProjectionJob)((OkObjectResult)await controller.CreateJob(a.Id, new ProjectionJob { Name = "A job" }, default)).Value!;

        var result = await controller.CreateFunding(a.Id, jobA.Id,
            new ProjectionFundingEntry { ProjectionProjectId = b.Projects.Single().Id, Percent = 1 }, default);

        result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task Creating_projected_expense_is_rejected()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var a = await CreateProjectionAsync(ctx);

        var result = await CreateController(ctx, financialViewer: true).CreateExpense(a.Id, new ProjectionExpense
        {
            ProjectionProjectId = a.Projects.Single().Id, Kind = ProjectionExpenseKind.Projected, ExpenditureCategory = Supplies, Amount = 1,
        }, default);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Edited_projected_expense_stays_projected_and_window_change_replaces_it()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var a = await CreateProjectionAsync(ctx);
        var project = a.Projects.Single();
        var projected = project.Expenses.Single();
        var controller = CreateController(ctx, financialViewer: true);

        var result = await controller.UpdateExpense(a.Id, projected.Id, new ProjectionExpense
        {
            ProjectionProjectId = project.Id, Kind = ProjectionExpenseKind.Projected, ExpenditureCategory = Supplies, Amount = 75,
        }, default);
        result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeEquivalentTo(new { Kind = ProjectionExpenseKind.Projected, Amount = 75m });

        await controller.HistoryMonths(a.Id, new ProjectionsController.HistoryMonthsRequest(12), default);
        ctx.ProjectionExpenses.Select(e => new { e.Kind, e.Amount }).Should().BeEquivalentTo(
            [new { Kind = ProjectionExpenseKind.Projected, Amount = 20m }]);
    }

    [Fact]
    public async Task Crud_round_trip_for_job_and_funding()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var a = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);

        var job = (ProjectionJob)((OkObjectResult)await controller.CreateJob(a.Id,
            new ProjectionJob { Name = "GSR #2", MonthlySalary = 4000, Fte = 0.5m }, default)).Value!;
        (await controller.CreateFunding(a.Id, job.Id,
            new ProjectionFundingEntry { ProjectionProjectId = a.Projects.Single().Id, Percent = 1 }, default)).Should().BeOfType<OkObjectResult>();

        var loaded = (Projection)((OkObjectResult)await controller.Get(a.Id, default)).Value!;
        loaded.Jobs.Should().ContainSingle().Which.FundingEntries.Should().ContainSingle().Which.Percent.Should().Be(1m);

        (await controller.DeleteJob(a.Id, job.Id, default)).Should().BeOfType<NoContentResult>();
        ctx.ProjectionJobs.Should().BeEmpty();
        ctx.ProjectionFundingEntries.Should().BeEmpty();
    }

    [Fact]
    public async Task Deleting_a_project_detaches_its_funding()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var a = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var job = (ProjectionJob)((OkObjectResult)await controller.CreateJob(a.Id, new ProjectionJob { Name = "Job" }, default)).Value!;
        await controller.CreateFunding(a.Id, job.Id, new ProjectionFundingEntry { ProjectionProjectId = a.Projects.Single().Id, Percent = 1 }, default);

        (await controller.DeleteProject(a.Id, a.Projects.Single().Id, default)).Should().BeOfType<NoContentResult>();

        ctx.ProjectionFundingEntries.Should().ContainSingle().Which.ProjectionProjectId.Should().BeNull();
    }
}
