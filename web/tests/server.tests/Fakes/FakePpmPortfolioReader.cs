using server.core.Models;
using server.core.Services;
using server.Helpers;

namespace server.tests.Fakes;

public sealed class FakePpmPortfolioReader(IReadOnlyList<FakeFinancialProject>? projects = null) : IPpmPortfolioReader
{
    public Exception? Error { get; init; }
    public int MembershipCalls { get; private set; }
    public int TeamCalls { get; private set; }
    public int BadgeCalls { get; private set; }
    public IReadOnlyList<string> BadgeEmployeeIds { get; private set; } = [];

    public Task<IReadOnlyList<PpmProjectMembership>> GetEmployeeProjectsAsync(string employeeId, string roleName, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (Error is not null) throw Error;
        MembershipCalls++;
        return Task.FromResult<IReadOnlyList<PpmProjectMembership>>((projects ?? [])
            .Where(p => p.TeamMembers.Concat(p.AwardPersonnel).Any(m => m.EmployeeId == employeeId && m.RoleName == roleName))
            .Select(p => new PpmProjectMembership(p.ProjectNumber, p.ProjectNumber, p.TeamMembers.Select(ToMember).ToArray())).ToArray());
    }

    public Task<IReadOnlyList<PpmTeamMember>> GetProjectTeamAsync(string projectNumber, string roleName, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (Error is not null) throw Error;
        TeamCalls++;
        return Task.FromResult<IReadOnlyList<PpmTeamMember>>((projects ?? []).Where(p => p.ProjectNumber == projectNumber)
            .SelectMany(p => p.TeamMembers).Where(m => m.RoleName == roleName).Select(ToMember).ToArray());
    }

    public Task<IReadOnlySet<string>> GetProjectManagerEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (Error is not null) throw Error;
        BadgeCalls++;
        BadgeEmployeeIds = employeeIds.ToArray();
        return Task.FromResult<IReadOnlySet<string>>((projects ?? []).SelectMany(p => p.TeamMembers.Concat(p.AwardPersonnel))
            .Where(m => m.RoleName == PpmRole.ProjectManager && BadgeEmployeeIds.Contains(m.EmployeeId))
            .Select(m => m.EmployeeId).ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    private static PpmTeamMember ToMember(FakeFinancialProjectTeamMember m) => new(m.EmployeeId, m.Name, m.RoleName);
}
