using FluentAssertions;
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
            original.Id, original.CreationKey, original.PiEmployeeId, original.Name,
            original.SeededAt, original.CreatedAt, original.CreatedBy, original.UpdatedAt, original.UpdatedBy,
        });
    }
}
