using AggieEnterpriseApi.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Helpers;
using server.Models;
using server.Services;
using Server.Services;

namespace Server.Controllers;

public sealed class ProjectController : ApiControllerBase
{
    private readonly IFinancialApiService _financialApiService;
    private readonly IDatamartService _datamartService;
    private readonly IAuthorizationService _authorizationService;
    private readonly IUserService _userService;
    public ProjectController(
        IFinancialApiService financialApiService,
        IDatamartService datamartService,
        IAuthorizationService authorizationService,
        IUserService userService)
    {
        _financialApiService = financialApiService;
        _datamartService = datamartService;
        _authorizationService = authorizationService;
        _userService = userService;
    }

    [HttpGet("{employeeId}")]
    public async Task<IActionResult> GetByEmployeeIdAsync(string employeeId, CancellationToken cancellationToken)
    {
        // Check if the user has financial access
        var hasFinancialAccess = (await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            policyName: AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

        // If no financial access, verify the current user is PI or PM on at least one
        // of the requested employee's projects (covers both self-lookup and PM-views-PI)
        if (!hasFinancialAccess)
        {
            var currentEmployeeId = await GetCurrentEmployeeIdAsync(cancellationToken);
            var isOnProject = await IsOnAnyProjectForPiAsync(currentEmployeeId, employeeId, cancellationToken);

            if (!isOnProject)
            {
                return Forbid();
            }
        }

        var client = _financialApiService.GetClient();

        // Query projects where the specified employee is a Principal Investigator
        var piResultTask = client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.PrincipalInvestigator, cancellationToken);

        // Also query projects where the employee is a Project Manager (to find orphaned projects with no PI)
        var pmResultTask = client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.ProjectManager, cancellationToken);

        await Task.WhenAll(piResultTask, pmResultTask);

        var piData = (await piResultTask).ReadData();
        var graphProjects = piData.PpmProjectByProjectTeamMemberEmployeeId;

        // Find orphaned projects where this employee is PM but no PI is assigned
        var pmData = (await pmResultTask).ReadData();
        var managedProjects = pmData.PpmProjectByProjectTeamMemberEmployeeId;
        var orphanedProjects = managedProjects
            .Where(p => !p.TeamMembers.Any(m => m.RoleName == PpmRole.PrincipalInvestigator))
            .ToList();

        var piProjectNumbers = graphProjects.Select(p => p.ProjectNumber).Distinct();
        var orphanedProjectNumbers = orphanedProjects.Select(p => p.ProjectNumber).Distinct();
        var projectNumbers = piProjectNumbers.Union(orphanedProjectNumbers).ToList();

        if (!projectNumbers.Any())
            return Ok(Array.Empty<FacultyPortfolioRecord>());

        // Build lookup for PM employee ID by project number (from both PI and orphaned projects)
        var pmByProject = graphProjects
            .Concat(orphanedProjects)
            .GroupBy(p => p.ProjectNumber)
            .ToDictionary(
                g => g.Key,
                g => g.First().TeamMembers
                    .FirstOrDefault(m => m.RoleName == PpmRole.ProjectManager)?.EmployeeId);

        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var projects = await _datamartService.GetFacultyPortfolioAsync(projectNumbers, applicationUser, emulatingUser, cancellationToken);

        var activeProjects = projects
            .Where(p => p.ProjectStatus == "ACTIVE")
            .ToList();

        // Join PM employee ID from GraphQL data
        foreach (var project in activeProjects)
        {
            if (pmByProject.TryGetValue(project.ProjectNumber, out var pmEmployeeId))
            {
                project.PmEmployeeId = pmEmployeeId;
            }
        }

