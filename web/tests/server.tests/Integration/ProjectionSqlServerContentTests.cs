using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.TestHost;
using server.core.Domain;
using server.core.Models;
using server.Services;
using server.tests.Fakes;
using Microsoft.EntityFrameworkCore;
using Server.Controllers;

namespace server.tests.Integration;

public sealed partial class ProjectionSqlServerTests
{
    [ProjectionSqlServerFact]
    public async Task Comparison_keeps_the_original_dated_funding_share_through_create_save_reload_and_duplicate()
    {
        var data = new FakeProjectionDataSource
        {
            Seed = new() { Projects = [new() { ProjectNumber = "P1", TaskNumber = "T1", ProjectName = "Captured task" }] },
            Personnel =
            [
                new() { EmployeeId = "E1", PositionNumber = "1", Name = "Captured person", ProjectId = "P1", Task = "T1",
                    MonthlyRate = 10000.25m, Fte = 1, DistributionPercent = 12.345678901234m,
                    FundingEffectiveDate = new(2030, 2, 1), FundingEndDate = new(2030, 2, 15) },
                new() { EmployeeId = "E2", PositionNumber = "2", ProjectId = "P1", Task = "T1", EarnCodeStatus = "Unsplit" },
            ],
        };
        var capture = await new ProjectionSeeder(data, new FixedClock(Snapshot)).CaptureDraftAsync("100", 3, null, null, default);
        var draft = capture.Draft;
        draft.Content.Appointments.RemoveAll(a => a.PositionNumber == "2");
        var scenario = draft.Content.Appointments.Single();
        scenario.MonthlySalary = 11000m;
        scenario.Allocations.First(a => a.FundingSourceId == 1).Percent = 0.25m;

        using var host = CreateHttpHost();
        using var client = host.GetTestClient();
        using var create = await client.PostAsJsonAsync("/api/projections/by-iam/IAM-100",
            new ProjectionsController.CreateProjectionRequest(draft, Guid.NewGuid()));
        create.EnsureSuccessStatusCode();
        var created = (await create.Content.ReadFromJsonAsync<Projection>())!;
        var path = $"/api/projections/{created.Id}";

        var request = Draft(created, "Revised plan");
        request.Content.Comparison.Appointments.Clear();
        request.Content.Appointments.Single().MonthlySalary = 12000m;
        request.Content.Appointments.Single().Allocations.First(a => a.FundingSourceId == 1).Percent = 0.625m;
        using var update = await client.PutAsJsonAsync(path, request);
        update.EnsureSuccessStatusCode();
        var saved = (await update.Content.ReadFromJsonAsync<Projection>())!;
        var reloaded = (await client.GetFromJsonAsync<Projection>(path))!;
        using var duplicate = await client.PostAsJsonAsync($"{path}/duplicate",
            new ProjectionsController.DuplicateProjectionRequest("Alternative", Guid.NewGuid()));
        duplicate.EnsureSuccessStatusCode();
        var copy = (await duplicate.Content.ReadFromJsonAsync<Projection>())!;
        var reopenedCopy = (await client.GetFromJsonAsync<Projection>($"/api/projections/{copy.Id}"))!;

        foreach (var plan in new[] { created, saved, reloaded, reopenedCopy })
        {
            var original = plan.Content.Comparison.Appointments.Single(a => a.PositionNumber == "1");
            original.MonthlySalary.Should().Be(10000.25m);
            original.Allocations!.Single(a => a.FundingSourceId == 1).Should().BeEquivalentTo(new ProjectionFundingAllocation
            {
                FundingSourceId = 1,
                Percent = 0.12345678901234m,
                StartDate = new(2030, 2, 1),
                EndDate = new(2030, 2, 15),
            });
            plan.Content.Comparison.Appointments.Single(a => a.PositionNumber == "2").Allocations.Should().BeNull();
            plan.Content.Comparison.FundingSources.Should().ContainSingle().Which.TaskNumber.Should().Be("T1");
        }
        created.Content.Appointments.Single().MonthlySalary.Should().Be(11000m);
        foreach (var plan in new[] { reloaded, reopenedCopy })
        {
            plan.Content.Appointments.Single().MonthlySalary.Should().Be(12000m);
            plan.Content.Appointments.Single().Allocations.Single(a => a.FundingSourceId == 1).Percent.Should().Be(0.625m);
        }
    }

