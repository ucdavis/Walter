using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Server.Controllers;
using Server.Tests;
using server.core.Domain;
using server.core.Models;
using server.tests.Fakes;

namespace server.tests.Controllers;

public sealed partial class ProjectionsControllerTests
{
    [Fact]
    public async Task Setup_edits_save_reload_and_duplicate_preserve_original_staffing()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData { Projects = [new() { ProjectNumber = "P1", TaskNumber = "A", ProjectName = "Field study" }] },
            Personnel = [new() { EmployeeId = "E1", PositionNumber = "123", ProjectId = "P1", Task = "A",
                Fte = 1, MonthlyRate = 8000, DistributionPercent = 100 }],
        };
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);
        var draft = SeedResponse(await controller.Seed(PiIam, 3, default)).Draft;
        var appointment = draft.Content.Appointments.Single();
        appointment.MonthlySalary = 9000;
        appointment.Allocations.Single().Percent = 0.6m;
        var created = Document(await controller.Create(PiIam, new(draft, Guid.NewGuid()), default));
        var update = Draft(created);
        update.Content.Appointments.Single().MonthlySalary = 10000;
        update.Content.Comparison.Appointments.Clear();
        Document(await controller.Save(created.Id, update, default));
        ctx.ChangeTracker.Clear();
        var reloaded = Document(await controller.Get(created.Id, default));
        var copy = Document(await controller.Duplicate(created.Id, new("Alternative", Guid.NewGuid()), default));
        foreach (var plan in new[] { reloaded, copy })
        {
            var original = plan.Content.Comparison.Appointments.Single();
            original.MonthlySalary.Should().Be(8000);
            original.Allocations!.Single().Percent.Should().Be(1);
            plan.Content.LastAppointmentId.Should().BeGreaterThanOrEqualTo(original.Id);
            plan.Content.Appointments.Single().MonthlySalary.Should().Be(10000);
            plan.Content.Appointments.Single().Allocations.Single().Percent.Should().Be(0.6m);
            var json = JsonSerializer.SerializeToElement(plan.Content);
            var captured = json.GetProperty("Comparison").GetProperty("Appointments")[0];
            captured.TryGetProperty("EmployeeId", out _).Should().BeFalse();
            captured.TryGetProperty("HasUnmatchedFunding", out _).Should().BeFalse();
            captured.TryGetProperty("IsSeeded", out _).Should().BeFalse();
            captured.GetProperty("Name").GetString().Should().Be("Appointment 1");
            captured.GetProperty("PositionNumber").GetString().Should().Be("123");
            json.GetProperty("Appointments")[0].GetProperty("EmployeeId").GetString().Should().Be("E1");
            json.GetProperty("Appointments")[0].TryGetProperty("HasUnmatchedFunding", out _).Should().BeTrue();
        }
        data.Personnel[0].MonthlyRate = 11000;
        var reset = Document(await controller.Reset(created.Id, new(3, reloaded.UpdatedAt), default));
        reset.Content.Comparison.Appointments.Single().MonthlySalary.Should().Be(11000);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(true, true)]
    [InlineData(false, false)]
    [InlineData(false, true)]
    public async Task Create_and_save_reject_counters_below_live_or_captured_ids(bool appointment, bool capturedOnly)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = AppointmentData(new() { EmployeeId = "E1", PositionNumber = "POS1", Name = "Imported person", ProjectId = "P1", Task = "T1", MonthlyRate = 5000 });
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);
        var draft = SeedResponse(await controller.Seed(PiIam, 3, default)).Draft;
        var created = Document(await controller.Create(PiIam, new(draft, Guid.NewGuid()), default));
        var update = Draft(created);
        if (capturedOnly)
        {
            update.Content.Appointments.Clear();
            update.Content.FundingSources.Clear();
        }
        else
        {
            update.Content.Comparison.Appointments.Clear();
            update.Content.Comparison.FundingSources.Clear();
        }
        if (appointment)
            update.Content.LastAppointmentId = 0;
        else
            update.Content.LastFundingSourceId = 0;

        (await controller.Create(PiIam, new(draft with { Content = update.Content }, Guid.NewGuid()), default))
            .Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(created.Id, update, default)).Should().BeOfType<BadRequestObjectResult>();
    }

    [Theory]
    [InlineData("missing-salary")]
    [InlineData("negative-salary")]
    [InlineData("negative-fte")]
    [InlineData("fte-over-one")]
    [InlineData("negative-cbr")]
    [InlineData("cola-minus-one")]
    [InlineData("cola-below-minus-one")]
    [InlineData("month-zero")]
    [InlineData("month-thirteen")]
    [InlineData("negative-fee")]
    [InlineData("reversed-dates")]
    [InlineData("hire-missing-start")]
    [InlineData("hire-blank-name")]
    public async Task Create_and_save_reject_invalid_appointments_without_changing_saved_inputs(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var saved = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(saved);
        var draft = Draft(saved);
        var appointment = draft.Content.Appointments.Single();
        switch (invalid)
        {
            case "missing-salary": appointment.MonthlySalary = null; break;
            case "negative-salary": appointment.MonthlySalary = -0.01m; break;
            case "negative-fte": appointment.Fte = -0.01m; break;
            case "fte-over-one": appointment.Fte = 1.01m; break;
            case "negative-cbr": appointment.CbrRate = -0.01m; break;
            case "cola-minus-one": appointment.ColaRate = -1m; break;
            case "cola-below-minus-one": appointment.ColaRate = -1.01m; break;
            case "month-zero": appointment.ColaMonth = 0; break;
            case "month-thirteen": appointment.ColaMonth = 13; break;
            case "negative-fee": appointment.FeeRemissionMonthly = -0.01m; break;
            case "reversed-dates": appointment.EndDate = appointment.StartDate!.Value.AddDays(-1); break;
            case "hire-missing-start": appointment.StartDate = null; break;
            case "hire-blank-name": appointment.Name = " "; break;
        }
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());

        var snapshot = new ProjectionDraft(draft.Name, saved.SeededAt, draft.Content);
        (await controller.Create(PiIam, new(snapshot, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(saved.Id, draft, default)).Should().BeOfType<BadRequestObjectResult>();

        JsonSerializer.Serialize(saved).Should().Be(before);
        ctx.Projections.Should().ContainSingle();
        ctx.ChangeTracker.Clear();
        JsonSerializer.Serialize(Document(await controller.Get(saved.Id, default))).Should().Be(before);
    }

    [Fact]
    public async Task Zero_salary_and_rates_negative_cola_and_inclusive_date_endpoints_remain_editable()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var appointment = request.Draft!.Content.Appointments.Single();
        appointment.MonthlySalary = 0;
        appointment.Fte = 0;
        appointment.CbrRate = 0;
        appointment.ColaRate = -0.25m;
        appointment.ColaMonth = 1;
        appointment.FeeRemissionMonthly = 0;
        appointment.EndDate = appointment.StartDate;
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());

        var created = Document(await controller.Create(PiIam, request, default));
        created.Content.Appointments.Should().BeEquivalentTo(request.Draft.Content.Appointments);
        var update = Draft(created);
        var edited = update.Content.Appointments.Single();
        edited.Fte = 1;
        edited.ColaMonth = 12;
        edited.ColaRate = 1.5m;
        edited.CbrRate = 1.5m;
        edited.FeeRemissionMonthly = null;
        var saved = Document(await controller.Save(created.Id, update, default));
        ctx.ChangeTracker.Clear();

        Document(await controller.Get(saved.Id, default)).Content.Appointments.Should().BeEquivalentTo(update.Content.Appointments);
    }

    [Fact]
    public async Task Seed_keeps_missing_salary_visible_but_it_must_be_entered_or_the_appointment_removed_before_create()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = AppointmentData(new() { EmployeeId = "E1", PositionNumber = "POS1", Name = "Imported person", ProjectId = "P1", Task = "T1" });
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);

        var draft = SeedResponse(await controller.Seed(PiIam, 3, default)).Draft;
        var appointment = draft.Content.Appointments.Should().ContainSingle().Subject;
        appointment.MonthlySalary.Should().BeNull();
        appointment.StartDate.Should().BeNull();
        appointment.EndDate.Should().BeNull();
        (await controller.Create(PiIam, new(draft, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        ctx.Projections.Should().BeEmpty();

        appointment.MonthlySalary = 0;
        var created = Document(await controller.Create(PiIam, new(draft, Guid.NewGuid()), default));
        created.Content.Appointments.Single().MonthlySalary.Should().Be(0);
        created.Content.Appointments.Single().StartDate.Should().BeNull();
        var emptyRoster = draft with { Content = draft.Content with { Appointments = [] } };
        Document(await controller.Create(PiIam, new(emptyRoster, Guid.NewGuid()), default)).Content.Appointments.Should().BeEmpty();
    }

    [Fact]
    public async Task Duplicate_rejects_an_incomplete_stored_appointment_but_a_successful_retry_still_returns_its_existing_copy()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var source = await StoreCapturedPlanAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var request = new ProjectionsController.DuplicateProjectionRequest("Copy", Guid.NewGuid());
        var copy = Document(await controller.Duplicate(source.Id, request, default));
        source.Content.Appointments.Single().MonthlySalary = null;
        await ctx.SaveChangesAsync();

        (await controller.Duplicate(source.Id, request with { CreationKey = Guid.NewGuid() }, default)).Should().BeOfType<BadRequestObjectResult>();
        var retry = Document(await controller.Duplicate(source.Id, request, default));

        retry.Id.Should().Be(copy.Id);
        retry.Content.Appointments.Single().MonthlySalary.Should().Be(6500);
        ctx.Projections.Should().HaveCount(2);
    }

    [Theory]
    [InlineData("missing-salary")]
    [InlineData("unsplit")]
    [InlineData("negative-salary")]
    [InlineData("invalid-fte")]
    [InlineData("invalid-cbr")]
    [InlineData("reversed-dates")]
    public async Task Reset_rejects_incomplete_or_invalid_captured_appointments_without_changing_the_saved_plan(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var saved = await StoreCapturedPlanAsync(ctx);
        var key = saved.CreationKey;
        var before = JsonSerializer.Serialize(saved);
        var line = new PositionBudgetRecord
        {
            EmployeeId = "E1",
            PositionNumber = "POS1",
            Name = "Imported person",
            ProjectId = "P1",
            Task = "T1",
            MonthlyRate = 5000,
            Fte = 1,
            CompositeBenefitRate = 0.35m,
        };
        switch (invalid)
        {
            case "missing-salary": line.MonthlyRate = null; break;
            case "unsplit": line.EarnCodeStatus = "Unsplit"; break;
            case "negative-salary": line.MonthlyRate = -1; break;
            case "invalid-fte": line.Fte = 1.1m; break;
            case "invalid-cbr": line.CompositeBenefitRate = -0.1m; break;
            case "reversed-dates": line.JobEffectiveDate = new DateTime(2026, 2, 1); line.JobEndDate = new DateTime(2026, 1, 1); break;
        }
        var data = AppointmentData(line);
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);

        (await controller.Reset(saved.Id, new(6, saved.UpdatedAt), default)).Should().BeOfType<BadRequestObjectResult>();

        data.SnapshotAtUtc.Should().NotBeNull();
        data.PersonnelProjectNumbers.Should().ContainSingle().Which.Should().Be("P1");
        saved.CreationKey.Should().Be(key);
        JsonSerializer.Serialize(saved).Should().Be(before);
        ctx.ChangeTracker.HasChanges().Should().BeFalse();
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(saved.Id, default));
        reopened.CreationKey.Should().Be(key);
        JsonSerializer.Serialize(reopened).Should().Be(before);
    }

    private static FakeProjectionDataSource AppointmentData(PositionBudgetRecord appointment) => new()
    {
        Seed = new ProjectionSeedData
        {
            Projects = [new() { ProjectNumber = "P1", TaskNumber = "T1", ProjectName = "Project" }],
        },
        Personnel = [appointment],
    };
}
