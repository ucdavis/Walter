using FluentAssertions;
using server.core.Domain;
using Microsoft.EntityFrameworkCore;

namespace server.tests.Integration;

public sealed partial class ProjectionSqlServerTests
{
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