        return Ok(activeProjects);
    }

    [Authorize(Policy = AuthorizationHelper.Policies.CanViewFinancials)]
    [HttpGet("byNumber")]
    public async Task<IActionResult> GetByProjectNumberAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<FacultyPortfolioRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries);
        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var projects = await _datamartService.GetFacultyPortfolioAsync(codes, applicationUser, emulatingUser, cancellationToken);

        return Ok(projects.Where(p => p.ProjectStatus == "ACTIVE").ToList());
    }

    [HttpGet("personnel")]
    public async Task<IActionResult> GetPersonnelForProjects(
        CancellationToken cancellationToken,
        [FromQuery] string? employeeId = null,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<PositionBudgetRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (codes.Length == 0)
        {
            return Ok(Array.Empty<PositionBudgetRecord>());
        }

        var hasFinancialAccess = (await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            policyName: AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

        if (!hasFinancialAccess)
        {
            if (string.IsNullOrWhiteSpace(employeeId))
            {
                return BadRequest("employeeId is required.");
            }

            var currentEmployeeId = await GetCurrentEmployeeIdAsync(cancellationToken);
            if (!await IsOnAnyProjectForPiAsync(currentEmployeeId, employeeId, cancellationToken))
            {
                return Forbid();
            }

            var accessibleProjectNumbers = await GetAccessibleProjectNumbersForEmployeeAsync(employeeId, cancellationToken);
            var requestedProjectNumbers = new HashSet<string>(codes, StringComparer.OrdinalIgnoreCase);

            if (!requestedProjectNumbers.IsSubsetOf(accessibleProjectNumbers))
            {
                return Forbid();
            }
        }

        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var personnel = await _datamartService.GetPositionBudgetsAsync(codes, applicationUser, emulatingUser, cancellationToken);

        return Ok(personnel);
    }

    [Authorize(Policy = AuthorizationHelper.Policies.CanViewFinancials)]
    [HttpGet("transactions")]
    public async Task<IActionResult> GetTransactionsForProjectsAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<GLTransactionRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries);
        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var transactions = await _datamartService.GetGLTransactionListingsAsync(codes, applicationUser, emulatingUser, cancellationToken);

        return Ok(transactions);
    }

    [Authorize(Policy = AuthorizationHelper.Policies.CanViewFinancials)]
    [HttpGet("gl-ppm-reconciliation")]
    public async Task<IActionResult> GetGLPPMReconciliationAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<GLPPMReconciliationRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries);
        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var reconciliation = await _datamartService.GetGLPPMReconciliationAsync(codes, applicationUser, emulatingUser, cancellationToken);

        return Ok(reconciliation);
    }

    /// <summary>
    /// Gets a unique list of Principal Investigators for all projects managed by the specified employee.
    /// </summary>
    /// <param name="employeeId">The employee ID of the Project Manager</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>A unique list of Principal Investigators with their name and employee ID</returns>
    [HttpGet("managed/{employeeId}")]
    public async Task<IActionResult> GetManagedFaculty(string employeeId, CancellationToken cancellationToken)
    {
        var hasFinancialAccess = (await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            policyName: AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

        if (!hasFinancialAccess)
        {
            var currentEmployeeId = await GetCurrentEmployeeIdAsync(cancellationToken);
            var isSelf = string.Equals(currentEmployeeId, employeeId, StringComparison.OrdinalIgnoreCase);

            if (!isSelf)
            {
                return Ok(Array.Empty<object>());
            }
        }

        var client = _financialApiService.GetClient();

        // Query projects where the specified employee is a Project Manager
        var result = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId,
            PpmRole.ProjectManager,
            cancellationToken);

        var data = result.ReadData();
        var managedProjects = data.PpmProjectByProjectTeamMemberEmployeeId;

        // Find projects that have no PI assigned
        var orphanedProjectCount = managedProjects
            .Where(p => !p.TeamMembers.Any(m => m.RoleName == PpmRole.PrincipalInvestigator))
            .Select(p => p.ProjectNumber)
            .Distinct()
            .Count();

        // Extract unique Principal Investigators from all projects with project count
        var principalInvestigators = managedProjects
            .SelectMany(project => project.TeamMembers.Select(member => new { project.ProjectNumber, Member = member }))
            .Where(x => x.Member.RoleName == PpmRole.PrincipalInvestigator)
            .GroupBy(x => x.Member.EmployeeId)
            .Select(group => new
            {
                name = group.First().Member.Name,
                employeeId = group.Key,
                projectCount = group.Select(x => x.ProjectNumber).Distinct().Count()
            })
            .OrderBy(pi => pi.name)
            .ToList();

        // Include the PM themselves for orphaned projects (no PI assigned)
        if (orphanedProjectCount > 0)
        {
            var pmMember = managedProjects
                .SelectMany(p => p.TeamMembers)
                .FirstOrDefault(m => m.EmployeeId == employeeId);

            var pmName = pmMember?.Name ?? "Unassigned PI";

            // Add or merge with existing entry if the PM is also a PI on other projects
            var existingEntry = principalInvestigators.FirstOrDefault(pi => pi.employeeId == employeeId);
            if (existingEntry != null)
            {
                principalInvestigators.Remove(existingEntry);
                principalInvestigators.Add(new
                {
                    name = existingEntry.name,
                    employeeId,
                    projectCount = existingEntry.projectCount + orphanedProjectCount
                });
            }
            else
            {
                principalInvestigators.Add(new
                {
                    name = pmName,
                    employeeId,
                    projectCount = orphanedProjectCount
                });
            }

            principalInvestigators = principalInvestigators.OrderBy(pi => pi.name).ToList();
        }

        return Ok(principalInvestigators);
    }

    private async Task<string?> GetCurrentEmployeeIdAsync(CancellationToken cancellationToken)
    {
        Guid userId;
        try
        {
            userId = User.GetUserId();
        }
        catch (InvalidOperationException)
        {
            return null;
        }

        var currentUser = await _userService.GetByIdAsync(userId, cancellationToken);
        return currentUser?.EmployeeId;
    }

    private async Task<HashSet<string>> GetAccessibleProjectNumbersForEmployeeAsync(
        string employeeId,
        CancellationToken cancellationToken)
    {
        var client = _financialApiService.GetClient();

        var piResult = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.PrincipalInvestigator, cancellationToken);
        var piData = piResult.ReadData();

        return piData.PpmProjectByProjectTeamMemberEmployeeId
            .Select(p => p.ProjectNumber?.Trim())
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Checks whether the current user is a PI or PM on any project where the
    /// specified employee is a Principal Investigator.
    /// </summary>
    private async Task<bool> IsOnAnyProjectForPiAsync(
        string? requesterEmployeeId,
        string piEmployeeId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(requesterEmployeeId))
            return false;

        // Self-lookup is always allowed
        if (string.Equals(requesterEmployeeId, piEmployeeId, StringComparison.OrdinalIgnoreCase))
            return true;

        var client = _financialApiService.GetClient();

        var piResult = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            piEmployeeId, PpmRole.PrincipalInvestigator, cancellationToken);
        var piData = piResult.ReadData();

        // Check if the requester is PI or PM on any of those projects
        return piData.PpmProjectByProjectTeamMemberEmployeeId
            .Any(project => project.TeamMembers
                .Any(m => (m.RoleName == PpmRole.PrincipalInvestigator || m.RoleName == PpmRole.ProjectManager) &&
                          string.Equals(m.EmployeeId, requesterEmployeeId, StringComparison.OrdinalIgnoreCase)));
    }
}
