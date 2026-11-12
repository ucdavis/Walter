using AggieEnterpriseApi.Extensions;
using Microsoft.Extensions.Options;
using server.core.Models;
using server.core.Services;
using server.Helpers;

namespace server.Services;

/// <summary>Switches portfolio, authorization, and role synchronization membership reads between GraphQL and the imported snapshot.</summary>
public sealed class PpmPortfolioService(
    IFinancialApiService financialApi,
    IPpmPortfolioReader reader,
    IOptions<FeatureFlagOptions> flags)
{
    /// <summary>Returns project-or-award membership with project-team-only members.</summary>
    public async Task<IReadOnlyList<PpmProjectMembership>> GetEmployeeProjectsAsync(
        string employeeId, string roleName, CancellationToken ct)
    {
        if (!flags.Value.UseGraphQLAPI)
            return await reader.GetEmployeeProjectsAsync(employeeId, roleName, ct);

        var result = await financialApi.GetClient().PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(employeeId, roleName, ct);
        return result.ReadData().PpmProjectByProjectTeamMemberEmployeeId
            .Select(p => new PpmProjectMembership(p.ProjectNumber, p.Name,
                p.TeamMembers.Select(m => new PpmTeamMember(m.EmployeeId, m.Name, m.RoleName)).ToArray()))
            .ToArray();
    }

    /// <inheritdoc cref="IPpmPortfolioReader.GetProjectTeamAsync" />
    public async Task<IReadOnlyList<PpmTeamMember>> GetProjectTeamAsync(string projectNumber, string roleName, CancellationToken ct)
    {
        if (!flags.Value.UseGraphQLAPI)
            return await reader.GetProjectTeamAsync(projectNumber, roleName, ct);

        var result = await financialApi.GetClient().PpmProjectTeamMembers.ExecuteAsync(projectNumber, roleName, ct);
        return result.ReadData().PpmProjectByNumber?.TeamMembers?
            .Where(m => m.RoleName == roleName)
            .Select(m => new PpmTeamMember(m.Person?.EmployeeId ?? string.Empty, m.Name, m.RoleName))
            .ToArray() ?? [];
    }

    /// <summary>Returns PM membership for badges and role synchronization; imported mode queries the requested employees in batches.</summary>
    public async Task<IReadOnlySet<string>> GetProjectManagerEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct)
    {
        if (!flags.Value.UseGraphQLAPI)
            return await reader.GetProjectManagerEmployeeIdsAsync(employeeIds, ct);

        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var employeeId in employeeIds.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var projects = await financialApi.GetClient().PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(employeeId, PpmRole.ProjectManager, ct);
            if (projects.ReadData().PpmProjectByProjectTeamMemberEmployeeId.Any())
                result.Add(employeeId);
        }
        return result;
    }

    /// <summary>
    /// Checks whether the current user is a PI or PM on any project where the
    /// specified employee is a Principal Investigator.
    /// </summary>
    public async Task<bool> IsOnAnyProjectForPiAsync(
        string? requesterEmployeeId,
        string piEmployeeId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(requesterEmployeeId))
            return false;

        // Self-lookup is always allowed
        if (string.Equals(requesterEmployeeId, piEmployeeId, StringComparison.OrdinalIgnoreCase))
            return true;

        var projects = await GetEmployeeProjectsAsync(
            piEmployeeId, PpmRole.PrincipalInvestigator, cancellationToken);

        // The requester must be a project team member (PI or PM) on at least one of the
        // target's projects. Being award PI on a covering award is intentionally not
        // sufficient: it must not grant access to the target PI's portfolio (issue #335).
        return projects
            .Any(project =>
                project.TeamMembers.Any(m =>
                    (m.RoleName == PpmRole.PrincipalInvestigator || m.RoleName == PpmRole.ProjectManager) &&
                    string.Equals(m.EmployeeId, requesterEmployeeId, StringComparison.OrdinalIgnoreCase)));
    }
}
