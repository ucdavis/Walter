namespace server.core.Models;

/// <summary>A project selected by project-team or award membership, with only its actual project team.</summary>
public sealed record PpmProjectMembership(
    string ProjectNumber, string Name, IReadOnlyList<PpmTeamMember> TeamMembers);

public sealed record PpmTeamMember(string EmployeeId, string Name, string RoleName);
