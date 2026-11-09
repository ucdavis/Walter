using FluentAssertions;
using Server.Demo;
using server.Helpers;

namespace server.tests.Services;

public sealed class DemoDataSourceTests
{
    private readonly DemoDataSource _data = new(new DateTime(2027, 1, 15));

    [Theory]
    [InlineData("pi")]
    [InlineData("pm")]
    public async Task Presentation_profiles_resolve_to_the_same_fictional_people_and_memberships(string profile)
    {
        var user = DemoDataSet.GetProfile(profile)!;
        var person = await _data.GetSearchablePersonByIamIdAsync(user.IamId);
        person.Should().NotBeNull();
        person!.EmployeeId.Should().Be(user.EmployeeId);
        person.Name.Should().Be(user.DisplayName);
        person.Email.Should().EndWith("@example.invalid");

        var projects = await _data.GetEmployeeProjectsAsync(user.EmployeeId,
            profile == "pi" ? PpmRole.PrincipalInvestigator : PpmRole.ProjectManager);
        projects.Should().HaveCount(profile == "pi" ? 3 : 4);
        foreach (var project in projects)
        {
            var records = await _data.GetFacultyPortfolioAsync([project.ProjectNumber]);
            records.Should().NotBeEmpty();
            var pi = project.TeamMembers.Single(p => p.RoleName == PpmRole.PrincipalInvestigator);
            var piPerson = await _data.GetSearchablePersonByEmployeeIdAsync(pi.EmployeeId);
            piPerson.Should().NotBeNull();
            records.Should().OnlyContain(r => r.Pi == piPerson!.Name);
        }
    }

    [Fact]
    public async Task Unknown_and_mixed_identifiers_never_return_unrequested_data()
    {
        DemoDataSet.GetProfile("admin").Should().BeNull();
        (await _data.GetSearchablePersonByIamIdAsync("real-person")).Should().BeNull();
        (await _data.GetSearchablePersonByEmployeeIdAsync("12345678")).Should().BeNull();
        (await _data.GetSearchablePersonByEmailAsync("person@ucdavis.edu")).Should().BeNull();
        (await _data.GetEmployeeProjectsAsync("12345678", PpmRole.ProjectManager)).Should().BeEmpty();
        (await _data.GetProjectTeamAsync("REAL-PROJECT", PpmRole.PrincipalInvestigator)).Should().BeEmpty();
        (await _data.GetFacultyPortfolioAsync(["REAL-PROJECT"])).Should().BeEmpty();
        (await _data.GetPositionBudgetsAsync(["REAL-PROJECT"])).Should().BeEmpty();
        (await _data.GetGLTransactionListingsAsync(["REAL-PROJECT"])).Should().BeEmpty();
        (await _data.GetGLPPMReconciliationAsync(["REAL-PROJECT"])).Should().BeEmpty();
        (await _data.GetProjectCostsAsync("REAL-PROJECT")).Should().BeEmpty();
        (await _data.GetProjectProjectionAsync("REAL-PROJECT", 3)).Categories.Should().BeEmpty();
        (await _data.GetFacultyPortfolioAsync(["REAL-PROJECT", "DEMO-1001"]))
            .Should().OnlyContain(p => p.ProjectNumber == "DEMO-1001");
        (await _data.GetProjectManagerEmployeeIdsAsync([DemoDataSet.PmEmployeeId, "12345678"]))
            .Should().BeEquivalentTo([DemoDataSet.PmEmployeeId]);
    }

    [Fact]
    public async Task Responses_are_fresh_so_enrichment_cannot_change_other_sessions()
    {
        var profile = DemoDataSet.GetProfile("pi")!;
        profile.DisplayName = "Changed by a caller";
        DemoDataSet.GetProfile("pi")!.DisplayName.Should().Be("Professor Ada Example");

        var person = await _data.GetSearchablePersonByIamIdAsync(DemoDataSet.PiIamId);
        person!.Name = "Changed by a caller";
        (await _data.GetSearchablePersonByIamIdAsync(DemoDataSet.PiIamId))!.Name.Should().Be("Professor Ada Example");

        var first = await _data.GetFacultyPortfolioAsync(["DEMO-1001"]);
        first[0].OwnerName = "Changed by a caller";
        first[0].PpmBudget = -1m;
        var next = await _data.GetFacultyPortfolioAsync(["DEMO-1001"]);
        next[0].OwnerName.Should().Be("Professor Ada Example");
        next[0].PpmBudget.Should().BePositive();

        var personnel = await _data.GetPositionBudgetsAsync(["DEMO-1001"]);
        personnel[0].MonthlyRate = -1m;
        (await _data.GetPositionBudgetsAsync(["DEMO-1001"]))[0].MonthlyRate.Should().BePositive();
    }

