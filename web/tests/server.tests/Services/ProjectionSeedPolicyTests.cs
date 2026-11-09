using System.Text.Json;
using FluentAssertions;
using server.core.Domain;
using server.core.Models;
using server.Services;
using server.tests.Fakes;

namespace server.tests.Services;

public sealed class ProjectionSeedPolicyTests
{
    private const string Supplies = "05 - Supplies";
    private const string Salary = "01 - Salaries and Wages";
    private static readonly DateTime Snapshot = new(2026, 11, 7, 23, 59, 59, DateTimeKind.Utc);

    private static ProjectionSeedProject TaskRow(string project, string task, string? type = "Internal", string? status = "Active") => new()
    {
        ProjectNumber = project, TaskNumber = task, TaskName = task, ProjectName = project,
        ProjectType = type, TaskStatus = status,
    };

    private static PositionBudgetRecord FundingLine(string project, string task, decimal percent, int month) => new()
    {
        EmployeeId = "E1", PositionNumber = "X1", ProjectId = project, Task = task,
        MonthlyRate = 5000, Fte = 1, DistributionPercent = percent,
        FundingEffectiveDate = new DateTime(2026, month, 1),
        FundingEndDate = new DateTime(2026, month, DateTime.DaysInMonth(2026, month)),
    };

    private static async Task<ProjectionDraft> SeedAsync(FakeProjectionDataSource data) =>
        (await new ProjectionSeeder(data, new FixedClock()).CaptureDraftAsync("PI", 6, null, null, default)).Draft;

    [Theory]
    [InlineData("Internal", "Active", true)]
    [InlineData("Internal", "Inactive", false)]
    [InlineData("Internal", "inactive", true)]
    [InlineData("Internal", null, true)]
    [InlineData("internal", "Active", false)]
    [InlineData(null, "Active", false)]
    [InlineData("Sponsored", "Active", false)]
    public async Task Uses_the_dashboard_exact_internal_type_and_inactive_status_rules(string? type, string? status, bool included)
    {
        var source = TaskRow("P1", "T1", type, status);
        source.AwardEndDate = new DateTime(2026, 11, 6);
        var data = new FakeProjectionDataSource { Seed = new ProjectionSeedData { Projects = [source] } };

        var projection = await SeedAsync(data);

        projection.FundingSources.Should().HaveCount(included ? 1 : 0);
    }

    public static TheoryData<DateTime?, DateTime?, bool> SponsoredEndDates => new()
    {
        { new DateTime(2026, 11, 6), null, false },
        { new DateTime(2026, 11, 6), new DateTime(2026, 11, 7), true },
        { new DateTime(2026, 11, 8), new DateTime(2026, 11, 6), true },
        { null, null, true },
    };

