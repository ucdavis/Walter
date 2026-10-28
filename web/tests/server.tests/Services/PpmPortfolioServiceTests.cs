using FluentAssertions;
using Microsoft.Extensions.Options;
using server.Helpers;
using server.Services;
using server.tests.Fakes;

namespace server.tests.Services;

public sealed class PpmPortfolioServiceTests
{
    private static readonly FakeFinancialProject[] Projects =
    [
        new("P1", [new(PpmRole.PrincipalInvestigator, "Team PI", "PI", null)],
            [new(PpmRole.PrincipalInvestigator, "Award PI", "AWARD", null), new(PpmRole.ProjectManager, "Award PM", "PM", null)]),
        new("P2", [new(PpmRole.ProjectManager, "Project PM", "PM", null)], [])
    ];

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Employee_projects_include_awards_but_team_excludes_award_personnel(bool legacy)
    {
        var reader = new FakePpmPortfolioReader(Projects);
        var service = Create(legacy, reader);
        var projects = await service.GetEmployeeProjectsAsync("AWARD", PpmRole.PrincipalInvestigator, default);
        projects.Should().ContainSingle().Which.ProjectNumber.Should().Be("P1");
        projects.Single().TeamMembers.Select(m => m.EmployeeId).Should().Equal("PI");
        reader.MembershipCalls.Should().Be(legacy ? 0 : 1);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Badges_preserve_award_pm_and_ignore_unknown_employees(bool legacy)
    {
        var reader = new FakePpmPortfolioReader(Projects);
        var result = await Create(legacy, reader).GetProjectManagerEmployeeIdsAsync(["PI", "PM", "UNKNOWN"], default);
        result.Should().Equal("PM");
        reader.BadgeCalls.Should().Be(legacy ? 0 : 1);
        if (!legacy) reader.BadgeEmployeeIds.Should().Equal("PI", "PM", "UNKNOWN");
    }

    [Theory]
    [InlineData("membership")]
    [InlineData("team")]
    [InlineData("badges")]
    public async Task Imported_failure_propagates_without_GraphQL_fallback(string operation)
    {
        var reader = new FakePpmPortfolioReader { Error = new InvalidOperationException("snapshot unavailable") };
        var service = Create(false, reader);
        Func<Task> action = () => operation switch
        {
            "membership" => service.GetEmployeeProjectsAsync("AWARD", PpmRole.PrincipalInvestigator, default),
            "team" => service.GetProjectTeamAsync("P1", PpmRole.PrincipalInvestigator, default),
            _ => service.GetProjectManagerEmployeeIdsAsync(["PM"], default)
        };
        await action.Should().ThrowAsync<InvalidOperationException>().WithMessage("snapshot unavailable");
    }

    [Fact]
    public async Task Imported_cancellation_propagates()
    {
        var service = Create(false, new FakePpmPortfolioReader(Projects));
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        Func<Task> action = () => service.GetEmployeeProjectsAsync("PI", PpmRole.PrincipalInvestigator, cancellation.Token);
        await action.Should().ThrowAsync<OperationCanceledException>();
    }

    private static PpmPortfolioService Create(bool legacy, FakePpmPortfolioReader reader) =>
        new(new FakeFinancialApiService([], new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>
        {
            ["P1"] = Projects[0].TeamMembers,
            ["P2"] = Projects[1].TeamMembers
        }, Projects), reader, Options.Create(new FeatureFlagOptions { UseGraphQLAPI = legacy }));
}
