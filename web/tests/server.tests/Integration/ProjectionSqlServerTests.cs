using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Server.Controllers;
using Server.Services;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.Helpers;
using server.Services;
using server.tests.Fakes;

namespace server.tests.Integration;

[Trait("Category", "SqlServer")]
public sealed class ProjectionSqlServerTests(ProjectionSqlServerFixture sql) : IClassFixture<ProjectionSqlServerFixture>
{
    private static readonly DateTime Snapshot = new(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Version = Snapshot.AddMonths(1).AddTicks(1234567);

    [ProjectionSqlServerTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Concurrent_creation_retries_return_one_saved_plan(bool duplicate)
    {
        var source = await SeedAsync();
        var key = Guid.NewGuid();
        var bothReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var arrivals = 0;
        var barrier = new BeforeWrite(async () =>
        {
            if (Interlocked.Increment(ref arrivals) == 2) bothReady.TrySetResult();
            await bothReady.Task.WaitAsync(TimeSpan.FromSeconds(15));
        }, once: false);
        await using var first = sql.CreateContext(barrier);
        await using var second = sql.CreateContext(barrier);
        var snapshot = new ProjectionDraft(source.Name, source.HistoryMonths, source.SeededAt, source.FundingSources, source.Appointments);

        var results = await Task.WhenAll(
            duplicate
                ? Controller(first).Duplicate(source.Id, new("First copy", key), default)
                : Controller(first).Create("IAM-100", new(snapshot with { Name = "First copy" }, key), default),
            duplicate
                ? Controller(second).Duplicate(source.Id, new("Second copy", key), default)
                : Controller(second).Create("IAM-100", new(snapshot with { Name = "Second copy" }, key), default));

        var saved = results.Select(result => result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeOfType<Projection>().Subject).ToArray();
        saved[0].Id.Should().Be(saved[1].Id).And.NotBe(source.Id);
        saved[0].Name.Should().Be(saved[1].Name).And.BeOneOf("First copy", "Second copy");
        await using var check = sql.CreateContext();
        var created = await check.Projections.SingleAsync(p => p.PiEmployeeId == "100" && p.CreationKey == key);
        created.Id.Should().Be(saved[0].Id);
        created.SeededAt.Should().Be(source.SeededAt);
        created.FundingSources.Should().BeEquivalentTo(source.FundingSources);
        created.Appointments.Should().BeEquivalentTo(source.Appointments);
        (await check.Projections.SingleAsync(p => p.Id == source.Id)).Name.Should().Be("Original");
    }

    [ProjectionSqlServerFact]
    public async Task Creation_key_index_scopes_retries_to_the_pi()
    {
        var key = Guid.NewGuid();
        await using var db = sql.CreateContext();
        db.Projections.AddRange(
            new Projection { Name = "PI one", PiEmployeeId = "100", CreationKey = key },
            new Projection { Name = "PI two", PiEmployeeId = "200", CreationKey = key });

        await db.SaveChangesAsync();

        (await db.Projections.CountAsync(p => p.CreationKey == key)).Should().Be(2);
    }

    [ProjectionSqlServerFact]
    public async Task Required_creation_keys_cannot_be_cleared_or_defaulted()
    {
        var original = await SeedAsync();
        await using var db = sql.CreateContext();
        var clear = () => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE [Projections] SET [CreationKey] = NULL WHERE [Id] = {original.Id}");
        var useDefault = () => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE [Projections] SET [CreationKey] = DEFAULT WHERE [Id] = {original.Id}");

        (await clear.Should().ThrowAsync<SqlException>()).Which.Number.Should().Be(515);
        (await useDefault.Should().ThrowAsync<SqlException>()).Which.Number.Should().Be(515);

        (await db.Projections.SingleAsync(p => p.Id == original.Id)).CreationKey.Should().Be(original.CreationKey);
    }

    [ProjectionSqlServerFact]
    public async Task Seed_procedure_requires_the_callers_snapshot_without_a_database_clock_fallback()
    {
        await using var db = sql.CreateContext();
        // SQL Server defers resolution of the datamart tables; these rejected calls must never reach them.
        var procedure = string.Join("\n", (await File.ReadAllLinesAsync(Path.Combine(AppContext.BaseDirectory, "Sql", "usp_GetProjectionSeed.sql")))
            .Where(line => !line.Trim().Equals("GO", StringComparison.OrdinalIgnoreCase)));
        await db.Database.ExecuteSqlRawAsync(procedure);
        try
        {
            var omitted = () => db.Database.ExecuteSqlRawAsync("EXEC dbo.usp_GetProjectionSeed @PiEmployeeId = 'PI';");
            var explicitNull = () => db.Database.ExecuteSqlRawAsync("EXEC dbo.usp_GetProjectionSeed @PiEmployeeId = 'PI', @SnapshotAt = NULL;");

            (await omitted.Should().ThrowAsync<SqlException>()).Which.Number.Should().Be(201);
            (await explicitNull.Should().ThrowAsync<SqlException>()).Which.Number.Should().Be(50001);
        }
        finally
        {
            await db.Database.ExecuteSqlRawAsync("DROP PROCEDURE dbo.usp_GetProjectionSeed;");
        }
    }

    [ProjectionSqlServerFact]
    public async Task Http_save_round_trips_exact_tokens_and_preserves_the_captured_snapshot()
    {
        var original = await SeedAsync();
        using var host = CreateHttpHost();
        using var client = host.GetTestClient();
        var document = await client.GetFromJsonAsync<JsonObject>($"/api/projections/{original.Id}");
        var updatedAt = document!["updatedAt"]!.GetValue<string>();
        var seededAt = document["seededAt"]!.GetValue<string>();
        updatedAt.Should().Be("2030-02-01T00:00:00.1234567Z");
        seededAt.Should().Be("2030-01-01T00:00:00Z");
        var body = JsonSerializer.SerializeToNode(Draft(original, "Saved through HTTP"), new JsonSerializerOptions(JsonSerializerDefaults.Web))!.AsObject();
        body["expectedUpdatedAt"] = updatedAt;
        body["expectedSeededAt"] = seededAt;
        var capturedAt = Snapshot.AddMonths(1).AddTicks(-1);
        var source = body["fundingSources"]![0]!;
        source["name"] = "Edited source label";
        source["sourceKind"] = "Task";
        source["projectNumber"] = "P1";
        source["taskNumber"] = "T1";
        source["capturedAt"] = capturedAt;
        source["balanceAdjustment"] = -125.50m;
        source["capturedStartDate"] = "2029-01-01";
        source["startDate"] = "2029-03-01";
        body["appointments"]![0]!["hasUnmatchedFunding"] = true;
        body["appointments"]![0]!["allocations"] = JsonSerializer.SerializeToNode(new List<ProjectionFundingAllocation>
        {
            new() { FundingSourceId = 1, Percent = 0.4m, StartDate = new(2030, 2, 1), EndDate = new(2030, 2, 15) },
            new() { FundingSourceId = null, Percent = 0.3m },
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        using var response = await client.PutAsJsonAsync($"/api/projections/{original.Id}", body);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var saved = (await response.Content.ReadFromJsonAsync<Projection>())!;
        saved.UpdatedAt.Kind.Should().Be(DateTimeKind.Utc);
        saved.UpdatedAt.Should().BeAfter(original.UpdatedAt);
        saved.SeededAt.Should().Be(original.SeededAt);
        saved.FundingSources[0].Actuals.Should().BeEquivalentTo(original.FundingSources[0].Actuals);

        using var stale = await client.PutAsJsonAsync($"/api/projections/{original.Id}", body);
        stale.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await stale.Content.ReadFromJsonAsync<ProjectionsController.ProjectionConflict>())!.Code.Should().Be("conflict");
        await using var check = sql.CreateContext();
        var stored = await check.Projections.SingleAsync(p => p.Id == original.Id);
        stored.UpdatedAt.Ticks.Should().Be(saved.UpdatedAt.Ticks);
        stored.Name.Should().Be("Saved through HTTP");
        stored.FundingSources[0].Name.Should().Be("Edited source label");
        stored.FundingSources[0].ProjectName.Should().Be("Project");
        stored.FundingSources[0].SourceKind.Should().Be(ProjectionSourceKind.Task);
        stored.FundingSources[0].CapturedAt.Should().Be(capturedAt);
        stored.FundingSources[0].CapturedAt.Kind.Should().Be(DateTimeKind.Utc);
        stored.FundingSources[0].BalanceAdjustment.Should().Be(-125.50m);
        stored.FundingSources[0].CapturedStartDate.Should().Be(new DateOnly(2029, 1, 1));
        stored.FundingSources[0].StartDate.Should().Be(new DateOnly(2029, 3, 1));
        stored.Appointments[0].HasUnmatchedFunding.Should().BeTrue();
        stored.Appointments[0].Allocations.Should().BeEquivalentTo(new List<ProjectionFundingAllocation>
        {
            new() { FundingSourceId = 1, Percent = 0.4m, StartDate = new(2030, 2, 1), EndDate = new(2030, 2, 15) },
            new() { FundingSourceId = null, Percent = 0.3m },
        });
    }

    [ProjectionSqlServerFact]
    public async Task Two_writers_using_the_same_version_cannot_both_save()
    {
        var original = await SeedAsync();
        var bothReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var arrivals = 0;
        var barrier = new BeforeWrite(async () =>
        {
            if (Interlocked.Increment(ref arrivals) == 2) bothReady.TrySetResult();
            await bothReady.Task.WaitAsync(TimeSpan.FromSeconds(15));
        }, once: false);
        await using var first = sql.CreateContext(barrier);
        await using var second = sql.CreateContext(barrier);

        var results = await Task.WhenAll(
            Controller(first).Save(original.Id, Draft(original, "First writer"), default),
            Controller(second).Save(original.Id, Draft(original, "Second writer"), default));

        results.Should().ContainSingle(result => result is OkObjectResult);
        results.Should().ContainSingle(result => result is ConflictObjectResult);
        await using var check = sql.CreateContext();
        var winner = await check.Projections.SingleAsync(p => p.Id == original.Id);
        winner.Name.Should().BeOneOf("First writer", "Second writer");
        winner.UpdatedAt.Should().BeAfter(original.UpdatedAt);
    }

    [ProjectionSqlServerFact]
    public async Task Confirmed_overwrite_retries_an_ordinary_edit_that_wins_the_database_race()
    {
        var original = await SeedAsync();
        var race = new BeforeWrite(async () =>
        {
            await using var competing = sql.CreateContext();
            var latest = await competing.Projections.SingleAsync(p => p.Id == original.Id);
            (await Controller(competing).Save(latest.Id, Draft(latest, "Intervening edit"), default))
                .Should().BeOfType<OkObjectResult>();
        });
        await using var writer = sql.CreateContext(race);

        var result = await Controller(writer).Save(original.Id, Draft(original, "Confirmed replacement", overwrite: true), default);

        result.Should().BeOfType<OkObjectResult>();
        race.Executions.Should().Be(1);
        await using var check = sql.CreateContext();
        (await check.Projections.SingleAsync(p => p.Id == original.Id)).Name.Should().Be("Confirmed replacement");
    }

    [ProjectionSqlServerTheory]
    [InlineData("edit")]
    [InlineData("reset")]
    [InlineData("delete")]
    public async Task Overwrite_retry_exhaustion_preserves_the_latest_write_and_rechecks_snapshot_existence(string finalChange)
    {
        var original = await SeedAsync();
        var attempt = 0;
        var race = new BeforeWrite(async () =>
        {
            attempt++;
            await using var competing = sql.CreateContext();
            var latest = await competing.Projections.SingleAsync(p => p.Id == original.Id);
            var controller = Controller(competing);
            if (attempt == 3 && finalChange == "delete")
                (await controller.Delete(latest.Id, latest.UpdatedAt, default)).Should().BeOfType<NoContentResult>();
            else if (attempt == 3 && finalChange == "reset")
                (await controller.Reset(latest.Id, new(3, latest.UpdatedAt), default)).Should().BeOfType<OkObjectResult>();
            else
                (await controller.Save(latest.Id, Draft(latest, $"Concurrent edit {attempt}"), default)).Should().BeOfType<OkObjectResult>();
        }, once: false);
        await using var writer = sql.CreateContext(race);

        var result = await Controller(writer).Save(original.Id, Draft(original, "Must not be saved", overwrite: true), default);

        race.Executions.Should().Be(3);
        await using var check = sql.CreateContext();
        var stored = await check.Projections.SingleOrDefaultAsync(p => p.Id == original.Id);
        if (finalChange == "delete")
        {
            result.Should().BeOfType<NotFoundResult>();
            stored.Should().BeNull();
            return;
        }
        var response = result.Should().BeAssignableTo<ObjectResult>().Subject;
        response.StatusCode.Should().Be(finalChange == "reset" ? 409 : 503);
        response.Value.Should().BeOfType<ProjectionsController.ProjectionConflict>().Which.Code
            .Should().Be(finalChange == "reset" ? "snapshotChanged" : "busy");
        stored!.Name.Should().Be(finalChange == "reset" ? "Concurrent edit 2" : "Concurrent edit 3");
    }

    [ProjectionSqlServerTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Confirmed_overwrite_cannot_cross_a_reset_or_deletion_during_its_write(bool delete)
    {
        var original = await SeedAsync();
        var race = new BeforeWrite(async () =>
        {
            await using var competing = sql.CreateContext();
            var latest = await competing.Projections.SingleAsync(p => p.Id == original.Id);
            var controller = Controller(competing);
            if (delete)
                (await controller.Delete(latest.Id, latest.UpdatedAt, default)).Should().BeOfType<NoContentResult>();
            else
                (await controller.Reset(latest.Id, new(3, latest.UpdatedAt), default)).Should().BeOfType<OkObjectResult>();
        });
        await using var writer = sql.CreateContext(race);

        var result = await Controller(writer).Save(original.Id, Draft(original, "Must not be saved", overwrite: true), default);

        race.Executions.Should().Be(1);
        await using var check = sql.CreateContext();
        var stored = await check.Projections.SingleOrDefaultAsync(p => p.Id == original.Id);
        if (delete)
        {
            result.Should().BeOfType<NotFoundResult>();
            stored.Should().BeNull();
        }
        else
        {
            result.Should().BeOfType<ConflictObjectResult>().Which.Value.Should()
                .BeOfType<ProjectionsController.ProjectionConflict>().Which.Code.Should().Be("snapshotChanged");
            stored!.SeededAt.Should().BeAfter(original.SeededAt);
            stored.Name.Should().Be(original.Name);
        }
    }

    [ProjectionSqlServerTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Reset_and_delete_cannot_discard_a_write_that_arrives_after_the_version_check(bool delete)
    {
        var original = await SeedAsync();
        var race = new BeforeWrite(async () =>
        {
            await using var competing = sql.CreateContext();
            var latest = await competing.Projections.SingleAsync(p => p.Id == original.Id);
            (await Controller(competing).Save(latest.Id, Draft(latest, "Preserved concurrent save"), default))
                .Should().BeOfType<OkObjectResult>();
        });
        await using var writer = sql.CreateContext(race);
        var controller = Controller(writer);

        var result = delete
            ? await controller.Delete(original.Id, original.UpdatedAt, default)
            : await controller.Reset(original.Id, new(3, original.UpdatedAt), default);

        result.Should().BeOfType<ConflictObjectResult>();
        race.Executions.Should().Be(1);
        await using var check = sql.CreateContext();
        var stored = await check.Projections.SingleAsync(p => p.Id == original.Id);
        stored.Name.Should().Be("Preserved concurrent save");
        stored.SeededAt.Should().Be(original.SeededAt);
    }

    [ProjectionSqlServerFact]
    public async Task Frozen_or_backward_clocks_still_produce_distinct_persisted_tokens()
    {
        var original = await SeedAsync();
        var clock = new FixedClock(Snapshot.AddYears(-1));
        await using var db = sql.CreateContext();
        var controller = Controller(db, clock);
        var first = (Projection)((OkObjectResult)await controller.Save(original.Id, Draft(original, "First"), default)).Value!;
        var firstVersion = first.UpdatedAt;
        var second = (Projection)((OkObjectResult)await controller.Save(original.Id, Draft(first, "Second"), default)).Value!;
        second.UpdatedAt.Ticks.Should().Be(firstVersion.Ticks + 1);
        var reset = (Projection)((OkObjectResult)await controller.Reset(original.Id, new(3, second.UpdatedAt), default)).Value!;
        reset.SeededAt.Ticks.Should().Be(original.SeededAt.Ticks + 1);
        await using var check = sql.CreateContext();
        var stored = await check.Projections.SingleAsync(p => p.Id == original.Id);
        stored.UpdatedAt.Ticks.Should().Be(original.UpdatedAt.Ticks + 3);
        stored.SeededAt.Kind.Should().Be(DateTimeKind.Utc);
    }

    [ProjectionSqlServerFact]
    public async Task Http_requires_body_and_query_tokens_and_binds_exact_delete_timestamp()
    {
        var original = await SeedAsync();
        using var host = CreateHttpHost();
        using var client = host.GetTestClient();
        var body = JsonSerializer.SerializeToNode(Draft(original, "Missing tokens"), new JsonSerializerOptions(JsonSerializerDefaults.Web))!.AsObject();
        body.Remove("expectedUpdatedAt");
        body.Remove("expectedSeededAt");
        using var save = await client.PutAsJsonAsync($"/api/projections/{original.Id}", body);
        save.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var reset = await client.PostAsJsonAsync($"/api/projections/{original.Id}/reset", new { historyMonths = 3 });
        reset.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var missingDelete = await client.DeleteAsync($"/api/projections/{original.Id}");
        missingDelete.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var invalidDelete = await client.DeleteAsync($"/api/projections/{original.Id}?expectedUpdatedAt=not-a-date");
        invalidDelete.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var delete = await client.DeleteAsync($"/api/projections/{original.Id}?expectedUpdatedAt={Uri.EscapeDataString(original.UpdatedAt.ToString("O"))}");
        delete.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    private async Task<Projection> SeedAsync()
    {
        var plan = new Projection
        {
            CreationKey = Guid.NewGuid(),
            Name = "Original",
            PiEmployeeId = "100",
            HistoryMonths = 3,
            CreatedAt = Snapshot,
            SeededAt = Snapshot,
            UpdatedAt = Version,
            CreatedBy = "owner",
            UpdatedBy = "owner",
            FundingSources = [new() { Id = 1, Name = "Source", SourceKind = ProjectionSourceKind.Task, CapturedAt = Snapshot, ProjectNumber = "P1", TaskNumber = "T1", ProjectName = "Project", Actuals = [new() { Month = new(2029, 12, 1), Amount = 2500, ExpenditureCategory = "Salary" }] }],
            Appointments = [new() { Id = 1, Name = "Example", IsSeeded = true, MonthlySalary = 10000, Fte = 0.5m }],
        };
        await using var db = sql.CreateContext();
        db.Projections.Add(plan);
        await db.SaveChangesAsync();
        return plan;
    }

    private static ProjectionsController.SaveProjectionRequest Draft(Projection plan, string name, bool overwrite = false)
    {
        var copy = JsonSerializer.Deserialize<Projection>(JsonSerializer.Serialize(plan))!;
        return new(name, copy.HistoryMonths, copy.FundingSources, copy.Appointments, copy.UpdatedAt, copy.SeededAt, overwrite);
    }

    private static ClaimsPrincipal Viewer() => new(new ClaimsIdentity(
        [new Claim("kerberos", "sql-tester"), new Claim(ClaimTypes.Role, Role.Names.FinancialViewer)], "Test"));

    private static ProjectionsController Controller(AppDbContext db, TimeProvider? clock = null)
    {
        var data = new FakeProjectionDataSource();
        var services = new ServiceCollection().AddLogging().AddAuthorizationPolicies().BuildServiceProvider();
        return new ProjectionsController(db, new FakeDatamartService(new SearchablePersonRecord { IamId = "IAM-100", EmployeeId = "100", Name = "PI" }), services.GetRequiredService<IAuthorizationService>(),
            new UserService(NullLogger<UserService>.Instance, db),
            new PpmPortfolioService(new FakeFinancialApiService([], null, []), new FakePpmPortfolioReader([]),
                Options.Create(new FeatureFlagOptions { UseGraphQLAPI = false })),
            new ProjectionSeeder(data, clock), data, clock)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Viewer() } },
        };
    }

    private IHost CreateHttpHost() => new HostBuilder().ConfigureWebHost(builder => builder.UseTestServer()
        .ConfigureServices(services =>
        {
            services.AddLogging();
            services.AddAuthorizationPolicies();
            services.AddDbContext<AppDbContext>(options => options.UseSqlServer(sql.ConnectionString));
            services.AddControllers().AddApplicationPart(typeof(ProjectionsController).Assembly).AddControllersAsServices();
            services.AddScoped(provider => Controller(provider.GetRequiredService<AppDbContext>()));
        })
        .Configure(app =>
        {
            app.UseRouting();
            app.Use((context, next) => { context.User = Viewer(); return next(context); });
            app.UseAuthorization();
            app.UseEndpoints(endpoints => endpoints.MapControllers());
        })).Start();

    private sealed class FixedClock(DateTime now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(now);
    }

    /// <summary>Places a real competing transaction between the controller's load and atomic SQL write.</summary>
    private sealed class BeforeWrite(Func<Task> action, bool once = true) : SaveChangesInterceptor
    {
        private int calls;
        public int Executions { get; private set; }
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (!once || Interlocked.Increment(ref calls) == 1)
            {
                Executions++;
                await action();
            }
            return result;
        }
    }
}
