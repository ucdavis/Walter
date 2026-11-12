using FluentAssertions;
using Server.Demo;
using server.Helpers;

namespace server.tests.Services;

public sealed class DemoDataSourceTests
{
    private static readonly string[] Projects = ["DEMO-1001", "DEMO-1002", "DEMO-1004"];

    private readonly DemoDataSource _data = new(new DateTime(2027, 1, 15));

    [Fact]
    public async Task The_demo_PI_resolves_to_consistent_people_and_memberships()
    {
        var person = await _data.GetSearchablePersonByIamIdAsync(DemoDataSet.PiIamId);
        person!.EmployeeId.Should().Be(DemoDataSet.PiEmployeeId);
        person.Email.Should().EndWith("@example.invalid");

        var projects = await _data.GetEmployeeProjectsAsync(DemoDataSet.PiEmployeeId, PpmRole.PrincipalInvestigator);
        projects.Select(p => p.ProjectNumber).Should().BeEquivalentTo(Projects);
        (await _data.GetEmployeeProjectsAsync(DemoDataSet.PmEmployeeId, PpmRole.ProjectManager)).Should().HaveCount(3);
        foreach (var project in projects)
        {
            var rows = await _data.GetFacultyPortfolioAsync([project.ProjectNumber]);
            rows.Should().NotBeEmpty().And.OnlyContain(r => r.Pi == person.Name);
        }
    }

    [Fact]
    public async Task Unknown_and_mixed_identifiers_never_return_unrequested_data()
    {
        (await _data.GetSearchablePersonByIamIdAsync("real-person")).Should().BeNull();
        (await _data.GetSearchablePersonByEmployeeIdAsync("12345678")).Should().BeNull();
        (await _data.GetEmployeeProjectsAsync("12345678", PpmRole.ProjectManager)).Should().BeEmpty();
        (await _data.GetProjectTeamAsync("REAL-PROJECT", PpmRole.PrincipalInvestigator)).Should().BeEmpty();
        (await _data.GetPositionBudgetsAsync(["REAL-PROJECT"])).Should().BeEmpty();
        (await _data.GetProjectCostsAsync("REAL-PROJECT")).Should().BeEmpty();
        (await _data.GetProjectProjectionAsync("REAL-PROJECT", 3)).Categories.Should().BeEmpty();
        (await _data.GetFacultyPortfolioAsync(["REAL-PROJECT", "DEMO-1001"]))
            .Should().OnlyContain(p => p.ProjectNumber == "DEMO-1001");
        (await _data.GetProjectManagerEmployeeIdsAsync([DemoDataSet.PmEmployeeId, "12345678"]))
            .Should().BeEquivalentTo([DemoDataSet.PmEmployeeId]);
    }

    [Fact]
    public async Task Responses_are_fresh_so_enrichment_cannot_change_other_requests()
    {
        var first = await _data.GetFacultyPortfolioAsync(["DEMO-1001"]);
        first[0].OwnerName = "Changed by a caller";
        first[0].PpmBudget = -1m;

        var next = await _data.GetFacultyPortfolioAsync(["DEMO-1001"]);

        next[0].OwnerName.Should().Be("Professor Ada Example");
        next[0].PpmBudget.Should().BePositive();
    }

    [Theory]
    [InlineData("DEMO-1001")]
    [InlineData("DEMO-1002")]
    [InlineData("DEMO-1004")]
    public async Task Costs_personnel_and_burndown_agree_with_the_portfolio(string project)
    {
        var rows = await _data.GetFacultyPortfolioAsync([project]);
        rows.Should().OnlyContain(r => r.PpmBudget - r.PpmExpenses - r.PpmCommitments == r.PpmBudBal);
        (await _data.GetProjectCostsAsync(project)).Sum(c => c.BurdenedCost).Should().Be(rows.Sum(r => r.PpmExpenses));
        (await _data.GetGLTransactionListingsAsync([project])).Should().NotBeEmpty();
        (await _data.GetGLPPMReconciliationAsync([project])).Should().ContainSingle();

        var personnel = await _data.GetPositionBudgetsAsync([project]);
        var salary = personnel.Sum(p => p.MonthlyRate * p.Fte * p.DistributionPercent / 100m * p.EarnCodeShare);
        var projection = await _data.GetProjectProjectionAsync(project, 3);
        projection.Periods.Single(p => p.Month == "2027-02" && p.ExpenditureCategory == "01 - Salaries and Wages")
            .ProjectedAmount.Should().Be(salary!.Value);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(12)]
    public async Task Burndown_honors_history_and_only_the_short_project_runs_out(int history)
    {
        var shortfall = await _data.GetProjectProjectionAsync("DEMO-1002", history);
        shortfall.Periods.Should().HaveCount(shortfall.Categories.Count * (history + 13));
        shortfall.Periods.Count(p => p.Kind == "actual").Should().Be(shortfall.Categories.Count * history);
        shortfall.Periods.Should().Contain(p => p.Remaining < 0m);

        var healthy = await _data.GetProjectProjectionAsync("DEMO-1001", history);
        healthy.Periods.Should().OnlyContain(p => p.Remaining > 0m);
    }