    [ProjectionSqlServerFact]
    public async Task Content_round_trips_and_tracks_in_place_nested_edits()
    {
        var original = await SeedAsync(18, "Original planning context");
        await using (var db = sql.CreateContext())
        {
            var loaded = await db.Projections.SingleAsync(p => p.Id == original.Id);
            loaded.Should().BeEquivalentTo(original);
            loaded.Content.FundingSources[0].CapturedAt.Kind.Should().Be(DateTimeKind.Utc);
            var columns = await db.Database.SqlQuery<string>($"SELECT [name] AS [Value] FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Projections')").ToListAsync();
            columns.Should().Contain("Content").And.NotContain(["HistoryMonths", "ForecastMonths", "Notes", "FundingSources", "Appointments"]);

            loaded.Content.Notes = "Updated planning context";
            loaded.Content.HistoryMonths = 6;
            loaded.Content.ForecastMonths = 12;
            loaded.Content.FundingSources[0].Actuals[0].Amount = -33.25m;
            loaded.Content.Appointments[0].Allocations.Add(new() { FundingSourceId = null, Percent = 0 });
            db.ChangeTracker.HasChanges().Should().BeTrue();
            await db.SaveChangesAsync();
        }

        await using var reopened = sql.CreateContext();
        var stored = await reopened.Projections.SingleAsync(p => p.Id == original.Id);
        stored.Content.Notes.Should().Be("Updated planning context");
        stored.Content.HistoryMonths.Should().Be(6);
        stored.Content.ForecastMonths.Should().Be(12);
        stored.Content.FundingSources[0].Actuals[0].Amount.Should().Be(-33.25m);
        var allocation = stored.Content.Appointments[0].Allocations.Should().ContainSingle().Subject;
        allocation.FundingSourceId.Should().BeNull();
        allocation.Percent.Should().Be(0);
        stored.Should().BeEquivalentTo(new
        {
            original.Id,
            original.CreationKey,
            original.PiEmployeeId,
            original.Name,
            original.SeededAt,
            original.CreatedAt,
            original.CreatedBy,
            original.UpdatedAt,
            original.UpdatedBy,
        });
    }
    [ProjectionSqlServerFact]
    public async Task Category_budget_definitions_and_deltas_round_trip_as_typed_json()
    {
        var original = await SeedAsync();
        await using (var db = sql.CreateContext())
        {
            var loaded = await db.Projections.SingleAsync(p => p.Id == original.Id);
            loaded.Content.FundingSources[0].CategoryAdjustments = [new() { ExpenditureCategory = "01 - Salaries and Wages", Amount = -12.34m }, new() { ExpenditureCategory = "02 - Fringe Benefits", Amount = 12.34m }];
            loaded.Content.FundingSources.Add(new() { Id = 2, Name = "Planned pool", SourceKind = ProjectionSourceKind.Planned, PlannedBudgetMode = ProjectionPlannedBudgetMode.GeneralPool, InitialPlannedBalance = 5000, BalanceAdjustment = -500, CapturedAt = original.SeededAt, StartDate = new(2026, 1, 1) });
            loaded.Content.FundingSources.Add(new() { Id = 3, Name = "Planned categories", SourceKind = ProjectionSourceKind.Planned, PlannedBudgetMode = ProjectionPlannedBudgetMode.Categories, CapturedAt = original.SeededAt, StartDate = new(2026, 1, 1), Budgets = [new() { ExpenditureCategory = "01 - Salaries and Wages", Budget = 1000 }], CategoryAdjustments = [new() { ExpenditureCategory = "02 - Fringe Benefits", Amount = 0 }] });
            await db.SaveChangesAsync();
        }
        await using (var reopened = sql.CreateContext())
        {
            var stored = await reopened.Projections.SingleAsync(p => p.Id == original.Id);
            stored.Content.FundingSources[0].CategoryAdjustments.Select(row => row.Amount).Should().Equal(-12.34m, 12.34m);
            stored.Content.FundingSources[1].Should().BeEquivalentTo(new { PlannedBudgetMode = ProjectionPlannedBudgetMode.GeneralPool, InitialPlannedBalance = 5000m, BalanceAdjustment = -500m });
            stored.Content.FundingSources[2].PlannedBudgetMode.Should().Be(ProjectionPlannedBudgetMode.Categories);
            stored.Content.FundingSources[2].Budgets.Should().ContainSingle().Which.Budget.Should().Be(1000);
            stored.Content.FundingSources[2].CategoryAdjustments.Should().ContainSingle().Which.Amount.Should().Be(0);
            stored.Content.FundingSources[2].CategoryAdjustments[0].Amount = 125.50m;
            reopened.ChangeTracker.HasChanges().Should().BeTrue();
            await reopened.SaveChangesAsync();
        }
        await using var final = sql.CreateContext();
        var updated = await final.Projections.SingleAsync(p => p.Id == original.Id);
        updated.Content.FundingSources[2].CategoryAdjustments[0].Amount.Should().Be(125.50m);
        updated.Content.FundingSources[2].Budgets[0].Budget.Should().Be(1000);
    }
}
