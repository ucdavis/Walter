using server.core.Models;

namespace server.core.Services;

public interface IPpmPortfolioReader
{
    /// <summary>Finds all projects for an employee's PROJECT or AWARD role, without status/date filtering.</summary>
    Task<IReadOnlyList<PpmProjectMembership>> GetEmployeeProjectsAsync(string employeeId, string roleName, CancellationToken ct = default);

    /// <summary>Reads only PROJECT team members; award personnel never participate in PI resolution.</summary>
    Task<IReadOnlyList<PpmTeamMember>> GetProjectTeamAsync(string projectNumber, string roleName, CancellationToken ct = default);

    /// <summary>Detects the requested employees' PM membership across project and award scopes in a batch.</summary>
    Task<IReadOnlySet<string>> GetProjectManagerEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct = default);
}
