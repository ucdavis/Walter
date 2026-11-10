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

public sealed partial class ProjectionsControllerTests
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
        var controller = CreateController(ctx, financialViewer: true);
        var draft = SeedResponse(await controller.Seed(PiIam, 3, default)).Draft;
        return Document(await controller.Create(PiIam,
            new(draft with { Name = "Plan A" }, Guid.NewGuid()), default));
    }

    [Fact]
    public async Task FinancialViewer_creates_and_gets_projection()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);

        created.Content.FundingSources.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
        var result = await CreateController(ctx, financialViewer: true).Get(created.Id, default);
        result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Which.Name.Should().Be("Plan A");
    }

    [Fact]
    public async Task Create_from_draft_preserves_reviewed_snapshot_inputs_without_reseeding_or_sharing_request_objects()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var expected = JsonSerializer.Deserialize<ProjectionDraft>(JsonSerializer.Serialize(request.Draft))!;
        var now = new DateTime(2026, 11, 8, 12, 0, 0, DateTimeKind.Utc);
        var data = UnavailableProjectionData();
        var controller = CreateController(ctx, financialViewer: true, timeProvider: new MutableTimeProvider(now), dataSource: data);

        var created = Document(await controller.Create(PiIam, request, default));

        created.Id.Should().BePositive();
        created.Should().BeEquivalentTo(new
        {
            Name = request.Draft!.Name, Content = expected.Content, PiEmployeeId = "100",
            SeededAt = expected.SeededAt, CreatedAt = now, UpdatedAt = now,
            CreatedBy = "tester", UpdatedBy = "tester",
        });
        created.Content.FundingSources.Should().BeEquivalentTo(expected.Content.FundingSources);
        created.Content.Appointments.Should().BeEquivalentTo(expected.Content.Appointments);
        created.Content.FundingSources.Should().NotBeSameAs(request.Draft!.Content.FundingSources);
        created.Content.Appointments.Single().Allocations.Should().NotBeSameAs(request.Draft.Content.Appointments!.Single().Allocations);
        created.CreationKey.Should().Be(request.CreationKey);
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(created, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        response.RootElement.TryGetProperty("creationKey", out _).Should().BeFalse();

        request.Draft.Content.FundingSources!.Single().HistoricalExpenseOverrides.Single().Amount = 999;
        request.Draft.Content.Appointments!.Single().Allocations.Clear();
        await ctx.SaveChangesAsync();
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(created.Id, default));
        reopened.Content.FundingSources.Should().BeEquivalentTo(expected.Content.FundingSources);
        reopened.Content.Appointments.Should().BeEquivalentTo(expected.Content.Appointments);
        reopened.SeededAt.Should().Be(expected.SeededAt);
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
        edit.Content.Appointments.Single().MonthlySalary = 8123;
        var edited = Document(await controller.Save(created.Id, edit, default));
        var updatedAt = edited.UpdatedAt;
        ctx.ChangeTracker.Clear();

        var replay = Document(await controller.Create(PiIam, request with { Draft = request.Draft! with { Name = "Late retry", Content = request.Draft.Content with { HistoryMonths = 3 } } }, default));

        replay.Id.Should().Be(created.Id);
        replay.Name.Should().Be("Edited after creation");
        replay.Content.HistoryMonths.Should().Be(12);
        replay.Content.Appointments.Single().MonthlySalary.Should().Be(8123);
        replay.UpdatedAt.Should().Be(updatedAt);
        (await ctx.Projections.CountAsync()).Should().Be(1);
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();
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
            Name = "Alternative plan", source.PiEmployeeId, source.SeededAt, source.Content,
            CreatedAt = now, UpdatedAt = now, CreatedBy = "tester", UpdatedBy = "tester",
        });
        duplicate.Content.FundingSources.Should().BeEquivalentTo(source.Content.FundingSources);
        duplicate.Content.Appointments.Should().BeEquivalentTo(source.Content.Appointments);
        duplicate.Content.FundingSources.Single().Should().NotBeSameAs(source.Content.FundingSources.Single());
        duplicate.Content.Appointments.Single().Allocations.Should().NotBeSameAs(source.Content.Appointments.Single().Allocations);
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();

        var edit = Draft(duplicate) with { Name = "Edited alternative" };
        edit.Content.FundingSources.Single().HistoricalExpenseOverrides.Single().Amount = 876;
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
        edit.Content.Appointments.Single().MonthlySalary = 9999;
        var edited = Document(await controller.Save(duplicate.Id, edit, default));
        var updatedAt = edited.UpdatedAt;
        ctx.ChangeTracker.Clear();

        var replay = Document(await controller.Duplicate(source.Id, request with { Name = "Late retry name" }, default));

        replay.Id.Should().Be(duplicate.Id);
        replay.Name.Should().Be("Renamed copy");
        replay.Content.Appointments.Single().MonthlySalary.Should().Be(9999);
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
        recreated.SeededAt.Should().Be(request.Draft!.SeededAt);
        (await ctx.Projections.CountAsync()).Should().Be(1);
    }

    [Theory]
    [InlineData("missing-draft")]
    [InlineData("empty-key")]
    [InlineData("empty-name")]
    [InlineData("blank-name")]
    [InlineData("long-name")]
    [InlineData("window")]
    [InlineData("default-snapshot")]
    [InlineData("non-utc-snapshot")]
    [InlineData("projects-null")]
    [InlineData("jobs-null")]
    [InlineData("budgets-null")]
    [InlineData("actuals-null")]
    [InlineData("run-rates-null")]
    [InlineData("expenses-null")]
    [InlineData("overrides-null")]
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
            case "missing-draft": request = request with { Draft = null }; break;
            case "empty-key": request = request with { CreationKey = Guid.Empty }; break;
            case "empty-name": request = request with { Draft = draft with { Name = "" } }; break;
            case "blank-name": request = request with { Draft = draft with { Name = "  " } }; break;
            case "long-name": request = request with { Draft = draft with { Name = new string('x', 201) } }; break;
            case "window": request = request with { Draft = draft with { Content = draft.Content with { HistoryMonths = 4 } } }; break;
            case "default-snapshot": request = request with { Draft = draft with { SeededAt = DateTime.MinValue } }; break;
            case "non-utc-snapshot": request = request with { Draft = draft with { SeededAt = DateTime.SpecifyKind(draft.SeededAt, DateTimeKind.Unspecified) } }; break;
            case "projects-null": request = request with { Draft = draft with { Content = draft.Content with { FundingSources = null! } } }; break;
            case "jobs-null": request = request with { Draft = draft with { Content = draft.Content with { Appointments = null! } } }; break;
            case "budgets-null": draft.Content.FundingSources!.Single().Budgets = null!; break;
            case "actuals-null": draft.Content.FundingSources!.Single().Actuals = null!; break;
            case "run-rates-null": draft.Content.FundingSources!.Single().RunRates = null!; break;
            case "expenses-null": draft.Content.FundingSources!.Single().Expenses = null!; break;
            case "overrides-null": draft.Content.FundingSources!.Single().HistoricalExpenseOverrides = null!; break;
            case "funding-null": draft.Content.Appointments!.Single().Allocations = null!; break;
            case "project-id-zero": draft.Content.FundingSources!.Single().Id = 0; break;
            case "project-id-duplicate": draft.Content.FundingSources!.Add(new() { Id = draft.Content.FundingSources.Single().Id }); break;
            case "job-id-negative": draft.Content.Appointments!.Single().Id = -1; break;
            case "job-id-duplicate": draft.Content.Appointments!.Add(new() { Id = draft.Content.Appointments.Single().Id }); break;
            case "unknown-funding-project": draft.Content.Appointments!.Single().Allocations[0].FundingSourceId = 999; break;
        }
        var data = UnavailableProjectionData();

        (await CreateController(ctx, financialViewer: true, dataSource: data).Create(PiIam, request, default))
            .Should().BeOfType<BadRequestObjectResult>();

        ctx.Projections.Should().BeEmpty();
        data.SnapshotAtUtc.Should().BeNull();
        data.PersonnelProjectNumbers.Should().BeNull();
    }

    [Fact]
    public async Task Create_from_draft_accepts_zero_salary_and_out_of_range_allocation_assumptions()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var job = request.Draft!.Content.Appointments!.Single();
        job.MonthlySalary = 0;
        job.Allocations[0].StartDate = new DateOnly(2027, 1, 1);
        job.Allocations[0].EndDate = new DateOnly(2027, 2, 1);
        job.Allocations[0].Percent = 0.75m;

        var created = Document(await CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData())
            .Create(PiIam, request, default));

        created.Content.Appointments.Should().BeEquivalentTo(request.Draft.Content.Appointments);
        created.Content.FundingSources.Should().BeEquivalentTo(request.Draft.Content.FundingSources);
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

        var response = SeedResponse(await controller.Seed(PiIam, 12, default));
        var draft = response.Draft;

        draft.Should().BeEquivalentTo(new
        {
            Name = "New projection", Content = new { HistoryMonths = 12, ForecastMonths = 12, Notes = (string?)null }, SeededAt = snapshot,
        });
        response.Roster.Should().ContainSingle().Which.Should().BeEquivalentTo(new
        {
            AppointmentId = draft.Content.Appointments.Single().Id, FundingSourceIds = new[] { 1 },
        });
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(response, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        json.RootElement.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo("draft", "roster");
        var draftJson = json.RootElement.GetProperty("draft");
        draftJson.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo("name", "seededAt", "content");
        var contentJson = draftJson.GetProperty("content");
        contentJson.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo("historyMonths", "forecastMonths", "notes", "fundingSources", "appointments");
        contentJson.GetProperty("appointments")[0].TryGetProperty("sourceProjectNumbers", out _).Should().BeFalse();
        contentJson.GetProperty("appointments")[0].TryGetProperty("fundingSourceIds", out _).Should().BeFalse();
        contentJson.GetProperty("appointments")[0].GetProperty("isSeeded").GetBoolean().Should().BeTrue();
        var sourceJson = contentJson.GetProperty("fundingSources")[0];
        sourceJson.TryGetProperty("isSeeded", out _).Should().BeFalse();
        sourceJson.GetProperty("budgets")[0].TryGetProperty("isSeeded", out _).Should().BeFalse();
        contentJson.GetProperty("appointments")[0].GetProperty("allocations")[0].TryGetProperty("isSeeded", out _).Should().BeFalse();
        draft.Content.FundingSources.Should().ContainSingle().Which.Budgets.Should().ContainSingle().Which.Budget.Should().Be(1000);
        draft.Content.FundingSources.Single().Actuals.Should().ContainSingle().Which.Amount.Should().Be(200);
        draft.Content.FundingSources.Single().RunRates.Should().ContainSingle().Which.MonthlyAmount.Should().Be(25);
        draft.Content.FundingSources.Single().Expenses.Should().BeEmpty();
        draft.Content.FundingSources.Single().HistoricalExpenseOverrides.Should().BeEmpty();
        draft.Content.Appointments.Should().ContainSingle().Which.MonthlySalary.Should().Be(5000);
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

        var response = SeedResponse(await CreateController(ctx, financialViewer: true, dataSource: data).Seed(PiIam, 3, default));
        var draft = response.Draft;

        response.Roster.Should().BeEmpty();
        draft.Content.FundingSources.Should().BeEmpty();
        draft.Content.Appointments.Should().BeEmpty();
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

        var lookups = await client.GetFromJsonAsync<ProjectionsController.ProjectionLookups>("/api/projections/lookups");
        lookups!.AppointmentDefaults.Should().BeEquivalentTo(new { Fte = 1m, CbrRate = 0.2m, ColaRate = 0.03m, ColaMonth = 7 });

        using var response = await client.GetAsync($"/api/projections/by-iam/{PiIam}/seed");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoStore.Should().BeTrue();
        var draft = (await response.Content.ReadFromJsonAsync<ProjectionSeedResponse>())!.Draft;
        draft.Should().BeEquivalentTo(new { Name = "New projection", Content = new { HistoryMonths = 3 }, SeededAt = snapshot });
        draft.SeededAt.Kind.Should().Be(DateTimeKind.Utc);
        using var catalog = await client.GetAsync($"/api/projections/by-iam/{PiIam}/sources");
        catalog.StatusCode.Should().Be(HttpStatusCode.OK);
        catalog.Headers.CacheControl!.NoStore.Should().BeTrue();
        var catalogSource = (await catalog.Content.ReadFromJsonAsync<List<ProjectionsController.ProjectionSourceSummary>>())!.Single();
        catalogSource.AvailableBalance.Should().Be(0m);
        catalogSource.CapturedAt.Should().Be(snapshot);
        catalogSource.CapturedAt.Kind.Should().Be(DateTimeKind.Utc);
        clock.UtcNow = snapshot.AddMonths(1);
        using var imported = await client.PostAsJsonAsync($"/api/projections/by-iam/{PiIam}/sources/import",
            new ProjectionsController.ImportProjectionSourcesRequest([new("P1", "TASK01")]));
        imported.StatusCode.Should().Be(HttpStatusCode.OK);
        imported.Headers.CacheControl!.NoStore.Should().BeTrue();
        var importedSource = (await imported.Content.ReadFromJsonAsync<List<ProjectionFundingSource>>())!.Single();
        importedSource.SourceKind.Should().Be(ProjectionSourceKind.Task);
        importedSource.CapturedAt.Should().Be(clock.UtcNow);
        importedSource.CapturedAt.Kind.Should().Be(DateTimeKind.Utc);
        importedSource.RunRates.Single(r => r.HistoryMonths == 12).MonthlyAmount.Should().Be(20);
        importedSource.Expenses.Should().BeEmpty();
        importedSource.HistoricalExpenseOverrides.Should().BeEmpty();
        using var invalid = await client.GetAsync($"/api/projections/by-iam/{PiIam}/seed?historyMonths=4");
        invalid.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        foreach (var missing in new[] { "sourceKind", "capturedAt" })
        {
            var request = JsonSerializer.SerializeToNode(NewPlanRequest(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
            request["draft"]!["content"]!["fundingSources"]![0]!.AsObject().Remove(missing);
            using var rejected = await client.PostAsJsonAsync($"/api/projections/by-iam/{PiIam}", request);
            rejected.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        var invalidCbr = JsonSerializer.SerializeToNode(NewPlanRequest(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        invalidCbr["draft"]!["content"]!["appointments"]![0]!["cbrRate"] = null;
        using var rejectedCbr = await client.PostAsJsonAsync($"/api/projections/by-iam/{PiIam}", invalidCbr);
        rejectedCbr.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        invalidCbr["draft"]!["content"]!["appointments"]![0]!.AsObject().Remove("cbrRate");
        using var omittedCbr = await client.PostAsJsonAsync($"/api/projections/by-iam/{PiIam}", invalidCbr);
        omittedCbr.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        foreach (var missing in new[] { "fundingSourceId", "percent" })
        {
            var request = JsonSerializer.SerializeToNode(NewPlanRequest(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
            request["draft"]!["content"]!["appointments"]![0]!["allocations"]![0]!.AsObject().Remove(missing);
            using var rejected = await client.PostAsJsonAsync($"/api/projections/by-iam/{PiIam}", request);
            rejected.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        using var missingDraft = await client.PostAsJsonAsync($"/api/projections/by-iam/{PiIam}", new { Name = "Unreviewed", HistoryMonths = 3 });
        missingDraft.StatusCode.Should().Be(HttpStatusCode.BadRequest);
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

        var draft = SeedResponse(await CreateController(ctx, employeeId: employeeId).Seed(PiIam, 6, default)).Draft;

        draft.Content.HistoryMonths.Should().Be(6);
        draft.Content.FundingSources.Should().ContainSingle();
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
            PiEmployeeId = "100", Name = "Captured tasks",
            CreatedAt = snapshot, SeededAt = snapshot, UpdatedAt = snapshot,
            Content = new()
            {
                FundingSources = [
                    new() { Id = 1, SourceKind = ProjectionSourceKind.Task, CapturedAt = snapshot, ProjectNumber = "P1", TaskNumber = "TASK01", Name = "First task", ProjectName = "First captured task", EndDate = new DateOnly(2025, 3, 31) },
                    new() { Id = 2, SourceKind = ProjectionSourceKind.Task, CapturedAt = snapshot, ProjectNumber = "P1", TaskNumber = "TASK02", Name = "Second task", ProjectName = "Second captured task", EndDate = new DateOnly(2025, 3, 31) },
                ],
                Appointments = [new() { Id = 1, IsSeeded = true, MonthlySalary = 5000, Allocations = [new() { FundingSourceId = 2, Percent = 0.6m }] }],
            },
        };
        ctx.Projections.Add(saved);
        await ctx.SaveChangesAsync();
        var originalProjects = JsonSerializer.Serialize(saved.Content.FundingSources);
        var originalJobs = JsonSerializer.Serialize(saved.Content.Appointments);
        var data = new FakeProjectionDataSource { SeedResponse = Task.FromException<ProjectionSeedData>(new InvalidOperationException("Fresh data unavailable")) };
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);
        ctx.ChangeTracker.Clear();

        var loaded = Document(await controller.Get(saved.Id, default));
        var updated = Document(await controller.Save(saved.Id, Draft(loaded) with { Name = "Reviewed saved snapshot" }, default));
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(saved.Id, default));

        reopened.Name.Should().Be("Reviewed saved snapshot");
        reopened.SeededAt.Should().Be(snapshot);
        JsonSerializer.Serialize(reopened.Content.FundingSources).Should().Be(originalProjects);
        JsonSerializer.Serialize(reopened.Content.Appointments).Should().Be(originalJobs);
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
            new ProjectionsController.SaveProjectionRequest(p.Name, p.Content with { HistoryMonths = historyMonths ?? p.Content.HistoryMonths }, p.UpdatedAt, p.SeededAt)))!;

    [Fact]
    public async Task Reset_keeps_id_name_and_creator_and_drops_edits()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var creationKey = created.CreationKey;
        var controller = CreateController(ctx, financialViewer: true);
        created.Content.ForecastMonths = 18;
        created.Content.Notes = "Keep these planning assumptions.";
        created.Content.FundingSources.Single().HistoricalExpenseOverrides.Add(new() { ExpenditureCategory = Supplies, Amount = 0 });
        created.Content.FundingSources.Single().Expenses.Add(new()
        {
            Id = 1, Kind = ProjectionExpenseKind.OneTime, Description = "Planned purchase",
            ExpenditureCategory = Supplies, Amount = 100, StartMonth = new(2027, 1, 1),
        });
        created.Content.FundingSources.Add(new ProjectionFundingSource { Id = 2, Name = "Hypothetical", SourceKind = ProjectionSourceKind.Planned, PlannedBudgetMode = ProjectionPlannedBudgetMode.GeneralPool, CapturedAt = created.SeededAt, StartDate = new(2027, 1, 1) });
        await controller.Save(created.Id, Draft(created), default);

        var result = await controller.Reset(created.Id, new ProjectionsController.HistoryMonthsRequest(3, created.UpdatedAt), default);

        var reset = result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject;
        reset.Should().BeEquivalentTo(new
        {
            created.Id, CreationKey = creationKey, Name = "Plan A", CreatedBy = "tester",
            Content = new { ForecastMonths = 18, Notes = "Keep these planning assumptions." },
        });
        reset.Content.FundingSources.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
        reset.Content.FundingSources.Single().HistoricalExpenseOverrides.Should().BeEmpty();
        reset.Content.FundingSources.Single().Expenses.Should().BeEmpty();
    }

    [Fact]
    public async Task Reset_keeps_the_entire_saved_plan_when_capture_fails()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var saved = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(saved);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());

        var reset = () => controller.Reset(saved.Id, new(3, saved.UpdatedAt), default);

        await reset.Should().ThrowAsync<InvalidOperationException>();
        JsonSerializer.Serialize(saved).Should().Be(before);
        ctx.ChangeTracker.Clear();
        JsonSerializer.Serialize(Document(await controller.Get(saved.Id, default))).Should().Be(before);
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
        created.Content.Appointments.Add(new ProjectionAppointment
        {
            Id = 1,
            Name = "GSR #2",
            MonthlySalary = 4000,
            StartDate = new DateOnly(2026, 12, 1),
            Fte = 0.5m,
            Allocations = [new() { FundingSourceId = created.Content.FundingSources.Single().Id, Percent = 1 }],
        });

        (await controller.Save(created.Id, Draft(created) with { Name = "Plan B" }, default)).Should().BeOfType<OkObjectResult>();
        ctx.ChangeTracker.Clear();

        var loaded = (Projection)((OkObjectResult)await controller.Get(created.Id, default)).Value!;
        loaded.Name.Should().Be("Plan B");
        loaded.Content.Appointments.Should().ContainSingle().Which.Allocations.Should().ContainSingle()
            .Which.Should().BeEquivalentTo(new { FundingSourceId = created.Content.FundingSources.Single().Id, Percent = 1m });
    }

    [Fact]
    public async Task Save_preserves_overrides_and_explicit_expenses_when_history_window_changes()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var draft = Draft(created);
        draft.Content.FundingSources.Single().HistoricalExpenseOverrides.Add(new() { ExpenditureCategory = Supplies, Amount = 0 });
        draft.Content.FundingSources.Single().Expenses.Add(new()
        {
            Id = 1, Kind = ProjectionExpenseKind.Monthly, Description = "Planned supplies",
            ExpenditureCategory = Supplies, Amount = -10, StartMonth = new(2026, 12, 1),
        });
        var expected = JsonSerializer.Serialize(draft.Content.FundingSources);

        var saved = Document(await controller.Save(created.Id, draft, default));
        await controller.Save(created.Id, Draft(saved, 12), default);
        ctx.ChangeTracker.Clear();
        var rewindowed = Document(await controller.Get(created.Id, default));

        rewindowed.Content.HistoryMonths.Should().Be(12);
        JsonSerializer.Serialize(rewindowed.Content.FundingSources).Should().Be(expected);
        rewindowed.Content.FundingSources.Single().HistoricalExpenseOverrides.Single().Amount.Should().Be(0);
    }

    [Fact]
    public async Task Stale_normal_save_preserves_the_saved_document_and_submitted_draft()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var stale = Draft(created) with { Name = "My unsaved plan" };
        stale.Content.FundingSources.Single().HistoricalExpenseOverrides.Add(new() { ExpenditureCategory = Supplies, Amount = 999 });
        await controller.Save(created.Id, Draft(created) with { Name = "Other editor" }, default);

        var result = await controller.Save(created.Id, stale, default);

        ConflictCode(result).Should().Be("conflict");
        stale.Name.Should().Be("My unsaved plan");
        stale.Content.FundingSources.Single().HistoricalExpenseOverrides.Single().Amount.Should().Be(999);
        ctx.ChangeTracker.Clear();
        var saved = Document(await controller.Get(created.Id, default));
        saved.Name.Should().Be("Other editor");
        saved.Content.FundingSources.Single().HistoricalExpenseOverrides.Should().BeEmpty();
        saved.Content.FundingSources.Single().RunRates.Single(r => r.HistoryMonths == 3).MonthlyAmount.Should().Be(50);
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
        draft.Content.FundingSources.Single().HistoricalExpenseOverrides.Add(new() { ExpenditureCategory = Supplies, Amount = 123 });
        draft.Content.Appointments.Add(new ProjectionAppointment { Id = 7, Name = "My new hire", MonthlySalary = 8000, StartDate = new DateOnly(2026, 12, 1) });
        await controller.Save(created.Id, Draft(created) with { Name = "First competing edit" }, default);
        ConflictCode(await controller.Save(created.Id, draft, default)).Should().Be("conflict");

        var later = Draft(created) with { Name = "Another edit after conflict" };
        later.Content.FundingSources.Clear();
        later.Content.FundingSources.Add(new ProjectionFundingSource { Id = 2, Name = "Other editor's source", SourceKind = ProjectionSourceKind.Planned, PlannedBudgetMode = ProjectionPlannedBudgetMode.GeneralPool, CapturedAt = later.ExpectedSeededAt!.Value, StartDate = new(2027, 1, 1) });
        await controller.Save(created.Id, later, default);
        var result = await controller.Save(created.Id, draft with { Overwrite = true }, default);

        var saved = Document(result);
        saved.Name.Should().Be("My plan");
        saved.Content.FundingSources.Should().ContainSingle().Which.HistoricalExpenseOverrides.Single().Amount.Should().Be(123);
        saved.Content.FundingSources.Single().Actuals.Single().Amount.Should().Be(250);
        saved.Content.FundingSources.Single().RunRates.Should().HaveCount(2);
        saved.Content.Appointments.Should().ContainSingle().Which.Name.Should().Be("My new hire");
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
        saved.Content.HistoryMonths.Should().Be(12);
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
        draft.Content.FundingSources.Single().Budgets.Add(new ProjectionBudget
        {
            ExpenditureCategory = Supplies,
            Budget = 20000,
            SpentToDate = 3000,
            Committed = 1000,
        });
        draft.Content.FundingSources.Single().HistoricalExpenseOverrides.Add(new() { ExpenditureCategory = Supplies, Amount = 75 });
        draft.Content.FundingSources.Single().Expenses.Add(new ProjectionExpense
        {
            Id = 1, Description = "Monthly supplies",
            Kind = ProjectionExpenseKind.Monthly,
            ExpenditureCategory = Supplies,
            Amount = 100,
            StartMonth = new DateOnly(2026, 12, 1),
            EndMonth = new DateOnly(2027, 6, 1),
        });
        draft.Content.Appointments.Add(new ProjectionAppointment
        {
            Id = 7,
            Name = "Proposed hire",
            MonthlySalary = 6500,
            Fte = 1,
            CbrRate = 0.3m,
            StartDate = new DateOnly(2026, 12, 1),
            EndDate = new DateOnly(2027, 6, 30),
            Allocations = [new() { FundingSourceId = created.Content.FundingSources.Single().Id, Percent = 1 }],
        });

        var saved = Document(await CreateController(ctx, financialViewer: true).Save(created.Id, draft, default));

        saved.Should().BeEquivalentTo(original);
        saved.Name.Should().Be(draft.Name);
        saved.Content.FundingSources.Should().BeEquivalentTo(draft.Content.FundingSources);
        saved.Content.Appointments.Should().BeEquivalentTo(draft.Content.Appointments);
        saved.Content.FundingSources.Should().NotBeSameAs(draft.Content.FundingSources);
        ctx.ChangeTracker.Clear();
        var reloaded = Document(await CreateController(ctx, financialViewer: true).Get(created.Id, default));
        reloaded.Content.FundingSources.Should().BeEquivalentTo(draft.Content.FundingSources);
        reloaded.Content.Appointments.Should().BeEquivalentTo(draft.Content.Appointments);
    }

    [Fact]
    public async Task Every_write_advances_exact_utc_tokens_with_a_frozen_or_backward_clock()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var instant = new DateTime(2026, 11, 6, 12, 0, 0, DateTimeKind.Utc).AddTicks(1234567);
        var clock = new MutableTimeProvider(instant);
        var controller = CreateController(ctx, financialViewer: true, timeProvider: clock);
        var created = Document(await controller.Create(PiIam, new(new("Frozen clock", instant, new()), Guid.NewGuid()), default));
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
        new(CapturedSnapshot(), Guid.NewGuid());

    private static ProjectionDraft CapturedSnapshot() => new(
        "Reviewed new plan",
        new DateTime(2025, 11, 5, 8, 30, 0, DateTimeKind.Utc).AddTicks(1234567),
        new ProjectionContent
        {
            HistoryMonths = 12, ForecastMonths = 18, Notes = "Captured planning notes\nKeep this context.",
            FundingSources = [
                new ProjectionFundingSource
                {
                    Id = 41, SourceKind = ProjectionSourceKind.Task, CapturedAt = new DateTime(2025, 11, 5, 8, 30, 0, DateTimeKind.Utc).AddTicks(1234567), ProjectNumber = "P1", TaskNumber = "CAPTURED-TASK", TaskName = "Original task",
                    Name = "Reviewed task", ProjectName = "Expired captured project", ProjectType = "Sponsored", AwardNumber = "A1", AwardName = "Original award",
                    StartDate = new DateOnly(2025, 1, 1), EndDate = new DateOnly(2025, 12, 31),
                    Budgets = [new() { ExpenditureCategory = Supplies, Budget = 15000, SpentToDate = 2000, Committed = 1000 }],
                    Actuals = [new() { ExpenditureCategory = Supplies, Month = new DateOnly(2025, 10, 1), Amount = 250 }],
                    RunRates = [new() { ExpenditureCategory = Supplies, HistoryMonths = 12, MonthlyAmount = 20 }],
                    HistoricalExpenseOverrides = [new() { ExpenditureCategory = Supplies, Amount = 75 }],
                    Expenses = [
                        new() { Id = 1, Kind = ProjectionExpenseKind.OneTime, ExpenditureCategory = Supplies, Amount = 300, StartMonth = new DateOnly(2026, 6, 1), Description = "Retained out-of-range expense" },
                    ],
                },
            ],
            Appointments = [
                new ProjectionAppointment
                {
                    Id = 73, Name = "Planned hire", MonthlySalary = 6500, Fte = 0.5m,
                    CbrRate = 0.25m, VacationAccrualRate = 0.083m, ColaMonth = 7, ColaRate = 0.03m,
                    FeeRemissionMonthly = 1500, StartDate = new DateOnly(2025, 11, 1), EndDate = new DateOnly(2025, 12, 31),
                    Allocations = [
                        new() { FundingSourceId = 41, Percent = 0.4m, StartDate = new DateOnly(2025, 11, 1), EndDate = new DateOnly(2025, 11, 15) },
                        new() { FundingSourceId = null, Percent = 0.6m, StartDate = new DateOnly(2025, 11, 1), EndDate = new DateOnly(2025, 11, 30) },
                    ],
                },
            ],
        });

    private static async Task<Projection> StoreCapturedPlanAsync(AppDbContext ctx)
    {
        var snapshot = CapturedSnapshot();
        var source = new Projection
        {
            CreationKey = Guid.NewGuid(), PiEmployeeId = "100", Name = "Stored source",
            SeededAt = snapshot.SeededAt, CreatedAt = snapshot.SeededAt,
            UpdatedAt = snapshot.SeededAt.AddDays(1), CreatedBy = "original-owner", UpdatedBy = "previous-editor",
            Content = snapshot.Content,
        };
        ctx.Projections.Add(source);
        await ctx.SaveChangesAsync();
        return source;
    }

    private static FakeProjectionDataSource UnavailableProjectionData() => new()
    {
        SeedResponse = Task.FromException<ProjectionSeedData>(new InvalidOperationException("Fresh data is unavailable")),
    };

    private static ProjectionSeedResponse SeedResponse(IActionResult result) =>
        result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<ProjectionSeedResponse>().Subject;

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
