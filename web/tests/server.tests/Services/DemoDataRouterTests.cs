using FluentAssertions;
using server.core.Domain;
using server.core.Models;
using server.Helpers;
using server.Services;
using server.tests.Fakes;
using Server.Demo;

namespace server.tests.Services;

public sealed class DemoDataRouterTests
{
    private static readonly SearchablePersonRecord RealPerson =
        new() { IamId = "1000000001", EmployeeId = "E1", Name = "Real Person", Email = "real@ucdavis.edu" };

    private static readonly FakeFinancialProject RealProject = new("REAL-1",
        [new FakeFinancialProjectTeamMember(PpmRole.ProjectManager, "Real Person", "E1", null)], []);

    private readonly FakePpmPortfolioReader _reader = new([RealProject]);

    private readonly FakeProjectionDataSource _projections = new()
    {
        Seed = new ProjectionSeedData { Projects = [new ProjectionSeedProject { ProjectNumber = "REAL-1", TaskNumber = "1" }] },
        JobCodes = [new JobCodeRecord { RateSet = "DVCMP", JobCode = "001234" }],
        Categories = ["01 - Salaries and Wages"],
    };

    private DemoDataRouter Router(FakeDatamartService? datamart = null) =>
        new(datamart ?? new FakeDatamartService(RealPerson), _reader, _projections,
            new DemoDataSource(new DateTime(2027, 1, 15)));

    [Fact]
    public async Task Demo_ids_are_answered_from_demo_data()
    {
        var datamart = new FakeDatamartService();
        var router = Router(datamart);

        (await router.GetSearchablePersonByIamIdAsync(DemoDataSet.PiIamId))!.Name.Should().Be("Professor Ada Example");
        (await router.GetSearchablePersonByEmployeeIdAsync(DemoDataSet.PiEmployeeId))!.IamId.Should().Be(DemoDataSet.PiIamId);
        (await router.GetProjectCostsAsync("DEMO-1001")).Should().NotBeEmpty();
        (await router.GetProjectProjectionAsync("DEMO-1001", 3)).Categories.Should().NotBeEmpty();
        (await router.GetFacultyPortfolioAsync(["DEMO-1001"])).Should().NotBeEmpty();
        (await router.GetPositionBudgetsAsync(["DEMO-1001"])).Should().NotBeEmpty();
        datamart.ReportCalls.Should().Be(0);
    }

    [Fact]
    public async Task Real_ids_go_to_the_datamart()
    {
        var router = Router();

        (await router.GetSearchablePersonByIamIdAsync(RealPerson.IamId))!.Name.Should().Be("Real Person");
        (await router.GetProjectTeamAsync("REAL-1", PpmRole.ProjectManager)).Should().ContainSingle();
        (await router.GetProjectionSeedAsync("E1", null, null, default)).Should().BeSameAs(_projections.Seed);
    }

    [Fact]
    public async Task Mixed_project_lists_are_split_between_demo_data_and_the_datamart()
    {
        var datamart = new FakeDatamartService(portfolio: [new FacultyPortfolioRecord { ProjectNumber = "REAL-1" }]);

        var rows = await Router(datamart).GetFacultyPortfolioAsync(["REAL-1", "DEMO-1001"]);

        rows.Select(r => r.ProjectNumber).Distinct().Should().BeEquivalentTo(["REAL-1", "DEMO-1001"]);
    }

    [Fact]
    public async Task Demo_employees_and_projects_use_demo_memberships()
    {
        var router = Router();

        (await router.GetEmployeeProjectsAsync(DemoDataSet.PiEmployeeId, PpmRole.PrincipalInvestigator)).Should().HaveCount(3);
        (await router.GetProjectTeamAsync("DEMO-1001", PpmRole.PrincipalInvestigator))
            .Should().ContainSingle().Which.EmployeeId.Should().Be(DemoDataSet.PiEmployeeId);
        _reader.MembershipCalls.Should().Be(0);
        _reader.TeamCalls.Should().Be(0);
    }

    [Fact]
    public async Task Project_manager_badges_merge_demo_and_real_employees()
    {
        var managers = await Router().GetProjectManagerEmployeeIdsAsync([DemoDataSet.PmEmployeeId, "E1", "E2"]);

        managers.Should().BeEquivalentTo([DemoDataSet.PmEmployeeId, "E1"]);
        _reader.BadgeEmployeeIds.Should().BeEquivalentTo(["E1", "E2"]);
    }

    [Fact]
    public async Task Team_lookups_resolve_demo_and_real_people_together()
    {
        var people = await Router().GetSearchablePeopleByEmployeeIdsAsync([DemoDataSet.PiEmployeeId, "E1"]);

        people.Select(p => p.Name).Should().BeEquivalentTo(["Professor Ada Example", "Real Person"]);
    }

    [Fact]
    public async Task Demo_PI_projections_are_seeded_from_demo_data()
    {
        var projection = new Projection { PiEmployeeId = DemoDataSet.PiEmployeeId, Name = "Demo" };

        await new ProjectionSeeder(Router()).SeedAsync(projection, 3, null, null, default);

        projection.Projects.Select(p => p.ProjectNumber).Should().BeEquivalentTo(["DEMO-1001", "DEMO-1002", "DEMO-1004"]);
        projection.Projects.Should().OnlyContain(p => p.Budgets.Count == 3 && p.Actuals.Count > 0
            && p.Expenses.Any(e => e.Kind == ProjectionExpenseKind.Projected));
        var projectIds = projection.Projects.Select(p => (int?)p.Id).ToList();
        projection.Jobs.Should().NotBeEmpty();
        projection.Jobs.Should().OnlyContain(j => j.FundingEntries.Any(f => projectIds.Contains(f.ProjectId)));
    }

    [Fact]
    public async Task Projection_lookups_come_from_the_datamart()
    {
        var router = Router();

        (await router.GetJobCodesAsync(default)).Should().ContainSingle();
        (await router.GetExpenditureCategoriesAsync(default)).Should().ContainSingle();
    }
}
