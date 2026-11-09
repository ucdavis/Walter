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
    private static readonly DateTime SourceCapture = new DateTime(2026, 12, 1, 0, 0, 0, DateTimeKind.Utc).AddTicks(-1);

    private static FakeProjectionDataSource SourceData() => new()
    {
        Seed = new ProjectionSeedData
        {
            Projects =
            [
                new() { ProjectNumber = "P1", TaskNumber = "T1", TaskName = "First", ProjectName = "Project", ProjectType = "Internal", StartDate = new(2026, 1, 2), EndDate = new(2027, 6, 30) },
                new() { ProjectNumber = "P1", TaskNumber = "T2", TaskName = "Second", ProjectName = "Project", ProjectType = "Internal" },
                new() { ProjectNumber = "P1", TaskNumber = "T3", ProjectType = "Internal", TaskStatus = "Inactive" },
            ],
            Budgets =
            [
                new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, Budget = 1000, SpentToDate = 300, Committed = 100 },
                new() { ProjectNumber = "P1", TaskNumber = "T2", ExpenditureCategory = Supplies, Budget = 9000 },
            ],
            Actuals = [new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, Month = new(2026, 11, 1), Amount = 75 }],
            RunRates =
            [
                new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, HistoryMonths = 3, MonthlyAmount = 50 },
                new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, HistoryMonths = 6, MonthlyAmount = 40 },
            ],
        },
        Personnel = [new() { EmployeeId = "E1", PositionNumber = "X1", ProjectId = "P1", Task = "T1", DistributionPercent = 100 }],
    };

    [Fact]
    public async Task Source_catalog_returns_eligible_task_keys_without_personnel_or_saved_rows()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = SourceData();
        var controller = CreateController(ctx, employeeId: "200", dataSource: data, timeProvider: new MutableTimeProvider(SourceCapture));

        var result = (OkObjectResult)await controller.Sources(PiIam, default);

        var sources = (List<ProjectionsController.ProjectionSourceSummary>)result.Value!;
        sources.Select(s => (s.ProjectNumber, s.TaskNumber, s.TaskName)).Should().Equal(
            ("P1", "T1", "First"), ("P1", "T2", "Second"));
        data.PersonnelProjectNumbers.Should().BeNull();
        ctx.Projections.Should().BeEmpty();
    }

    [Fact]
    public async Task Source_import_captures_selected_financials_only_and_preserves_an_existing_plan()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var saved = await CreateProjectionAsync(ctx);
        var before = JsonSerializer.Serialize(saved);
        var data = SourceData();
        var original = JsonSerializer.Serialize(data.Seed);
        var controller = CreateController(ctx, financialViewer: true, dataSource: data, timeProvider: new MutableTimeProvider(SourceCapture));

        var result = (OkObjectResult)await controller.ImportSources(PiIam, new(6, [new("P1", "T1")]), default);

        var source = ((List<ProjectionFundingSource>)result.Value!).Should().ContainSingle().Subject;
        source.Should().BeEquivalentTo(new
        {
            ProjectNumber = "P1", TaskNumber = "T1", SourceKind = ProjectionSourceKind.Task,
            CapturedAt = SourceCapture, CapturedStartDate = (DateOnly?)new DateOnly(2026, 1, 2),
            CapturedEndDate = (DateOnly?)new DateOnly(2027, 6, 30), BalanceAdjustment = 0m,
        });
        source.Budgets.Should().ContainSingle().Which.Budget.Should().Be(1000);
        source.Actuals.Should().ContainSingle().Which.Amount.Should().Be(75);
        source.Expenses.Should().ContainSingle().Which.Amount.Should().Be(40);
        data.SnapshotAtUtc.Should().Be(SourceCapture);
        data.PersonnelProjectNumbers.Should().BeNull();
        ctx.Projections.Should().ContainSingle();
        JsonSerializer.Serialize(saved).Should().Be(before);
        JsonSerializer.Serialize(data.Seed).Should().Be(original);
    }

    [Theory]
    [InlineData("T3")]
    [InlineData("UNKNOWN")]
    public async Task Source_import_rejects_a_selection_that_is_not_currently_eligible(string unavailableTask)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = SourceData();
        var controller = CreateController(ctx, financialViewer: true, dataSource: data);

        (await controller.ImportSources(PiIam, new(3, [new("P1", "T1"), new("P1", unavailableTask)]), default))
            .Should().BeOfType<BadRequestObjectResult>();

        data.PersonnelProjectNumbers.Should().BeNull();
        ctx.Projections.Should().BeEmpty();
    }

    [Theory]
    [InlineData("history")]
    [InlineData("empty")]
    [InlineData("missing")]
    [InlineData("duplicate")]
    [InlineData("blank-project")]
    public async Task Source_import_rejects_invalid_requests_before_source_access(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = SourceData();
        var request = invalid switch
        {
            "history" => new ProjectionsController.ImportProjectionSourcesRequest(4, [new("P1", "T1")]),
            "empty" => new(3, []),
            "missing" => new(3, null),
            "duplicate" => new(3, [new("P1", null), new("P1", "")]),
            _ => new(3, [new(" ", "T1")]),
        };
        (await CreateController(ctx, financialViewer: true, dataSource: data).ImportSources(PiIam, request, default))
            .Should().BeOfType<BadRequestObjectResult>();
        data.SnapshotAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Unrelated_caller_cannot_list_or_import_source_data()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var data = SourceData();
        var controller = CreateController(ctx, employeeId: "999", dataSource: data);
        (await controller.Sources(PiIam, default)).Should().BeOfType<ForbidResult>();
        (await controller.ImportSources(PiIam, new(3, [new("P1", "T1")]), default)).Should().BeOfType<ForbidResult>();
        data.SnapshotAtUtc.Should().BeNull();
    }

    private static ProjectionFundingSource NewTaskSource() => new()
    {
        Id = 1, Name = "Task source", ProjectNumber = "P1", TaskNumber = "T1", ProjectName = "Captured project",
        SourceKind = ProjectionSourceKind.Task, CapturedAt = SourceCapture,
        StartDate = new(2026, 1, 1), EndDate = new(2027, 1, 1),
    };

    [Theory]
    [InlineData("non-utc")]
    [InlineData("kind")]
    [InlineData("task-project")]
    [InlineData("task-capture")]
    [InlineData("planned-project")]
    [InlineData("planned-start")]
    [InlineData("dates")]
    [InlineData("duplicate")]
    [InlineData("planned-capture")]
    public async Task Create_and_save_reject_invalid_new_sources_without_changing_saved_data(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx, financialViewer: true);
        var saved = await CreateProjectionAsync(ctx);
        var before = JsonSerializer.Serialize(saved);
        var task = NewTaskSource();
        var sources = new List<ProjectionFundingSource> { task };
        switch (invalid)
        {
            case "non-utc": task.CapturedAt = DateTime.SpecifyKind(SourceCapture, DateTimeKind.Unspecified); break;
            case "kind": task.SourceKind = (ProjectionSourceKind)99; break;
            case "task-project": task.ProjectNumber = null; break;
            case "task-capture": task.CapturedAt = default; break;
            case "planned-project": task.SourceKind = ProjectionSourceKind.Planned; break;
            case "planned-start": task.SourceKind = ProjectionSourceKind.Planned; task.ProjectNumber = null; task.TaskNumber = null; task.StartDate = null; break;
            case "dates": task.EndDate = new DateOnly(2025, 12, 31); break;
            case "duplicate": var duplicate = NewTaskSource(); duplicate.Id = 2; sources.Add(duplicate); break;
            case "planned-capture": task.SourceKind = ProjectionSourceKind.Planned; task.ProjectNumber = null; task.TaskNumber = null; task.CapturedAt = default; break;
        }
        var snapshot = new ProjectionDraft("Invalid", 3, saved.SeededAt, sources, []);
        (await controller.Create(PiIam, new(snapshot, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(saved.Id, Draft(saved) with { FundingSources = sources }, default)).Should().BeOfType<BadRequestObjectResult>();
        ctx.Projections.Should().ContainSingle();
        JsonSerializer.Serialize(saved).Should().Be(before);
    }

    [Fact]
    public async Task Save_preserves_task_and_planned_source_provenance_with_funding_gaps()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var saved = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var task = NewTaskSource();
        task.Name = "Edited source label";
        task.BalanceAdjustment = -125;
        task.CapturedStartDate = new(2026, 1, 1);
        task.StartDate = new(2026, 3, 1);
        var sources = new List<ProjectionFundingSource>
        {
            task,
            new() { Id = 2, Name = "Planned", SourceKind = ProjectionSourceKind.Planned, CapturedAt = SourceCapture, StartDate = new(2027, 1, 1), BalanceAdjustment = 10000 },
        };
        var jobs = new List<ProjectionAppointment>
        {
            new() { Id = 1, Name = "Existing person", IsSeeded = true, MonthlySalary = 5000, HasUnmatchedFunding = true,
                Allocations = [new() { FundingSourceId = 1, Percent = 0.3m }] },
        };
        (await controller.Save(saved.Id, Draft(saved) with { FundingSources = sources, Appointments = jobs }, default)).Should().BeOfType<OkObjectResult>();
        ctx.ChangeTracker.Clear();
        var loaded = (Projection)((OkObjectResult)await controller.Get(saved.Id, default)).Value!;
        loaded.FundingSources.Should().BeEquivalentTo(sources);
        loaded.Appointments.Should().BeEquivalentTo(jobs);
        loaded.FundingSources[0].Name.Should().Be("Edited source label");
        loaded.FundingSources[0].ProjectName.Should().Be("Captured project");
        loaded.FundingSources[1].ProjectName.Should().BeNull();
        loaded.SeededAt.Should().Be(saved.SeededAt);
    }

}