    [Fact]
    public async Task Projection_seed_covers_only_the_PIs_own_projects()
    {
        var seed = await _data.GetProjectionSeedAsync(DemoDataSet.PiEmployeeId);
        seed.Projects.Select(p => p.ProjectNumber).Should().BeEquivalentTo(Projects);
        seed.Projects.Should().OnlyContain(p => p.TaskNumber == "1" && p.EndDate > p.StartDate);

        var none = await _data.GetProjectionSeedAsync("12345678");
        none.Projects.Should().BeEmpty();
        none.Budgets.Should().BeEmpty();
        none.Actuals.Should().BeEmpty();
        none.RunRates.Should().BeEmpty();
    }

    [Theory]
    [InlineData("DEMO-1001")]
    [InlineData("DEMO-1002")]
    [InlineData("DEMO-1004")]
    public async Task Projection_seed_budgets_and_actuals_match_the_portfolio(string project)
    {
        var seed = await _data.GetProjectionSeedAsync(DemoDataSet.PiEmployeeId);
        var rows = await _data.GetFacultyPortfolioAsync([project]);
        var budgets = seed.Budgets.Where(b => b.ProjectNumber == project).ToList();
        var actuals = seed.Actuals.Where(a => a.ProjectNumber == project).ToList();

        budgets.Sum(b => b.Budget).Should().Be(rows.Sum(r => r.PpmBudget));
        budgets.Sum(b => b.Committed).Should().Be(rows.Sum(r => r.PpmCommitments));
        actuals.Sum(a => a.Amount).Should().Be(budgets.Sum(b => b.SpentToDate));
        // Twelve full months plus the current month, per category.
        actuals.Select(a => a.Month).Distinct().Should().HaveCount(13);
        actuals.Max(a => a.Month).Should().Be(new DateTime(2027, 1, 1));
    }

    [Fact]
    public async Task Projection_seed_run_rates_average_non_personnel_actuals_for_each_window()
    {
        var seed = await _data.GetProjectionSeedAsync(DemoDataSet.PiEmployeeId);

        seed.RunRates.Should().OnlyContain(r => r.ExpenditureCategory == "03 - Supplies / Services / Other Expenses");
        foreach (var project in seed.Projects)
        {
            var rates = seed.RunRates.Where(r => r.ProjectNumber == project.ProjectNumber).ToList();
            rates.Select(r => r.HistoryMonths).Should().BeEquivalentTo([3, 6, 12]);
            var lastThree = seed.Actuals.Where(a => a.ProjectNumber == project.ProjectNumber
                && a.ExpenditureCategory == rates[0].ExpenditureCategory
                && a.Month >= new DateTime(2026, 10, 1) && a.Month < new DateTime(2027, 1, 1));
            rates.Single(r => r.HistoryMonths == 3).MonthlyAmount.Should().Be(lastThree.Sum(a => a.Amount) / 3);
        }
    }

    [Fact]
    public async Task Expenditure_categories_use_names_from_the_real_category_list()
    {
        var rows = await _data.GetFacultyPortfolioAsync(["DEMO-1001"]);
        rows.Select(r => r.ExpenditureCategoryName).Should().BeEquivalentTo(
            ["01 - Salaries and Wages", "02 - Fringe Benefits", "03 - Supplies / Services / Other Expenses"]);
    }

    [Fact]
    public async Task Dates_follow_the_current_month_when_no_reference_date_is_given()
    {
        var now = DateTime.UtcNow;
        var rows = await new DemoDataSource().GetFacultyPortfolioAsync(["DEMO-1001"]);

        // Allows for a month rollover between the two clock reads.
        var start = rows[0].ProjectStartDate!.Value.AddMonths(12);
        (now - start).TotalDays.Should().BeInRange(0, 32);
        start.Day.Should().Be(1);
    }
}
