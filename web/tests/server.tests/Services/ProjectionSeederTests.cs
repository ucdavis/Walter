using FluentAssertions;
using server.core.Domain;
using server.core.Models;
using server.Services;
using server.tests.Fakes;

namespace server.tests.Services;

public sealed class ProjectionSeederTests
{
    private const string Supplies = "05 - Supplies";

    private static FakeProjectionDataSource Data(params PositionBudgetRecord[] personnel) => new()
    {
        Seed = new ProjectionSeedData
        {
            Projects = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ProjectName = "Project 1" }],
            Budgets = [new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, Budget = 1000, SpentToDate = 200, Committed = 100 }],
            RunRates =
            [
                new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, HistoryMonths = 3, MonthlyAmount = 50 },
                new() { ProjectNumber = "P1", TaskNumber = "TASK01", ExpenditureCategory = Supplies, HistoryMonths = 6, MonthlyAmount = 40 },
            ],
        },
        Personnel = [.. personnel],
    };

    private static PositionBudgetRecord Line(decimal percent, bool isFuture = false, string? status = null, string? task = "TASK01") => new()
    {
        EmployeeId = "E1", PositionNumber = "X1", Name = "Person", ProjectId = "P1", Task = task,
        DistributionPercent = percent, MonthlyRate = 5000, Fte = 1, CompositeBenefitRate = 0.3m,
        VacationAccrual = 0.083m, BusinessUnit = "UCANR", IsFuture = isFuture, EarnCodeStatus = status,
    };

    private static async Task<ProjectionDraft> SeedAsync(FakeProjectionDataSource data, int historyMonths = 6) =>
        (await new ProjectionSeeder(data).CaptureDraftAsync("PI", historyMonths, null, null, default)).Draft;

    [Fact]
    public async Task Keeps_the_query_snapshot_when_the_clock_crosses_a_month_while_awaiting_data()
    {
        var beforeMidnight = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc).AddTicks(-1);
        var clock = new MutableTimeProvider(beforeMidnight);
        var response = new TaskCompletionSource<ProjectionSeedData>(TaskCreationOptions.RunContinuationsAsynchronously);
        var data = Data();
        data.SeedResponse = response.Task;
        var seeding = new ProjectionSeeder(data, clock).CaptureDraftAsync("PI", 6, null, null, default);

        seeding.IsCompleted.Should().BeFalse();
        data.SnapshotAtUtc.Should().Be(beforeMidnight);
        clock.UtcNow = new DateTime(2026, 11, 1, 0, 0, 1, DateTimeKind.Utc);
        response.SetResult(data.Seed);
        var projection = (await seeding).Draft;

        projection.SeededAt.Should().Be(beforeMidnight);
        projection.SeededAt.Should().Be(data.SnapshotAtUtc!.Value);
        projection.SeededAt.Kind.Should().Be(DateTimeKind.Utc);
        projection.FundingSources.Single().CapturedAt.Should().Be(projection.SeededAt);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task Queries_with_the_monotonic_snapshot_when_advancing_a_saved_token_crosses_a_month(int clockOffsetDays)
    {
        var nextMonth = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var previousSnapshot = nextMonth.AddTicks(-1);
        var clock = new MutableTimeProvider(previousSnapshot.AddDays(clockOffsetDays));
        var data = Data();
        var projection = (await new ProjectionSeeder(data, clock)
            .CaptureDraftAsync("PI", 6, null, null, default, previousSnapshot)).Draft;

        data.SnapshotAtUtc.Should().Be(nextMonth);
        projection.SeededAt.Should().Be(nextMonth);
        projection.SeededAt.Should().Be(data.SnapshotAtUtc!.Value);
        projection.SeededAt.Kind.Should().Be(DateTimeKind.Utc);
        projection.FundingSources.Single().CapturedAt.Should().Be(projection.SeededAt);
    }

    [Fact]
    public async Task Does_not_return_a_draft_when_the_seed_query_fails()
    {
        var previousSnapshot = new DateTime(2026, 10, 16, 0, 0, 0, DateTimeKind.Utc);
        var querySnapshot = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var data = Data();
        data.SeedResponse = Task.FromException<ProjectionSeedData>(new InvalidOperationException("Seed unavailable"));

        var seeding = () => new ProjectionSeeder(data, new MutableTimeProvider(querySnapshot))
            .CaptureDraftAsync("PI", 6, null, null, default, previousSnapshot);

        await seeding.Should().ThrowAsync<InvalidOperationException>();

        data.SnapshotAtUtc.Should().Be(querySnapshot);
    }

    [Fact]
    public async Task Seeds_projects_budgets_actuals_runrates_and_projected_expenses()
    {
        var projection = await SeedAsync(Data());

        projection.HistoryMonths.Should().Be(6);
        var project = projection.FundingSources.Should().ContainSingle().Subject;
        project.Id.Should().Be(1);
        project.ProjectNumber.Should().Be("P1");
        project.TaskNumber.Should().Be("TASK01");
        project.SourceKind.Should().Be(ProjectionSourceKind.Task);
        project.CapturedAt.Should().Be(projection.SeededAt);
        project.TaskName.Should().BeNull();
        project.Name.Should().Be("Project 1");
        project.ProjectName.Should().Be("Project 1");
        project.Budgets.Should().ContainSingle().Which.Should().BeEquivalentTo(new { Budget = 1000m, SpentToDate = 200m, Committed = 100m });
        project.RunRates.Should().HaveCount(2);
        project.Expenses.Should().ContainSingle().Which.Should().BeEquivalentTo(
            new { Kind = ProjectionExpenseKind.Projected, Amount = 40m, ExpenditureCategory = Supplies });
    }

    [Fact]
    public async Task Groups_personnel_into_jobs_with_outside_portfolio_remainder()
    {
        var projection = await SeedAsync(Data(Line(60)));

        var job = projection.Appointments.Should().ContainSingle().Subject;
        job.Should().BeEquivalentTo(new { MonthlySalary = 5000m, CbrRate = 0.3m, VacationAccrualRate = 0.083m, RateSet = "UCANR" });
        job.Id.Should().Be(1);
        job.Allocations.Select(f => (f.FundingSourceId, f.Percent)).Should().BeEquivalentTo(
            [((int?)projection.FundingSources.Single().Id, 0.6m), ((int?)null, 0.4m)]);
    }

    public static TheoryData<decimal?, decimal> CbrRates => new()
    {
        { null, 0m },
        { 0m, 0m },
        { 0.3m, 0.3m },
    };

    [Theory]
    [MemberData(nameof(CbrRates))]
    public async Task Defaults_missing_cbr_to_zero_and_preserves_supplied_benefit_rates(decimal? sourceCbr, decimal expectedCbr)
    {
        var line = Line(100);
        line.CompositeBenefitRate = sourceCbr;

        var projection = await SeedAsync(Data(line));

        var job = projection.Appointments.Should().ContainSingle().Subject;
        job.CbrRate.Should().Be(expectedCbr);
        job.VacationAccrualRate.Should().Be(0.083m);
    }

    [Fact]
    public async Task Defaults_both_missing_benefit_rates_to_zero()
    {
        var line = Line(100);
        line.CompositeBenefitRate = null;
        line.VacationAccrual = null;

        var projection = await SeedAsync(Data(line));

        var job = projection.Appointments.Should().ContainSingle().Subject;
        job.CbrRate.Should().Be(0m);
        job.VacationAccrualRate.Should().Be(0m);
    }

    [Fact]
    public async Task Leaves_an_unknown_task_unallocated_without_replacing_it_with_outside_funding()
    {
        var projection = await SeedAsync(Data(Line(100, task: "")));

        projection.Appointments.Single().Allocations.Should().BeEmpty();
        projection.Appointments.Single().HasUnmatchedFunding.Should().BeTrue();
    }

    [Fact]
    public async Task Skips_future_rows()
    {
        var projection = await SeedAsync(Data(Line(40, isFuture: true), Line(60)));

        projection.Appointments.Single().Allocations.Where(f => f.FundingSourceId != null).Sum(f => f.Percent).Should().Be(0.6m);
    }

    [Fact]
    public async Task Seeds_unsplit_people_without_salary_or_funding()
    {
        var projection = await SeedAsync(Data(Line(60, status: "Unsplit")));

        var job = projection.Appointments.Should().ContainSingle().Subject;
        job.MonthlySalary.Should().BeNull();
        job.Allocations.Should().BeEmpty();
    }

    [Fact]
    public void ApplyRunRates_replaces_projected_and_keeps_monthly()
    {
        var project = new ProjectionFundingSource
        {
            RunRates =
            [
                new() { ExpenditureCategory = Supplies, HistoryMonths = 3, MonthlyAmount = 50 },
                new() { ExpenditureCategory = Supplies, HistoryMonths = 12, MonthlyAmount = 20 },
            ],
            Expenses =
            [
                new() { Kind = ProjectionExpenseKind.Projected, ExpenditureCategory = Supplies, Amount = 50 },
                new() { Kind = ProjectionExpenseKind.Monthly, ExpenditureCategory = Supplies, Amount = 999 },
            ],
        };
        ProjectionSeeder.ApplyRunRates([project], 12);
        project.Expenses.Select(e => (e.Kind, e.Amount)).Should().BeEquivalentTo(
            [(ProjectionExpenseKind.Monthly, 999m), (ProjectionExpenseKind.Projected, 20m)]);
    }

    private sealed class MutableTimeProvider(DateTime utcNow) : TimeProvider
    {
        public DateTime UtcNow { get; set; } = utcNow;
        public override DateTimeOffset GetUtcNow() => new(UtcNow);
    }
}
