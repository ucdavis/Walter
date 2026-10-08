using AggieEnterpriseApi.Extensions;
using Microsoft.Extensions.Options;
using server.core.Models;
using server.core.Services;
using server.Helpers;

namespace server.Services;

/// <summary>Switches portfolio display reads between GraphQL and the imported snapshot. Authorization and role sync retain their own legacy reads.</summary>
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

    /// <summary>Returns actual project-team members for navigation, excluding award personnel.</summary>
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

    /// <summary>Returns PM badge membership; imported mode queries the requested employees in batches.</summary>
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
}
