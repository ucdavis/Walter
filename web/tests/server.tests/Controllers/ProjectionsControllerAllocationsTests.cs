using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Server.Controllers;
using Server.Tests;
using server.core.Domain;
using server.core.Models;

namespace server.tests.Controllers;

public sealed partial class ProjectionsControllerTests
{
    [Theory]
    [InlineData("negative-share")]
    [InlineData("share-over-one")]
    [InlineData("reversed-dates")]
    public async Task Create_save_and_duplicate_reject_invalid_individual_allocations(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var stored = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(stored);
        var draft = Draft(stored);
        var allocation = draft.Appointments.Single().Allocations[0];
        switch (invalid)
        {
            case "negative-share": allocation.Percent = -0.01m; break;
            case "share-over-one": allocation.Percent = 1.01m; break;
            case "reversed-dates": allocation.EndDate = allocation.StartDate!.Value.AddDays(-1); break;
        }
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var snapshot = new ProjectionDraft(draft.Name, draft.HistoryMonths, stored.SeededAt, draft.FundingSources, draft.Appointments);

        (await controller.Create(PiIam, new(snapshot, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(stored.Id, draft, default)).Should().BeOfType<BadRequestObjectResult>();
        JsonSerializer.Serialize(stored).Should().Be(before);
        ctx.ChangeTracker.HasChanges().Should().BeFalse();

        stored.Appointments = draft.Appointments;
        await ctx.SaveChangesAsync();
        (await controller.Duplicate(stored.Id, new("Invalid copy", Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        ctx.Projections.Should().ContainSingle();
    }

    [Fact]
    public async Task Zero_shares_duplicate_sources_overlaps_gaps_and_open_or_out_of_range_dates_round_trip_without_normalization()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var appointment = request.Draft!.Appointments.Single();
        appointment.Fte = 0;
        appointment.FeeRemissionMonthly = 500;
        appointment.HasUnmatchedFunding = true;
        appointment.Allocations =
        [
            new() { FundingSourceId = 41, Percent = 1, EndDate = new DateOnly(2025, 11, 15) },
            new() { FundingSourceId = 41, Percent = 0.75m, StartDate = new DateOnly(2025, 11, 1), EndDate = new DateOnly(2025, 11, 15) },
            new() { FundingSourceId = null, Percent = 0, StartDate = new DateOnly(2025, 11, 16), EndDate = new DateOnly(2025, 11, 16) },
            new() { FundingSourceId = null, Percent = 0.25m, StartDate = new DateOnly(2025, 11, 20), EndDate = new DateOnly(2025, 11, 30) },
            new() { FundingSourceId = 41, Percent = 1, StartDate = new DateOnly(2026, 1, 1) },
        ];
        var expected = JsonSerializer.Serialize(appointment.Allocations);
        var capturedSources = JsonSerializer.Serialize(request.Draft.FundingSources);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());

        var created = Document(await controller.Create(PiIam, request, default));
        var update = Draft(created);
        update.Appointments.Single().MonthlySalary = 7000;
        var saved = Document(await controller.Save(created.Id, update, default));
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(saved.Id, default));

        JsonSerializer.Serialize(reopened.Appointments.Single().Allocations).Should().Be(expected);
        JsonSerializer.Serialize(reopened.FundingSources).Should().Be(capturedSources);
        reopened.Appointments.Single().HasUnmatchedFunding.Should().BeTrue();
        reopened.Appointments.Single().Fte.Should().Be(0);
        reopened.Appointments.Single().FeeRemissionMonthly.Should().Be(500);
        var copy = Document(await controller.Duplicate(reopened.Id, new("Same funding", Guid.NewGuid()), default));
        JsonSerializer.Serialize(copy.Appointments.Single().Allocations).Should().Be(expected);

        var reviewed = Draft(reopened);
        reviewed.Appointments.Single().HasUnmatchedFunding = false;
        var acknowledged = Document(await controller.Save(reopened.Id, reviewed, default));
        acknowledged.Appointments.Single().HasUnmatchedFunding.Should().BeFalse();
        JsonSerializer.Serialize(acknowledged.Appointments.Single().Allocations).Should().Be(expected);
    }

    [Theory]
    [InlineData("negative-share")]
    [InlineData("share-over-one")]
    [InlineData("reversed-dates")]
    public async Task Reset_rejects_invalid_captured_allocations_without_changing_the_saved_plan(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var stored = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(stored);
        var key = stored.CreationKey;
        var line = new PositionBudgetRecord
        {
            EmployeeId = "E1", PositionNumber = "POS1", Name = "Imported person", ProjectId = "P1", Task = "T1",
            MonthlyRate = 5000, Fte = 1, DistributionPercent = 100,
            FundingEffectiveDate = new DateTime(2026, 1, 1), FundingEndDate = new DateTime(2026, 12, 31),
        };
        switch (invalid)
        {
            case "negative-share": line.DistributionPercent = -1; break;
            case "share-over-one": line.DistributionPercent = 101; break;
            case "reversed-dates": line.FundingEndDate = new DateTime(2025, 12, 31); break;
        }
        var controller = CreateController(ctx, financialViewer: true, dataSource: AppointmentData(line));

        (await controller.Reset(stored.Id, new(6, stored.UpdatedAt), default)).Should().BeOfType<BadRequestObjectResult>();

        stored.CreationKey.Should().Be(key);
        JsonSerializer.Serialize(stored).Should().Be(before);
        ctx.ChangeTracker.HasChanges().Should().BeFalse();
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(stored.Id, default));
        reopened.CreationKey.Should().Be(key);
        JsonSerializer.Serialize(reopened).Should().Be(before);
    }
}