    [Theory]
    [MemberData(nameof(SponsoredEndDates))]
    public async Task Uses_the_latest_sponsored_award_end_and_keeps_the_entire_utc_expiry_day(DateTime? firstEnd, DateTime? secondEnd, bool included)
    {
        var first = TaskRow("P1", "T1", "Sponsored");
        var second = TaskRow("P1", "T2", "Sponsored");
        first.AwardEndDate = firstEnd;
        second.AwardEndDate = secondEnd;
        var data = new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData
            {
                Projects = [first, second],
                Budgets = [
                    new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, Budget = 100 },
                    new() { ProjectNumber = "P1", TaskNumber = "T2", ExpenditureCategory = Supplies, Budget = 200 },
                ],
            },
        };

        var projection = await SeedAsync(data);

        projection.FundingSources.Should().HaveCount(included ? 2 : 0);
        if (included)
            projection.FundingSources.Select(p => p.Budgets.Single().Budget).Should().Equal(100m, 200m);
    }

    [Fact]
    public async Task Keeps_retained_task_financials_and_captured_dates_independent_without_mutating_source()
    {
        var first = TaskRow("P1", "T1");
        first.ProjectName = "First task metadata";
        first.StartDate = new DateTime(2026, 1, 1);
        first.EndDate = new DateTime(2026, 12, 31);
        var excluded = TaskRow("P1", "T2", status: "Inactive");
        excluded.StartDate = new DateTime(2024, 1, 1);
        excluded.EndDate = new DateTime(2028, 12, 31);
        var third = TaskRow("P1", "T3");
        third.StartDate = new DateTime(2026, 3, 1);
        third.EndDate = new DateTime(2026, 10, 31);
        var data = new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData
            {
                Projects = [third, excluded, first],
                Budgets = [
                    new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, Budget = 1000, SpentToDate = 100, Committed = 10 },
                    new() { ProjectNumber = "P1", TaskNumber = "T3", ExpenditureCategory = Supplies, Budget = 2000, SpentToDate = 200, Committed = 20 },
                    new() { ProjectNumber = "P1", TaskNumber = "T2", ExpenditureCategory = Supplies, Budget = 9000, SpentToDate = 900, Committed = 90 },
                    new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Salary, Budget = 5000 },
                    new() { ProjectNumber = "P1", TaskNumber = "T3", ExpenditureCategory = Salary, Budget = 6000 },
                ],
                Actuals = [
                    new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, Month = new DateTime(2026, 10, 1), Amount = 100 },
                    new() { ProjectNumber = "P1", TaskNumber = "T3", ExpenditureCategory = Supplies, Month = new DateTime(2026, 10, 1), Amount = 200 },
                    new() { ProjectNumber = "P1", TaskNumber = "T2", ExpenditureCategory = Supplies, Month = new DateTime(2026, 10, 1), Amount = 900 },
                    new() { ProjectNumber = "P1", TaskNumber = "T3", ExpenditureCategory = Supplies, Month = new DateTime(2026, 9, 1), Amount = 50 },
                    new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Salary, Month = new DateTime(2026, 10, 1), Amount = 400 },
                ],
                RunRates = [
                    new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, HistoryMonths = 3, MonthlyAmount = 50 },
                    new() { ProjectNumber = "P1", TaskNumber = "T3", ExpenditureCategory = Supplies, HistoryMonths = 3, MonthlyAmount = 70 },
                    new() { ProjectNumber = "P1", TaskNumber = "T1", ExpenditureCategory = Supplies, HistoryMonths = 6, MonthlyAmount = 40 },
                    new() { ProjectNumber = "P1", TaskNumber = "T3", ExpenditureCategory = Supplies, HistoryMonths = 6, MonthlyAmount = 60 },
                    new() { ProjectNumber = "P1", TaskNumber = "T2", ExpenditureCategory = Supplies, HistoryMonths = 6, MonthlyAmount = 800 },
                ],
            },
        };
        data.Personnel = [FundingLine("P1", "T1", 40, 4), FundingLine("P1", "T3", 60, 4)];
        var captured = JsonSerializer.Serialize(data.Seed);

        var projection = await SeedAsync(data);

        projection.FundingSources.Should().HaveCount(2);
        var project = projection.FundingSources.Single(p => p.TaskNumber == "T1");
        project.Should().BeEquivalentTo(new
        {
            ProjectNumber = "P1", TaskNumber = "T1", TaskName = "T1", Name = "First task metadata", ProjectName = "First task metadata",
            SourceKind = ProjectionSourceKind.Task, CapturedAt = (DateTime?)Snapshot,
            StartDate = new DateOnly(2026, 1, 1), EndDate = new DateOnly(2026, 12, 31),
            CapturedStartDate = new DateOnly(2026, 1, 1), CapturedEndDate = new DateOnly(2026, 12, 31),
        });
        project.Budgets.Select(b => (b.ExpenditureCategory, b.Budget, b.SpentToDate, b.Committed)).Should().BeEquivalentTo(
            [(Supplies, 1000m, 100m, 10m), (Salary, 5000m, 0m, 0m)]);
        project.Actuals.Select(a => (a.ExpenditureCategory, a.Month, a.Amount)).Should().BeEquivalentTo(
            [(Supplies, new DateOnly(2026, 10, 1), 100m), (Salary, new DateOnly(2026, 10, 1), 400m)]);
        project.RunRates.Select(r => (r.HistoryMonths, r.MonthlyAmount)).Should().BeEquivalentTo([(3, 50m), (6, 40m)]);
        project.Expenses.Should().BeEmpty();
        var other = projection.FundingSources.Single(p => p.TaskNumber == "T3");
        other.Budgets.Select(b => b.Budget).Should().BeEquivalentTo([2000m, 6000m]);
        other.Actuals.Select(a => a.Amount).Should().BeEquivalentTo([50m, 200m]);
        other.RunRates.Single(r => r.HistoryMonths == 6).MonthlyAmount.Should().Be(60m);
        other.Expenses.Should().BeEmpty();
        other.CapturedStartDate.Should().Be(new DateOnly(2026, 3, 1));
        other.CapturedEndDate.Should().Be(new DateOnly(2026, 10, 31));
        projection.Appointments.Single().Allocations.Select(f => (f.FundingSourceId, f.Percent)).Should().BeEquivalentTo(
            [((int?)project.Id, 0.4m), ((int?)other.Id, 0.6m)]);
        projection.Appointments.Single().HasUnmatchedFunding.Should().BeFalse();
        JsonSerializer.Serialize(data.Seed).Should().Be(captured);
    }

    [Fact]
    public async Task Retains_excluded_task_and_project_funding_outside_with_original_shares_and_dates()
    {
        var expired = TaskRow("P2", "T1", "Sponsored");
        expired.AwardEndDate = new DateTime(2026, 11, 6);
        var data = new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData { Projects = [TaskRow("P1", "T1"), TaskRow("P1", "T2", status: "Inactive"), expired] },
            Personnel = [FundingLine("P1", "T1", 40, 4), FundingLine("P1", "T2", 20, 5), FundingLine("P2", "T1", 10, 6), FundingLine("P1", "UNKNOWN", 10, 7)],
        };

        var response = await new ProjectionSeeder(data, new FixedClock()).CaptureDraftAsync("PI", 6, null, null, default);
        var projection = response.Draft;

        var project = projection.FundingSources.Should().ContainSingle().Subject;
        data.PersonnelProjectNumbers.Should().BeEquivalentTo(["P1", "P2"]);
        response.Roster.Should().ContainSingle().Which.Should().BeEquivalentTo(new
        {
            AppointmentId = projection.Appointments.Single().Id, ProjectNumbers = new[] { "P1", "P2" },
        });
        var job = projection.Appointments.Should().ContainSingle().Subject;
        job.HasUnmatchedFunding.Should().BeTrue();
        job.Allocations.Select(f => (f.FundingSourceId, f.Percent, f.StartDate, f.EndDate)).Should().BeEquivalentTo(new[]
        {
            ((int?)project.Id, 0.4m, (DateOnly?)new DateOnly(2026, 4, 1), (DateOnly?)new DateOnly(2026, 4, 30)),
            (null, 0.2m, new DateOnly(2026, 5, 1), new DateOnly(2026, 5, 31)),
            (null, 0.1m, new DateOnly(2026, 6, 1), new DateOnly(2026, 6, 30)),
            (null, 0.2m, null, null),
        });
    }

    [Fact]
    public async Task Keeps_employees_and_dated_outside_funding_even_when_every_source_project_is_excluded()
    {
        var unsplit = FundingLine("P1", "T1", 100, 4);
        unsplit.EmployeeId = "E2";
        unsplit.EarnCodeStatus = "Unsplit";
        var data = new FakeProjectionDataSource
        {
            Seed = new ProjectionSeedData { Projects = [TaskRow("P1", "T1", status: "Inactive")] },
            Personnel = [FundingLine("P1", "T1", 60, 4), unsplit],
        };

        var projection = await SeedAsync(data);

        projection.FundingSources.Should().BeEmpty();
        data.PersonnelProjectNumbers.Should().BeEquivalentTo(["P1"]);
        projection.Appointments.Should().HaveCount(2);
        var funded = projection.Appointments.Single(j => j.EmployeeId == "E1");
        funded.Allocations.Should().HaveCount(2).And.OnlyContain(f => f.FundingSourceId == null);
        funded.Allocations.Should().ContainSingle(f => f.StartDate == new DateOnly(2026, 4, 1))
            .Which.Should().BeEquivalentTo(new { Percent = 0.6m, EndDate = new DateOnly(2026, 4, 30) });
        funded.Allocations.Should().ContainSingle(f => f.StartDate == null).Which.Percent.Should().Be(0.4m);
        var missing = projection.Appointments.Single(j => j.EmployeeId == "E2");
        missing.MonthlySalary.Should().BeNull();
        missing.Allocations.Should().BeEmpty();
    }

    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(Snapshot);
    }
}
