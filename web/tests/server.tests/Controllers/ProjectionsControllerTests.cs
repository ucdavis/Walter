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
        bool financialViewer = false, TimeProvider? timeProvider = null, FakeProjectionDataSource? dataSource = null,
        string piEmployeeId = "100", bool piIdentityAvailable = true)
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
            new FakeDatamartService(piIdentityAvailable
                ? new SearchablePersonRecord { IamId = $"IAM-{piEmployeeId}", EmployeeId = piEmployeeId, Name = "PI" }
                : null),
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
    public async Task Create_from_draft_preserves_reviewed_snapshot_inputs_without_reseeding_or_sharing_request_objects()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var expected = JsonSerializer.Deserialize<ProjectionsController.ProjectionSnapshotDraft>(JsonSerializer.Serialize(request.Draft))!;
        var now = new DateTime(2026, 11, 8, 12, 0, 0, DateTimeKind.Utc);
        var data = UnavailableProjectionData();
        var controller = CreateController(ctx, financialViewer: true, timeProvider: new MutableTimeProvider(now), dataSource: data);

        var created = Document(await controller.Create(PiIam, request, default));

        created.Id.Should().BePositive();
        created.Should().BeEquivalentTo(new
        {
            Name = request.Name, HistoryMonths = 12, PiEmployeeId = "100",
            SeededAt = expected.SeededAt!.Value, CreatedAt = now, UpdatedAt = now,
            CreatedBy = "tester", UpdatedBy = "tester",
        });
        created.Projects.Should().BeEquivalentTo(expected.Projects);
        created.Jobs.Should().BeEquivalentTo(expected.Jobs);
        created.Projects.Should().NotBeSameAs(request.Draft!.Projects);
        created.Jobs.Single().FundingEntries.Should().NotBeSameAs(request.Draft.Jobs!.Single().FundingEntries);
        created.CreationKey.Should().Be(request.CreationKey);
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(created, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        response.RootElement.TryGetProperty("creationKey", out _).Should().BeFalse();

        request.Draft.Projects!.Single().Expenses.Single(e => e.Kind == ProjectionExpenseKind.Projected).Amount = 999;
        request.Draft.Jobs!.Single().FundingEntries.Clear();
        await ctx.SaveChangesAsync();
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(created.Id, default));
        reopened.Projects.Should().BeEquivalentTo(expected.Projects);
        reopened.Jobs.Should().BeEquivalentTo(expected.Jobs);
        reopened.SeededAt.Should().Be(expected.SeededAt!.Value);
        reopened.SeededAt.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public async Task Retrying_a_draft_creation_returns_the_same_plan_without_overwriting_later_edits()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = UnavailableProjectionData();
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);
        var request = NewPlanRequest();
        var created = Document(await controller.Create(PiIam, request, default));
        var edit = Draft(created) with { Name = "Edited after creation" };
        edit.Jobs.Single().MonthlySalary = 8123;
        var edited = Document(await controller.Save(created.Id, edit, default));
        var updatedAt = edited.UpdatedAt;
        ctx.ChangeTracker.Clear();

        var replay = Document(await controller.Create(PiIam, request with { Name = "Late retry", HistoryMonths = 3 }, default));

        replay.Id.Should().Be(created.Id);
        replay.Name.Should().Be("Edited after creation");
        replay.HistoryMonths.Should().Be(12);
        replay.Jobs.Single().MonthlySalary.Should().Be(8123);
        replay.UpdatedAt.Should().Be(updatedAt);
        (await ctx.Projections.CountAsync()).Should().Be(1);
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();
    }

    [Fact]
    public async Task Retrying_a_keyed_legacy_create_does_not_reseed()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = new ProjectionsController.CreateProjectionRequest("Original seeded plan", 3, CreationKey: Guid.NewGuid());
        var created = Document(await CreateController(ctx, financialViewer: true).Create(PiIam, request, default));
        ctx.ChangeTracker.Clear();
        var data = UnavailableProjectionData();

        var replay = Document(await CreateController(ctx, financialViewer: true, dataSource: data).Create(PiIam, request, default));

        replay.Id.Should().Be(created.Id);
        replay.SeededAt.Should().Be(created.SeededAt);
        replay.Projects.Should().BeEquivalentTo(created.Projects);
        (await ctx.Projections.CountAsync()).Should().Be(1);
        data.SnapshotAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Creation_keys_are_scoped_to_the_authorized_pi()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();

        var first = Document(await CreateController(ctx, financialViewer: true)
            .Create(PiIam, request, default));
        var second = Document(await CreateController(ctx, financialViewer: true, piEmployeeId: "300")
            .Create("IAM-300", request, default));

        first.Id.Should().NotBe(second.Id);
        first.PiEmployeeId.Should().Be("100");
        second.PiEmployeeId.Should().Be("300");
        first.CreationKey.Should().Be(second.CreationKey);
        (await ctx.Projections.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task An_unrelated_user_cannot_replay_creation_or_duplicate_a_plan()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var created = Document(await CreateController(ctx, financialViewer: true).Create(PiIam, request, default));
        var data = UnavailableProjectionData();
        var controller = CreateController(ctx, employeeId: "999", dataSource: data);

        (await controller.Create(PiIam, request, default)).Should().BeOfType<ForbidResult>();
        (await controller.Duplicate(created.Id, new("Unauthorized copy", Guid.NewGuid()), default)).Should().BeOfType<ForbidResult>();

        (await ctx.Projections.CountAsync()).Should().Be(1);
        data.SnapshotAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Duplicate_copies_the_stored_snapshot_and_nested_ids_without_resolving_identity_or_fetching_fresh_data()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var source = await StoreCapturedPlanAsync(ctx);
        var original = JsonSerializer.Serialize(source);
        var now = new DateTime(2026, 11, 8, 12, 0, 0, DateTimeKind.Utc);
        var data = UnavailableProjectionData();
        var controller = CreateController(ctx, financialViewer: true, timeProvider: new MutableTimeProvider(now),
            dataSource: data, piIdentityAvailable: false);

        var duplicate = Document(await controller.Duplicate(source.Id, new("Alternative plan", Guid.NewGuid()), default));

        duplicate.Id.Should().NotBe(source.Id);
        duplicate.Should().BeEquivalentTo(new
        {
            Name = "Alternative plan", source.PiEmployeeId, source.SeededAt, source.HistoryMonths,
            CreatedAt = now, UpdatedAt = now, CreatedBy = "tester", UpdatedBy = "tester",
        });
        duplicate.Projects.Should().BeEquivalentTo(source.Projects);
        duplicate.Jobs.Should().BeEquivalentTo(source.Jobs);
        duplicate.Projects.Single().Should().NotBeSameAs(source.Projects.Single());
        duplicate.Jobs.Single().FundingEntries.Should().NotBeSameAs(source.Jobs.Single().FundingEntries);
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();

        var edit = Draft(duplicate) with { Name = "Edited alternative" };
        edit.Projects.Single().Expenses.Single(e => e.Kind == ProjectionExpenseKind.Projected).Amount = 876;
        await controller.Save(duplicate.Id, edit, default);
        ctx.ChangeTracker.Clear();
        JsonSerializer.Serialize(Document(await controller.Get(source.Id, default))).Should().Be(original);
        (await ctx.Projections.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task Retrying_duplicate_returns_the_existing_copy_with_its_later_edits()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var source = await StoreCapturedPlanAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var request = new ProjectionsController.DuplicateProjectionRequest("First copy", Guid.NewGuid());
        var duplicate = Document(await controller.Duplicate(source.Id, request, default));
        var edit = Draft(duplicate) with { Name = "Renamed copy" };
        edit.Jobs.Single().MonthlySalary = 9999;
        var edited = Document(await controller.Save(duplicate.Id, edit, default));
        var updatedAt = edited.UpdatedAt;
        ctx.ChangeTracker.Clear();

        var replay = Document(await controller.Duplicate(source.Id, request with { Name = "Late retry name" }, default));

        replay.Id.Should().Be(duplicate.Id);
        replay.Name.Should().Be("Renamed copy");
        replay.Jobs.Single().MonthlySalary.Should().Be(9999);
        replay.UpdatedAt.Should().Be(updatedAt);
        (await ctx.Projections.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task Duplicate_requires_the_source_to_still_exist_even_when_replaying_a_successful_request()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var source = await StoreCapturedPlanAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var request = new ProjectionsController.DuplicateProjectionRequest("Copy", Guid.NewGuid());
        var duplicate = Document(await controller.Duplicate(source.Id, request, default));
        await controller.Delete(source.Id, source.UpdatedAt, default);

        (await controller.Duplicate(source.Id, request, default)).Should().BeOfType<NotFoundResult>();

        (await ctx.Projections.ToListAsync()).Should().ContainSingle().Which.Id.Should().Be(duplicate.Id);
    }

    [Fact]
    public async Task A_creation_key_can_create_again_after_its_created_plan_is_deleted()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var request = NewPlanRequest();
        var first = Document(await controller.Create(PiIam, request, default));
        await controller.Delete(first.Id, first.UpdatedAt, default);

        var recreated = Document(await controller.Create(PiIam, request, default));

        recreated.Id.Should().NotBe(first.Id);
        recreated.SeededAt.Should().Be(request.Draft!.SeededAt!.Value);
        (await ctx.Projections.CountAsync()).Should().Be(1);
    }

    [Theory]
    [InlineData("missing-key")]
    [InlineData("empty-key")]
    [InlineData("empty-name")]
    [InlineData("blank-name")]
    [InlineData("long-name")]
    [InlineData("window")]
    [InlineData("missing-snapshot")]
    [InlineData("default-snapshot")]
    [InlineData("non-utc-snapshot")]
    [InlineData("projects-null")]
    [InlineData("jobs-null")]
    [InlineData("budgets-null")]
    [InlineData("actuals-null")]
    [InlineData("run-rates-null")]
    [InlineData("expenses-null")]
    [InlineData("funding-null")]
    [InlineData("project-id-zero")]
    [InlineData("project-id-duplicate")]
    [InlineData("job-id-negative")]
    [InlineData("job-id-duplicate")]
    [InlineData("unknown-funding-project")]
    public async Task Create_from_draft_rejects_invalid_structure_without_querying_or_persisting(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var draft = request.Draft!;
        switch (invalid)
        {
            case "missing-key": request = request with { CreationKey = null }; break;
            case "empty-key": request = request with { CreationKey = Guid.Empty }; break;
            case "empty-name": request = request with { Name = "" }; break;
            case "blank-name": request = request with { Name = "  " }; break;
            case "long-name": request = request with { Name = new string('x', 201) }; break;
            case "window": request = request with { HistoryMonths = 4 }; break;
            case "missing-snapshot": request = request with { Draft = draft with { SeededAt = null } }; break;
            case "default-snapshot": request = request with { Draft = draft with { SeededAt = DateTime.MinValue } }; break;
            case "non-utc-snapshot": request = request with { Draft = draft with { SeededAt = DateTime.SpecifyKind(draft.SeededAt!.Value, DateTimeKind.Unspecified) } }; break;
            case "projects-null": request = request with { Draft = draft with { Projects = null } }; break;
            case "jobs-null": request = request with { Draft = draft with { Jobs = null } }; break;
            case "budgets-null": draft.Projects!.Single().Budgets = null!; break;
            case "actuals-null": draft.Projects!.Single().Actuals = null!; break;
            case "run-rates-null": draft.Projects!.Single().RunRates = null!; break;
            case "expenses-null": draft.Projects!.Single().Expenses = null!; break;
            case "funding-null": draft.Jobs!.Single().FundingEntries = null!; break;
            case "project-id-zero": draft.Projects!.Single().Id = 0; break;
            case "project-id-duplicate": draft.Projects!.Add(new() { Id = draft.Projects.Single().Id }); break;
            case "job-id-negative": draft.Jobs!.Single().Id = -1; break;
            case "job-id-duplicate": draft.Jobs!.Add(new() { Id = draft.Jobs.Single().Id }); break;
            case "unknown-funding-project": draft.Jobs!.Single().FundingEntries[0].ProjectId = 999; break;
        }
        var data = UnavailableProjectionData();

        (await CreateController(ctx, financialViewer: true, dataSource: data).Create(PiIam, request, default))
            .Should().BeOfType<BadRequestObjectResult>();

        ctx.Projections.Should().BeEmpty();
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();
    }

    [Fact]
    public async Task Create_from_draft_accepts_incomplete_and_out_of_range_planning_assumptions()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var job = request.Draft!.Jobs!.Single();
        job.MonthlySalary = null;
        job.FundingEntries[0].StartDate = new DateOnly(2027, 1, 1);
        job.FundingEntries[0].EndDate = new DateOnly(2027, 2, 1);
        job.FundingEntries[0].Percent = 0.75m;

        var created = Document(await CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData())
            .Create(PiIam, request, default));

        created.Jobs.Should().BeEquivalentTo(request.Draft.Jobs);
        created.Projects.Should().BeEquivalentTo(request.Draft.Projects);
    }

    [Theory]
    [InlineData("name")]
    [InlineData("long-name")]
    [InlineData("key")]
    public async Task Duplicate_rejects_an_invalid_name_or_creation_key(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var source = await StoreCapturedPlanAsync(ctx);
        var request = new ProjectionsController.DuplicateProjectionRequest(
            invalid == "name" ? " " : invalid == "long-name" ? new string('x', 201) : "Copy",
            invalid == "key" ? Guid.Empty : Guid.NewGuid());

        (await CreateController(ctx, financialViewer: true).Duplicate(source.Id, request, default))
            .Should().BeOfType<BadRequestObjectResult>();

        (await ctx.Projections.CountAsync()).Should().Be(1);
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

    private static ProjectionsController.CreateProjectionRequest NewPlanRequest() =>
        new("Reviewed new plan", 12, CapturedSnapshot(), Guid.NewGuid());

    private static ProjectionsController.ProjectionSnapshotDraft CapturedSnapshot() => new(
        new DateTime(2025, 11, 5, 8, 30, 0, DateTimeKind.Utc).AddTicks(1234567),
        [
            new ProjectionProject
            {
                Id = 41, ProjectNumber = "P1", TaskNumber = "CAPTURED-TASK", TaskName = "Original task",
                ProjectName = "Expired captured project", ProjectType = "Sponsored", AwardNumber = "A1", AwardName = "Original award",
                IsSeeded = true, StartDate = new DateOnly(2025, 1, 1), EndDate = new DateOnly(2025, 12, 31),
                Budgets = [new() { ExpenditureCategory = Supplies, Budget = 15000, SpentToDate = 2000, Committed = 1000, IsSeeded = true }],
                Actuals = [new() { ExpenditureCategory = Supplies, Month = new DateOnly(2025, 10, 1), Amount = 250 }],
                RunRates = [new() { ExpenditureCategory = Supplies, HistoryMonths = 12, MonthlyAmount = 20 }],
                Expenses = [
                    new() { Kind = ProjectionExpenseKind.Projected, ExpenditureCategory = Supplies, Amount = 75, Description = "Reviewed estimate" },
                    new() { Kind = ProjectionExpenseKind.OneTime, ExpenditureCategory = Supplies, Amount = 300, StartMonth = new DateOnly(2026, 6, 1), Description = "Retained out-of-range expense" },
                ],
            },
        ],
        [
            new ProjectionJob
            {
                Id = 73, Name = "Planned hire", MonthlySalary = 6500, Fte = 0.5m,
                CbrRate = 0.25m, VacationAccrualRate = 0.083m, ColaMonth = 7, ColaRate = 0.03m,
                FeeRemissionMonthly = 1500, StartDate = new DateOnly(2025, 11, 1), EndDate = new DateOnly(2025, 12, 31),
                FundingEntries = [
                    new() { ProjectId = 41, Percent = 0.4m, StartDate = new DateOnly(2025, 11, 1), EndDate = new DateOnly(2025, 11, 15) },
                    new() { ProjectId = null, Percent = 0.6m, StartDate = new DateOnly(2025, 11, 1), EndDate = new DateOnly(2025, 11, 30) },
                ],
            },
        ]);

    private static async Task<Projection> StoreCapturedPlanAsync(AppDbContext ctx)
    {
        var snapshot = CapturedSnapshot();
        var source = new Projection
        {
            PiEmployeeId = "100", Name = "Stored source", HistoryMonths = 12,
            SeededAt = snapshot.SeededAt!.Value, CreatedAt = snapshot.SeededAt.Value,
            UpdatedAt = snapshot.SeededAt.Value.AddDays(1), CreatedBy = "original-owner", UpdatedBy = "previous-editor",
            Projects = snapshot.Projects!, Jobs = snapshot.Jobs!,
        };
        ctx.Projections.Add(source);
        await ctx.SaveChangesAsync();
        return source;
    }

    private static FakeProjectionDataSource UnavailableProjectionData() => new()
    {
        SeedResponse = Task.FromException<ProjectionSeedData>(new InvalidOperationException("Fresh data is unavailable")),
    };

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
