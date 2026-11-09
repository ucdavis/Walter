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
        var appointment = draft.Appointments.Single();
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

        var snapshot = new ProjectionDraft(draft.Name, draft.HistoryMonths, saved.SeededAt, draft.FundingSources, draft.Appointments);
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
        var appointment = request.Draft!.Appointments.Single();
        appointment.MonthlySalary = 0;
        appointment.Fte = 0;
        appointment.CbrRate = 0;
        appointment.ColaRate = -0.25m;
        appointment.ColaMonth = 1;
        appointment.FeeRemissionMonthly = 0;
        appointment.EndDate = appointment.StartDate;
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());

        var created = Document(await controller.Create(PiIam, request, default));
        created.Appointments.Should().BeEquivalentTo(request.Draft.Appointments);
        var update = Draft(created);
        var edited = update.Appointments.Single();
        edited.Fte = 1;
        edited.ColaMonth = 12;
        edited.ColaRate = 1.5m;
        edited.CbrRate = 1.5m;
        edited.FeeRemissionMonthly = null;
        var saved = Document(await controller.Save(created.Id, update, default));
        ctx.ChangeTracker.Clear();

        Document(await controller.Get(saved.Id, default)).Appointments.Should().BeEquivalentTo(update.Appointments);
    }

    [Fact]
    public async Task Seed_keeps_missing_salary_visible_but_it_must_be_entered_or_the_appointment_removed_before_create()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = AppointmentData(new() { EmployeeId = "E1", PositionNumber = "POS1", Name = "Imported person", ProjectId = "P1", Task = "T1" });
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);

        var draft = SeedResponse(await controller.Seed(PiIam, 3, default)).Draft;
        var appointment = draft.Appointments.Should().ContainSingle().Subject;
        appointment.MonthlySalary.Should().BeNull();
        appointment.StartDate.Should().BeNull();
        appointment.EndDate.Should().BeNull();
        (await controller.Create(PiIam, new(draft, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        ctx.Projections.Should().BeEmpty();

        appointment.MonthlySalary = 0;
        var created = Document(await controller.Create(PiIam, new(draft, Guid.NewGuid()), default));
        created.Appointments.Single().MonthlySalary.Should().Be(0);
        created.Appointments.Single().StartDate.Should().BeNull();
        var emptyRoster = draft with { Appointments = [] };
        Document(await controller.Create(PiIam, new(emptyRoster, Guid.NewGuid()), default)).Appointments.Should().BeEmpty();
    }

    [Fact]
    public async Task Duplicate_rejects_an_incomplete_stored_appointment_but_a_successful_retry_still_returns_its_existing_copy()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var source = await StoreCapturedPlanAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var request = new ProjectionsController.DuplicateProjectionRequest("Copy", Guid.NewGuid());
        var copy = Document(await controller.Duplicate(source.Id, request, default));
        source.Appointments.Single().MonthlySalary = null;
        await ctx.SaveChangesAsync();

        (await controller.Duplicate(source.Id, request with { CreationKey = Guid.NewGuid() }, default)).Should().BeOfType<BadRequestObjectResult>();
        var retry = Document(await controller.Duplicate(source.Id, request, default));

        retry.Id.Should().Be(copy.Id);
        retry.Appointments.Single().MonthlySalary.Should().Be(6500);
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
            EmployeeId = "E1", PositionNumber = "POS1", Name = "Imported person", ProjectId = "P1", Task = "T1",
            MonthlyRate = 5000, Fte = 1, CompositeBenefitRate = 0.35m,
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
