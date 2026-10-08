using server.core.Models;

namespace server.core.Services;

public interface IPpmPortfolioReader
{
    /// <summary>Finds all projects for an employee's PROJECT or AWARD role, without status/date filtering.</summary>
    Task<IReadOnlyList<PpmProjectMembership>> GetEmployeeProjectsAsync(string employeeId, string roleName, CancellationToken ct = default);

    /// <summary>
    /// Reads only PROJECT team members for PI resolution and caller authorization.
    /// Award-only membership cannot authorize navigation to another PI's portfolio.
    /// </summary>
    Task<IReadOnlyList<PpmTeamMember>> GetProjectTeamAsync(string projectNumber, string roleName, CancellationToken ct = default);

    /// <summary>Detects the requested employees' PM membership across project and award scopes in a batch.</summary>
    Task<IReadOnlySet<string>> GetProjectManagerEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct = default);
}