    [Theory]
    [InlineData("DEMO-1001")]
    [InlineData("DEMO-1002")]
    [InlineData("DEMO-1003")]
    [InlineData("DEMO-1004")]
    public async Task Summary_costs_transactions_and_personnel_share_consistent_amounts(string project)
    {
        var rows = await _data.GetFacultyPortfolioAsync([project]);
        var costs = await _data.GetProjectCostsAsync(project);
        var transactions = await _data.GetGLTransactionListingsAsync([project]);
        costs.Select(c => c.TransactionNumber).Should().OnlyHaveUniqueItems();
        costs.Sum(c => c.BurdenedCost).Should().Be(rows.Sum(r => r.PpmExpenses));
        transactions.Where(t => t.NaturalAccountType!.StartsWith("5")).Sum(t => t.ActualAmount)
            .Should().Be(costs.Sum(c => c.BurdenedCost));
        transactions.Where(t => t.NaturalAccountType!.StartsWith("4")).Sum(t => t.ActualAmount)
            .Should().Be(-rows.Sum(r => r.PpmBudget));
        var reconciliation = (await _data.GetGLPPMReconciliationAsync([project])).Single();
        reconciliation.GlActualAmount.Should().Be(transactions.Sum(t => t.ActualAmount));
        reconciliation.RemainingBalance.Should().Be(reconciliation.GlActualAmount + reconciliation.PpmBudBal);
        rows.Should().OnlyContain(r => r.PpmBudget - r.PpmExpenses - r.PpmCommitments == r.PpmBudBal);

        var personnel = await _data.GetPositionBudgetsAsync([project]);
        var salary = personnel.Sum(p => p.MonthlyRate * p.Fte * p.DistributionPercent / 100m * p.EarnCodeShare);
        var benefits = personnel.Sum(p => p.MonthlyRate * p.Fte * p.DistributionPercent / 100m * p.EarnCodeShare * p.CompositeBenefitRate);
        var projection = await _data.GetProjectProjectionAsync(project, 3);
        projection.Periods.Single(p => p.Month == "2027-02" && p.ExpenditureCategory == "01 - Salaries and Wages")
            .ProjectedAmount.Should().Be(salary!.Value);
        projection.Periods.Single(p => p.Month == "2027-02" && p.ExpenditureCategory == "02 - Fringe Benefits")
            .ProjectedAmount.Should().Be(benefits!.Value);
        if (project == "DEMO-1004") costs.Should().OnlyContain(c => c.AwardNumber == null && c.TaskFundCode == "DEMO-FUND");
    }

    [Theory]
    [InlineData(3)]
    [InlineData(6)]
    [InlineData(12)]
    public async Task Burndown_honors_history_and_anchors_each_category_at_the_last_actual_month(int history)
    {
        var result = await _data.GetProjectProjectionAsync("DEMO-1002", history);
        result.Periods.Should().HaveCount(result.Categories.Count * (history + 13));
        foreach (var category in result.Categories)
        {
            var periods = result.Periods.Where(p => p.ExpenditureCategory == category.ExpenditureCategory).ToArray();
            periods.Count(p => p.Kind == "actual").Should().Be(history);
            periods.Single(p => p.Month == "2026-12").Remaining.Should().Be(category.RemainingNow);
            var current = periods.Single(p => p.Month == "2027-01");
            current.Kind.Should().Be("blended");
            current.Remaining.Should().Be(category.RemainingNow - current.ActualAmount - current.ProjectedAmount);
            periods.Last().Remaining.Should().BeNegative();
        }
        var healthy = await _data.GetProjectProjectionAsync("DEMO-1001", history);
        healthy.Periods.Should().OnlyContain(p => p.Remaining > 0m);
    }

    [Fact]
    public async Task Searches_are_limited_to_fictional_data_and_honor_limits()
    {
        (await _data.SearchPeopleAsync("de", 5)).Should().BeEmpty();
        (await _data.SearchPeopleAsync("example", 1)).Should().ContainSingle();
        (await _data.SearchPeopleAsync("example.invalid", 100)).Should().OnlyContain(p => p.IamId.StartsWith("DEMO"));
        (await _data.SearchProjectsAsync("Sky%Garden", "")).Should().ContainSingle().Which.ProjectNumber.Should().Be("DEMO-1001");
        (await _data.SearchProjectsAsync("", "DEMO-1004")).Should().ContainSingle();
        (await _data.SearchProjectsAsync("real project", "REAL-PROJECT")).Should().BeEmpty();
    }

    [Fact]
    public async Task Canceled_requests_do_not_return_reports()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        Func<Task> action = () => _data.GetFacultyPortfolioAsync(["DEMO-1001"], ct: cancellation.Token);
        await action.Should().ThrowAsync<OperationCanceledException>();
    }
}
