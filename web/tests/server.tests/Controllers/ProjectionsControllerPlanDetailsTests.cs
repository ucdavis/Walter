using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Server.Tests;
using server.core.Models;

namespace server.tests.Controllers;

public sealed partial class ProjectionsControllerTests
{
    [Fact]
    public async Task Null_content_is_rejected_before_create_or_save_mutates_the_plan()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var stored = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(stored);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var snapshot = new ProjectionDraft("Plan", stored.SeededAt, null!);

        (await controller.Create(PiIam, new(snapshot, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(stored.Id, Draft(stored) with { Content = null! }, default)).Should().BeOfType<BadRequestObjectResult>();
        JsonSerializer.Serialize(stored).Should().Be(before);
        ctx.ChangeTracker.HasChanges().Should().BeFalse();

        ctx.Projections.Should().ContainSingle();
    }

    [Theory]
    [InlineData("forecast-zero")]
    [InlineData("forecast-13")]
    [InlineData("forecast-negative")]
    [InlineData("notes-too-long")]
    [InlineData("name-too-long")]
    public async Task Plan_detail_validation_rejects_invalid_create_save_and_duplicate_inputs_before_mutation(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var stored = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(stored);
        var draft = Draft(stored);
        draft = invalid switch
        {
            "forecast-zero" => draft with { Content = draft.Content with { ForecastMonths = 0 } },
            "forecast-13" => draft with { Content = draft.Content with { ForecastMonths = 13 } },
            "forecast-negative" => draft with { Content = draft.Content with { ForecastMonths = -12 } },
            "notes-too-long" => draft with { Content = draft.Content with { Notes = new string('x', 2001) } },
            _ => draft with { Name = new string('x', 201) },
        };
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var snapshot = new ProjectionDraft(draft.Name, stored.SeededAt, draft.Content);

        (await controller.Create(PiIam, new(snapshot, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(stored.Id, draft, default)).Should().BeOfType<BadRequestObjectResult>();
        JsonSerializer.Serialize(stored).Should().Be(before);
        ctx.ChangeTracker.HasChanges().Should().BeFalse();

        stored.Content.ForecastMonths = draft.Content.ForecastMonths;
        stored.Content.Notes = draft.Content.Notes;
        await ctx.SaveChangesAsync();
        var copyName = invalid == "name-too-long" ? draft.Name : "Copy";
        (await controller.Duplicate(stored.Id, new(copyName, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        ctx.Projections.Should().ContainSingle();
    }

    [Fact]
    public async Task Plan_details_preserve_plain_text_and_captured_inputs_across_save_duplicate_and_stale_retry()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var created = await CreateProjectionAsync(ctx);
        var captured = JsonSerializer.Serialize(new { created.SeededAt, created.Content.FundingSources, created.Content.Appointments });
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var notes = "  <script>plain text, not markup</script>\nSecond line.  ";
        var originalDraft = Draft(created);
        var changed = originalDraft with { Name = new string('N', 200), Content = originalDraft.Content with { ForecastMonths = 18, Notes = notes } };
        var saved = Document(await controller.Save(created.Id, changed, default));
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(saved.Id, default));

        reopened.Name.Should().Be(changed.Name);
        reopened.Content.ForecastMonths.Should().Be(18);
        reopened.Content.Notes.Should().Be(notes);
        JsonSerializer.Serialize(new { reopened.SeededAt, reopened.Content.FundingSources, reopened.Content.Appointments }).Should().Be(captured);
        var copy = Document(await controller.Duplicate(reopened.Id, new("Alternative", Guid.NewGuid()), default));
        copy.Content.ForecastMonths.Should().Be(18);
        copy.Content.Notes.Should().Be(notes);

        var stale = originalDraft with { Content = originalDraft.Content with { ForecastMonths = 12, Notes = "Stale local notes" } };
        ConflictCode(await controller.Save(reopened.Id, stale, default)).Should().Be("conflict");
        reopened.Content.ForecastMonths.Should().Be(18);
        reopened.Content.Notes.Should().Be(notes);
        var overwritten = Document(await controller.Save(reopened.Id, stale with { Overwrite = true, Content = stale.Content with { Notes = new string('x', 2000) } }, default));
        overwritten.Content.ForecastMonths.Should().Be(12);
        overwritten.Content.Notes.Should().HaveLength(2000);
        var cleared = Document(await controller.Save(reopened.Id, Draft(overwritten) with { Content = overwritten.Content with { Notes = null } }, default));
        cleared.Content.Notes.Should().BeNull();
        copy.Content.Notes.Should().Be(notes);
    }

    [Theory]
    [InlineData(12, 9999, 1, true)]
    [InlineData(12, 9999, 2, false)]
    [InlineData(18, 9998, 7, true)]
    [InlineData(18, 9998, 8, false)]
    public async Task Plan_duration_must_fit_the_supported_calendar_without_being_clamped(int months, int year, int month, bool valid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var snapshot = new ProjectionDraft("Calendar limit", new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc), new() { ForecastMonths = months });
        var result = await CreateController(ctx, financialViewer: true).Create(PiIam, new(snapshot, Guid.NewGuid()), default);

        if (valid) Document(result).Content.ForecastMonths.Should().Be(months);
        else result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Reset_checks_retained_duration_against_the_new_capture_before_changing_the_plan()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var stored = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(stored);
        var controller = CreateController(ctx, financialViewer: true,
            timeProvider: new MutableTimeProvider(new DateTime(9998, 8, 1, 0, 0, 0, DateTimeKind.Utc)));

        (await controller.Reset(stored.Id, new(3, stored.UpdatedAt), default)).Should().BeOfType<BadRequestObjectResult>();

        JsonSerializer.Serialize(stored).Should().Be(before);
        ctx.ChangeTracker.HasChanges().Should().BeFalse();
    }
}
