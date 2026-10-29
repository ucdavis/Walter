using System.Security.Claims;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

    private static ProjectionsController CreateController(AppDbContext ctx, string? employeeId = null, bool financialViewer = false, FakeProjectionDataSource? source = null)
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

        var data = source ?? new FakeProjectionDataSource
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
    public async Task Seed_reads_live_portfolio_without_persisting_a_projection()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx, employeeId: "200");

        var result = await controller.Seed(PiIam, 3, default);

        var preview = result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject;
        preview.Id.Should().Be(0);
        preview.PiEmployeeId.Should().Be("100");
        preview.Projects.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
        preview.Projects.Single().Expenses.Single().Amount.Should().Be(50);
        preview.Settings.Should().BeEquivalentTo(new ProjectionSettings());
        ctx.Projections.Should().BeEmpty();
    }

    [Fact]
    public async Task Seed_and_draft_creation_enforce_portfolio_access_before_reading_source_data()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = new FakeProjectionDataSource();
        var controller = CreateController(ctx, employeeId: "999", source: data);
        var draft = new ProjectionsController.ProjectionSnapshotDraft(DateTime.UtcNow, [], []);

        (await controller.Seed(PiIam, 6, default)).Should().BeOfType<ForbidResult>();
        (await controller.Create(PiIam, new("Other PI's plan", 6, draft), default)).Should().BeOfType<ForbidResult>();

        data.SeedCalls.Should().Be(0);
        ctx.Projections.Should().BeEmpty();
    }

    [Fact]
    public async Task Create_from_edited_snapshot_preserves_dates_and_choices_without_reseeding()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = new FakeProjectionDataSource();
        var controller = CreateController(ctx, financialViewer: true, source: data);
        var snapshot = new ProjectionsController.ProjectionSnapshotDraft(
            new DateTime(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc),
            [new ProjectionProject { Id = 4, ProjectName = "Hypothetical", Budgets = [new() { ExpenditureCategory = Supplies, Budget = 1000 }] }],
            [new ProjectionJob { Id = 7, Name = "New hire", FundingEntries = [new() { ProjectId = 4, Percent = 0.5m }] }],
            new ProjectionSettings { StartMonth = "2026-11", Months = 18, Note = "Fieldwork", SelectedProjectIds = [4], ExcludedJobIds = [7] });

        var result = await controller.Create(PiIam, new("Edited preview", 6, snapshot), default);
        var saved = result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject;
        ctx.ChangeTracker.Clear();
        var loaded = (Projection)((OkObjectResult)await controller.Get(saved.Id, default)).Value!;

        data.SeedCalls.Should().Be(0);
        loaded.Id.Should().BeGreaterThan(0);
        loaded.PiEmployeeId.Should().Be("100");
        loaded.CreatedBy.Should().Be("tester");
        loaded.SeededAt.Should().Be(snapshot.SeededAt);
        loaded.Projects.Should().BeEquivalentTo(snapshot.Projects);
        loaded.Jobs.Should().BeEquivalentTo(snapshot.Jobs);
        loaded.Settings.Should().BeEquivalentTo(snapshot.Settings);
    }

    [Fact]
    public void Guided_planner_requires_no_database_model_changes()
    {
        // EF compares model metadata only; this test never connects to SQL Server.
        using var ctx = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=127.0.0.1;Database=ModelCheck;Integrated Security=true")
            .Options);

        ctx.Database.HasPendingModelChanges().Should().BeFalse();
    }

    [Fact]
    public async Task Save_uses_existing_schema_and_preserves_settings_in_projects_json()
    {
        using var ctx = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite("Data Source=:memory:").Options);
        await ctx.Database.OpenConnectionAsync();
        await ctx.Database.ExecuteSqlRawAsync("""
            CREATE TABLE "Projections" (
                "Id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "PiEmployeeId" TEXT NOT NULL,
                "Name" TEXT NOT NULL,
                "HistoryMonths" INTEGER NOT NULL,
                "SeededAt" TEXT NOT NULL,
                "CreatedBy" TEXT NULL,
                "CreatedAt" TEXT NOT NULL,
                "UpdatedBy" TEXT NULL,
                "UpdatedAt" TEXT NOT NULL,
                "Projects" TEXT NOT NULL,
                "Jobs" TEXT NOT NULL
            );
            """);
        ctx.Model.FindEntityType(typeof(Projection))!.FindProperty(nameof(Projection.Settings)).Should().BeNull();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        // Existing rows from PR #452 contain no guided metadata.
        created.Projects.ForEach(p => p.GuidedSettings = null);
        await ctx.SaveChangesAsync();
        ctx.ChangeTracker.Clear();
        created = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;
        created.Settings.Should().BeEquivalentTo(new ProjectionSettings());
        created.Settings = new ProjectionSettings();
        created.Settings.Note = "Saved note";
        created.Settings.Months = 18;
        created.Settings.SelectedProjectIds = [1];
        await ctx.SaveChangesAsync();
        ctx.ChangeTracker.Clear();
        var before = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;

        // Older clients submit only the original project fields and no top-level settings.
        var oldClientProjects = JsonSerializer.Deserialize<List<ProjectionProject>>(JsonSerializer.Serialize(before.Projects))!;
        oldClientProjects.ForEach(p => p.GuidedSettings = null);
        await controller.Save(before.Id, new(before.Name, before.HistoryMonths, oldClientProjects, before.Jobs), default);
        ctx.ChangeTracker.Clear();
        var after = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;

        after.Settings.Note.Should().Be("Saved note");
        after.Settings.Months.Should().Be(18);
        after.Settings.SelectedProjectIds.Should().Equal(1);
        after.Projects[0].GuidedSettings.Should().BeEquivalentTo(after.Settings);
        after.Projects.Count(p => p.GuidedSettings is not null).Should().Be(1);
    }

    [Fact]
    public async Task Save_rejects_broken_references_and_invalid_workspace_settings_without_changing_projection()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var brokenJob = new ProjectionJob { Id = 1, FundingEntries = [new() { ProjectId = 999 }] };

        (await controller.Save(created.Id, Draft(created) with { Name = "Must not save", Jobs = [brokenJob] }, default))
            .Should().BeOfType<BadRequestObjectResult>();
        foreach (var settings in new ProjectionSettings[]
        {
            new() { Months = 0 }, new() { Months = 121 }, new() { StartMonth = "2026-13" },
            new() { SelectedProjectIds = [999] }, new() { ExcludedJobIds = [999] },
        })
        {
            (await controller.Save(created.Id, Draft(created) with { Name = "Must not save", Settings = settings }, default))
                .Should().BeOfType<BadRequestObjectResult>();
        }
        ctx.ChangeTracker.Clear();
        var loaded = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;
        loaded.Name.Should().Be("Plan A");
        loaded.Settings.Should().BeEquivalentTo(new ProjectionSettings());
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

    private static ProjectionsController.SaveProjectionRequest Draft(Projection p, int? historyMonths = null) =>
        new(p.Name, historyMonths ?? p.HistoryMonths, p.Projects, p.Jobs, p.Settings);

    [Fact]
    public async Task Reset_keeps_id_name_and_creator_and_drops_edits()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        created.Projects.Add(new ProjectionProject { Id = 2, ProjectName = "Hypothetical" });
        created.Settings = new ProjectionSettings { Months = 18, Note = "Draft scenario", SelectedProjectIds = [2] };
        await controller.Save(created.Id, Draft(created), default);

        var result = await controller.Reset(created.Id, new ProjectionsController.HistoryMonthsRequest(3), default);

        var reset = result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject;
        reset.Should().BeEquivalentTo(new { created.Id, Name = "Plan A", CreatedBy = "tester" });
        reset.Projects.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
        reset.Settings.Should().BeEquivalentTo(new ProjectionSettings());
    }

    [Fact]
    public async Task Save_rejects_invalid_window()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);

        var result = await CreateController(ctx, financialViewer: true).Save(created.Id, Draft(created, 4), default);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Unrelated_user_cannot_save()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);

        var result = await CreateController(ctx, employeeId: "999").Save(created.Id, Draft(created) with { Name = "Hijack" }, default);

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task Save_persists_the_whole_document()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        created.Jobs.Add(new ProjectionJob
        {
            Id = 1, Name = "GSR #2", MonthlySalary = 4000, Fte = 0.5m,
            FundingEntries = [new() { ProjectId = created.Projects.Single().Id, Percent = 1 }],
        });

        (await controller.Save(created.Id, Draft(created) with { Name = "Plan B" }, default)).Should().BeOfType<OkObjectResult>();
        ctx.ChangeTracker.Clear();

        var loaded = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;
        loaded.Name.Should().Be("Plan B");
        loaded.Jobs.Should().ContainSingle().Which.FundingEntries.Should().ContainSingle()
            .Which.Should().BeEquivalentTo(new { ProjectId = created.Projects.Single().Id, Percent = 1m });
    }

    [Fact]
    public async Task Edited_projected_expense_survives_save_and_window_change_replaces_it()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var expenses = created.Projects.Single().Expenses;
        expenses.Single().Amount = 75;
        expenses.Add(new ProjectionExpense { Kind = ProjectionExpenseKind.Monthly, ExpenditureCategory = Supplies, Amount = 10 });

        await controller.Save(created.Id, Draft(created), default);
        ctx.ChangeTracker.Clear();
        var saved = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;
        saved.Projects.Single().Expenses.Select(e => (e.Kind, e.Amount)).Should().BeEquivalentTo(
            [(ProjectionExpenseKind.Projected, 75m), (ProjectionExpenseKind.Monthly, 10m)]);

        await controller.Save(created.Id, Draft(saved, 12), default);
        ctx.ChangeTracker.Clear();
        var rewindowed = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;
        rewindowed.HistoryMonths.Should().Be(12);
        rewindowed.Projects.Single().Expenses.Select(e => (e.Kind, e.Amount)).Should().BeEquivalentTo(
            [(ProjectionExpenseKind.Monthly, 10m), (ProjectionExpenseKind.Projected, 20m)]);
    }
    [Fact]
    public async Task Guided_save_preserves_edited_preview_after_history_window_changes()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        created.Projects.Single().Expenses.Single().Amount = 75;

        var result = await controller.Save(created.Id,
            Draft(created, 12) with { PreserveProjectedExpenses = true }, default);
        result.Should().BeOfType<OkObjectResult>();
        ctx.ChangeTracker.Clear();
        var saved = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;

        saved.HistoryMonths.Should().Be(12);
        saved.Projects.Single().Expenses.Should().ContainSingle().Which.Should().BeEquivalentTo(
            new { Kind = ProjectionExpenseKind.Projected, Amount = 75m, ExpenditureCategory = Supplies });
    }

}
