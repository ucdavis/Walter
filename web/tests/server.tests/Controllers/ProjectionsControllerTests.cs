using System.Security.Claims;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
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

    private static ProjectionsController CreateController(AppDbContext ctx, string? employeeId = null,
        bool financialViewer = false, TimeProvider? timeProvider = null, FakeProjectionDataSource? dataSource = null)
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

        var data = dataSource ?? new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData
            {
                Projects = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ProjectName = "Project 1" }],
                Actuals = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, Month = new DateTime(2026, 9, 1), Amount = 250 }],
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
            new ProjectionSeeder(data, timeProvider),
            data,
            timeProvider)
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
    public async Task Seed_returns_a_fresh_draft_without_creating_a_plan_or_saving_pending_changes()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var pending = new Projection { Name = "Pending unrelated write", PiEmployeeId = "100" };
        ctx.Projections.Add(pending);
        var snapshot = new DateTime(2026, 11, 7, 23, 59, 59, DateTimeKind.Utc).AddTicks(1234567);
        var data = new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData
            {
                Projects = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ProjectName = "Source project" }],
                Budgets = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, Budget = 1000, SpentToDate = 200, Committed = 100 }],
                Actuals = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, Month = new DateTime(2026, 10, 1), Amount = 200 }],
                RunRates = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, HistoryMonths = 12, MonthlyAmount = 25 }],
            },
            Personnel = [new() { EmployeeId = "E1", PositionNumber = "X1", ProjectId = "P1", Task = "TASK01", MonthlyRate = 5000, Fte = 1, DistributionPercent = 100 }],
        };
        var controller = CreateController(ctx, financialViewer: true, timeProvider: new MutableTimeProvider(snapshot), dataSource: data);

        var draft = Document(await controller.Seed(PiIam, 12, default));

        draft.Should().BeEquivalentTo(new
        {
            Id = 0, Name = "New projection", PiEmployeeId = "100", HistoryMonths = 12,
            SeededAt = snapshot, CreatedAt = default(DateTime), UpdatedAt = default(DateTime),
        });
        draft.CreatedBy.Should().BeNull();
        draft.UpdatedBy.Should().BeNull();
        draft.Projects.Should().ContainSingle().Which.Budgets.Should().ContainSingle().Which.Budget.Should().Be(1000);
        draft.Projects.Single().Actuals.Should().ContainSingle().Which.Amount.Should().Be(200);
        draft.Projects.Single().Expenses.Should().ContainSingle().Which.Amount.Should().Be(25);
        draft.Jobs.Should().ContainSingle().Which.MonthlySalary.Should().Be(5000);
        data.SnapshotAtUtc.Should().Be(snapshot);
        (await ctx.Projections.CountAsync()).Should().Be(0);
        ctx.Entry(pending).State.Should().Be(EntityState.Added);
        ctx.ChangeTracker.Entries<Projection>().Should().ContainSingle().Which.Entity.Should().BeSameAs(pending);
    }

    [Fact]
    public async Task Seed_returns_an_empty_draft_without_querying_personnel_when_no_source_projects_exist()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = new FakeProjectionDataSource();

        var draft = Document(await CreateController(ctx, financialViewer: true, dataSource: data).Seed(PiIam, 3, default));

        draft.Id.Should().Be(0);
        draft.Projects.Should().BeEmpty();
        draft.Jobs.Should().BeEmpty();
        data.PersonnelProjectNumbers.Should().BeNull();
        ctx.Projections.Should().BeEmpty();
    }

    [Fact]
    public async Task Http_seed_defaults_to_three_months_and_is_not_cacheable_or_persisted()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var snapshot = new DateTime(2026, 11, 7, 23, 59, 59, DateTimeKind.Utc).AddTicks(1234567);
        var clock = new MutableTimeProvider(snapshot);
        using var host = new HostBuilder().ConfigureWebHost(builder => builder.UseTestServer()
            .ConfigureServices(services =>
            {
                services.AddLogging();
                services.AddAuthorizationPolicies();
                services.AddControllers().AddApplicationPart(typeof(ProjectionsController).Assembly).AddControllersAsServices();
                services.AddScoped(_ => CreateController(ctx, financialViewer: true, timeProvider: clock));
            })
            .Configure(app =>
            {
                app.UseRouting();
                app.Use((context, next) =>
                {
                    context.User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim("kerberos", "tester"), new Claim(ClaimTypes.Role, Role.Names.FinancialViewer)], "Test"));
                    return next(context);
                });
                app.UseAuthorization();
                app.UseEndpoints(endpoints => endpoints.MapControllers());
            })).Start();
        using var client = host.GetTestClient();

        using var response = await client.GetAsync($"/api/projections/by-iam/{PiIam}/seed");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoStore.Should().BeTrue();
        var draft = (await response.Content.ReadFromJsonAsync<Projection>())!;
        draft.Should().BeEquivalentTo(new { Id = 0, Name = "New projection", HistoryMonths = 3, SeededAt = snapshot });
        draft.SeededAt.Kind.Should().Be(DateTimeKind.Utc);
        using var invalid = await client.GetAsync($"/api/projections/by-iam/{PiIam}/seed?historyMonths=4");
        invalid.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        ctx.Projections.Should().BeEmpty();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    public async Task Seed_rejects_an_invalid_history_window_before_querying_source_data(int historyMonths)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = new FakeProjectionDataSource();

        (await CreateController(ctx, financialViewer: true, dataSource: data).Seed(PiIam, historyMonths, default))
            .Should().BeOfType<BadRequestObjectResult>();

        data.SnapshotAtUtc.Should().BeNull();
        ctx.Projections.Should().BeEmpty();
    }

    [Theory]
    [InlineData("100")]
    [InlineData("200")]
    public async Task Seed_allows_the_pi_or_a_project_manager(string employeeId)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();

        var draft = Document(await CreateController(ctx, employeeId: employeeId).Seed(PiIam, 6, default));

        draft.PiEmployeeId.Should().Be("100");
        draft.HistoryMonths.Should().Be(6);
        draft.Projects.Should().ContainSingle();
        ctx.Projections.Should().BeEmpty();
    }

    [Theory]
    [InlineData(PiIam)]
    [InlineData("UNKNOWN")]
    public async Task Seed_does_not_distinguish_an_inaccessible_pi_from_an_unknown_iam(string iamId)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = new FakeProjectionDataSource();

        (await CreateController(ctx, employeeId: "999", dataSource: data).Seed(iamId, 3, default))
            .Should().BeOfType<ForbidResult>();

        data.SnapshotAtUtc.Should().BeNull();
        ctx.Projections.Should().BeEmpty();
    }

    [Fact]
    public async Task Seed_returns_not_found_for_an_unknown_iam_to_a_financial_viewer()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = new FakeProjectionDataSource();

        (await CreateController(ctx, financialViewer: true, dataSource: data).Seed("UNKNOWN", 3, default))
            .Should().BeOfType<NotFoundResult>();

        data.SnapshotAtUtc.Should().BeNull();
        ctx.Projections.Should().BeEmpty();
    }

    [Fact]
    public async Task Reopening_and_saving_preserve_expired_task_level_snapshot_inputs_without_reseeding()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var snapshot = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var saved = new Projection
        {
            PiEmployeeId = "100", Name = "Captured tasks", HistoryMonths = 3,
            CreatedAt = snapshot, SeededAt = snapshot, UpdatedAt = snapshot,
            Projects = [
                new() { Id = 1, ProjectNumber = "P1", TaskNumber = "TASK01", ProjectName = "First captured task", EndDate = new DateOnly(2025, 3, 31) },
                new() { Id = 2, ProjectNumber = "P1", TaskNumber = "TASK02", ProjectName = "Second captured task", EndDate = new DateOnly(2025, 3, 31) },
            ],
            Jobs = [new() { Id = 1, MonthlySalary = null, FundingEntries = [new() { ProjectId = 2, Percent = 0.6m }] }],
        };
        ctx.Projections.Add(saved);
        await ctx.SaveChangesAsync();
        var originalProjects = JsonSerializer.Serialize(saved.Projects);
        var originalJobs = JsonSerializer.Serialize(saved.Jobs);
        var data = new FakeProjectionDataSource { SeedResponse = Task.FromException<ProjectionSeedData>(new InvalidOperationException("Fresh data unavailable")) };
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);
        ctx.ChangeTracker.Clear();

        var loaded = Document(await controller.Get(saved.Id, default));
        var updated = Document(await controller.Save(saved.Id, Draft(loaded) with { Name = "Reviewed saved snapshot" }, default));
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(saved.Id, default));

        reopened.Name.Should().Be("Reviewed saved snapshot");
        reopened.SeededAt.Should().Be(snapshot);
        JsonSerializer.Serialize(reopened.Projects).Should().Be(originalProjects);
        JsonSerializer.Serialize(reopened.Jobs).Should().Be(originalJobs);
        updated.Id.Should().Be(saved.Id);
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();
    }

    [Fact]
    public async Task Pm_on_one_of_the_pis_projects_can_get_and_reset()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, employeeId: "200");

        (await controller.Get(created.Id, default)).Should().BeOfType<OkObjectResult>();
        (await controller.Reset(created.Id, new ProjectionsController.HistoryMonthsRequest(6, created.UpdatedAt), default)).Should().BeOfType<OkObjectResult>();
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
        JsonSerializer.Deserialize<ProjectionsController.SaveProjectionRequest>(JsonSerializer.Serialize(
            new ProjectionsController.SaveProjectionRequest(p.Name, historyMonths ?? p.HistoryMonths,
                p.Projects, p.Jobs, p.UpdatedAt, p.SeededAt)))!;

    [Fact]
    public async Task Reset_keeps_id_name_and_creator_and_drops_edits()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        created.Projects.Add(new ProjectionProject { Id = 2, ProjectName = "Hypothetical" });
        await controller.Save(created.Id, Draft(created), default);

        var result = await controller.Reset(created.Id, new ProjectionsController.HistoryMonthsRequest(3, created.UpdatedAt), default);

        var reset = result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject;
        reset.Should().BeEquivalentTo(new { created.Id, Name = "Plan A", CreatedBy = "tester" });
        reset.Projects.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
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
            Id = 1,
            Name = "GSR #2",
            MonthlySalary = 4000,
            Fte = 0.5m,
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
    public async Task Save_accepts_a_legacy_null_cbr_as_zero_and_preserves_the_supplied_vacation_rate()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var json = JsonSerializer.SerializeToNode(Draft(created), options)!;
        json["jobs"] = JsonNode.Parse("""
            [{"id":1,"name":"Legacy client job","cbrRate":null,"vacationAccrualRate":0.083}]
            """);
        var request = json.Deserialize<ProjectionsController.SaveProjectionRequest>(options)!;

        (await controller.Save(created.Id, request, default)).Should().BeOfType<OkObjectResult>();
        ctx.ChangeTracker.Clear();

        var saved = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;
        var job = saved.Jobs.Should().ContainSingle().Subject;
        job.CbrRate.Should().Be(0m);
        job.VacationAccrualRate.Should().Be(0.083m);
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(saved, options));
        response.RootElement.GetProperty("jobs")[0].GetProperty("cbrRate").ValueKind
            .Should().Be(JsonValueKind.Number);
    }

    [Fact]
    public async Task Save_preserves_reviewed_expenses_even_when_history_window_changes()
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
            [(ProjectionExpenseKind.Monthly, 10m), (ProjectionExpenseKind.Projected, 75m)]);
    }

    [Fact]
    public async Task Stale_normal_save_preserves_the_saved_document_and_submitted_draft()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var stale = Draft(created) with { Name = "My unsaved plan" };
        stale.Projects.Single().Expenses.Single().Amount = 999;
        await controller.Save(created.Id, Draft(created) with { Name = "Other editor" }, default);

        var result = await controller.Save(created.Id, stale, default);

        ConflictCode(result).Should().Be("conflict");
        stale.Name.Should().Be("My unsaved plan");
        stale.Projects.Single().Expenses.Single().Amount.Should().Be(999);
        ctx.ChangeTracker.Clear();
        var saved = Document(await controller.Get(created.Id, default));
        saved.Name.Should().Be("Other editor");
        saved.Projects.Single().Expenses.Single().Amount.Should().Be(50);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Save_requires_both_original_timestamp_tokens(bool overwrite)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var draft = Draft(created) with { Overwrite = overwrite };

        (await controller.Save(created.Id, draft with { ExpectedUpdatedAt = null }, default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(created.Id, draft with { ExpectedSeededAt = null }, default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(created.Id, draft with { ExpectedUpdatedAt = DateTime.MinValue }, default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(created.Id, draft with { ExpectedSeededAt = DateTime.SpecifyKind(created.SeededAt, DateTimeKind.Unspecified) }, default))
            .Should().BeOfType<BadRequestObjectResult>();
        created.Name.Should().Be("Plan A");
    }

    [Fact]
    public async Task Confirmed_overwrite_replaces_all_submitted_inputs_after_further_ordinary_saves()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var draft = Draft(created) with { Name = "My plan" };
        draft.Projects.Single().Expenses.Single().Amount = 123;
        draft.Jobs.Add(new ProjectionJob { Id = 7, Name = "My new hire", MonthlySalary = 8000 });
        await controller.Save(created.Id, Draft(created) with { Name = "First competing edit" }, default);
        ConflictCode(await controller.Save(created.Id, draft, default)).Should().Be("conflict");

        var later = Draft(created) with { Name = "Another edit after conflict" };
        later.Projects.Clear();
        later.Projects.Add(new ProjectionProject { Id = 2, ProjectName = "Other editor's project" });
        await controller.Save(created.Id, later, default);
        var result = await controller.Save(created.Id, draft with { Overwrite = true }, default);

        var saved = Document(result);
        saved.Name.Should().Be("My plan");
        saved.Projects.Should().ContainSingle().Which.Expenses.Single().Amount.Should().Be(123);
        saved.Projects.Single().Actuals.Single().Amount.Should().Be(250);
        saved.Projects.Single().RunRates.Should().HaveCount(2);
        saved.Jobs.Should().ContainSingle().Which.Name.Should().Be("My new hire");
        saved.SeededAt.Should().Be(draft.ExpectedSeededAt!.Value);
        saved.UpdatedAt.Should().BeAfter(later.ExpectedUpdatedAt!.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Save_cannot_cross_a_reset(bool overwrite)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var draft = Draft(created) with { Name = "Old snapshot", Overwrite = overwrite };
        var reset = Document(await controller.Reset(created.Id, new(12, created.UpdatedAt), default));

        var result = await controller.Save(created.Id, draft, default);

        ConflictCode(result).Should().Be("snapshotChanged");
        ctx.ChangeTracker.Clear();
        var saved = Document(await controller.Get(created.Id, default));
        saved.Name.Should().Be("Plan A");
        saved.SeededAt.Should().Be(reset.SeededAt);
        saved.HistoryMonths.Should().Be(12);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Save_cannot_resurrect_a_deleted_plan(bool overwrite)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var draft = Draft(created) with { Overwrite = overwrite };
        (await controller.Delete(created.Id, created.UpdatedAt, default)).Should().BeOfType<NoContentResult>();

        (await controller.Save(created.Id, draft, default)).Should().BeOfType<NotFoundResult>();
        ctx.Projections.Should().BeEmpty();
    }

    [Fact]
    public async Task Reset_and_delete_require_the_loaded_version()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var original = created.UpdatedAt;
        await controller.Save(created.Id, Draft(created) with { Name = "Keep this edit" }, default);

        (await controller.Reset(created.Id, new(12), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Delete(created.Id, null, default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Reset(created.Id, new(12, DateTime.MinValue), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Delete(created.Id, DateTime.MinValue, default)).Should().BeOfType<BadRequestObjectResult>();
        ConflictCode(await controller.Reset(created.Id, new(12, original), default)).Should().Be("conflict");
        ConflictCode(await controller.Delete(created.Id, original, default)).Should().Be("conflict");
        ctx.ChangeTracker.Clear();
        Document(await controller.Get(created.Id, default)).Name.Should().Be("Keep this edit");
    }

    [Fact]
    public async Task Unrelated_user_cannot_overwrite_reset_or_delete()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, employeeId: "999");

        (await controller.Save(created.Id, Draft(created) with { Overwrite = true }, default)).Should().BeOfType<ForbidResult>();
        (await controller.Reset(created.Id, new(3, created.UpdatedAt), default)).Should().BeOfType<ForbidResult>();
        (await controller.Delete(created.Id, created.UpdatedAt, default)).Should().BeOfType<ForbidResult>();
        created.Name.Should().Be("Plan A");
    }

    [Fact]
    public async Task Save_roundtrips_the_complete_scenario_payload_and_preserves_server_owned_metadata()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var original = new { created.Id, created.PiEmployeeId, created.SeededAt, created.CreatedBy, created.CreatedAt };
        var draft = Draft(created) with { Name = "Reviewed scenario" };
        draft.Projects.Single().Budgets.Add(new ProjectionBudget
        {
            ExpenditureCategory = Supplies,
            Budget = 20000,
            SpentToDate = 3000,
            Committed = 1000,
        });
        draft.Projects.Single().Expenses.Single().Amount = 75;
        draft.Projects.Single().Expenses.Add(new ProjectionExpense
        {
            Kind = ProjectionExpenseKind.Monthly,
            ExpenditureCategory = Supplies,
            Amount = 100,
            StartMonth = new DateOnly(2026, 12, 1),
            EndMonth = new DateOnly(2027, 6, 1),
        });
        draft.Jobs.Add(new ProjectionJob
        {
            Id = 7,
            Name = "Proposed hire",
            MonthlySalary = 6500,
            Fte = 1,
            CbrRate = 0.3m,
            StartDate = new DateOnly(2026, 12, 1),
            EndDate = new DateOnly(2027, 6, 30),
            FundingEntries = [new() { ProjectId = created.Projects.Single().Id, Percent = 1 }],
        });

        var saved = Document(await CreateController(ctx, financialViewer: true).Save(created.Id, draft, default));

        saved.Should().BeEquivalentTo(original);
        saved.Name.Should().Be(draft.Name);
        saved.Projects.Should().BeEquivalentTo(draft.Projects);
        saved.Jobs.Should().BeEquivalentTo(draft.Jobs);
        saved.Projects.Should().NotBeSameAs(draft.Projects);
        ctx.ChangeTracker.Clear();
        var reloaded = Document(await CreateController(ctx, financialViewer: true).Get(created.Id, default));
        reloaded.Projects.Should().BeEquivalentTo(draft.Projects);
        reloaded.Jobs.Should().BeEquivalentTo(draft.Jobs);
    }

    [Fact]
    public async Task Every_write_advances_exact_utc_tokens_with_a_frozen_or_backward_clock()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var instant = new DateTime(2026, 11, 6, 12, 0, 0, DateTimeKind.Utc).AddTicks(1234567);
        var clock = new MutableTimeProvider(instant);
        var controller = CreateController(ctx, financialViewer: true, timeProvider: clock);
        var created = Document(await controller.Create(PiIam, new("Frozen clock", 3), default));
        var seededAt = created.SeededAt;
        var initialUpdatedAt = created.UpdatedAt;
        var request = JsonSerializer.Deserialize<ProjectionsController.SaveProjectionRequest>(JsonSerializer.Serialize(Draft(created)))!;
        request.ExpectedUpdatedAt.Should().Be(initialUpdatedAt);
        request.ExpectedUpdatedAt!.Value.Kind.Should().Be(DateTimeKind.Utc);
        request.ExpectedSeededAt.Should().Be(seededAt);

        var saved = Document(await controller.Save(created.Id, request, default));
        saved.UpdatedAt.Should().Be(initialUpdatedAt.AddTicks(1));
        saved.SeededAt.Should().Be(seededAt);
        clock.UtcNow = instant.AddDays(-1);
        var secondSaved = Document(await controller.Save(created.Id, Draft(saved), default));
        secondSaved.UpdatedAt.Should().Be(initialUpdatedAt.AddTicks(2));
        var reset = Document(await controller.Reset(created.Id, new(12, secondSaved.UpdatedAt), default));
        reset.SeededAt.Should().Be(seededAt.AddTicks(1));
        reset.UpdatedAt.Should().Be(initialUpdatedAt.AddTicks(3));
        ctx.ChangeTracker.Clear();
        var reloaded = Document(await controller.Get(created.Id, default));
        reloaded.UpdatedAt.Should().Be(reset.UpdatedAt);
        reloaded.UpdatedAt.Kind.Should().Be(DateTimeKind.Utc);
        reloaded.SeededAt.Kind.Should().Be(DateTimeKind.Utc);
        reloaded.CreatedAt.Kind.Should().Be(DateTimeKind.Utc);
    }

    private static Projection Document(IActionResult result) =>
        result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject;

    private static string ConflictCode(IActionResult result) =>
        result.Should().BeOfType<ConflictObjectResult>().Which.Value.Should().BeOfType<ProjectionsController.ProjectionConflict>().Which.Code;

    private sealed class MutableTimeProvider(DateTime utcNow) : TimeProvider
    {
        public DateTime UtcNow { get; set; } = utcNow;
        public override DateTimeOffset GetUtcNow() => new(UtcNow);
    }
}
