using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;
using server.core.Models;
using server.core.Services;
using server.Helpers;
using server.Services;
using Server.Services;

namespace Server.Controllers;

public sealed class ProjectController : ApiControllerBase
{
    private readonly IDatamartService _datamartService;
    private readonly IAuthorizationService _authorizationService;
    private readonly IUserService _userService;
    private readonly PpmPortfolioService _portfolioService;

    public sealed record ManagedPiRecord(
        [property: JsonPropertyName("employeeId")] string EmployeeId,
        [property: JsonPropertyName("iamId")] string? IamId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("projectCount")] int ProjectCount);

    public sealed record ManagedPisProjectManager(
        [property: JsonPropertyName("employeeId")] string EmployeeId,
        [property: JsonPropertyName("iamId")] string IamId,
        [property: JsonPropertyName("name")] string? Name);

    public sealed record ManagedPisEnvelope(
        [property: JsonPropertyName("projectManager")] ManagedPisProjectManager? ProjectManager,
        [property: JsonPropertyName("pis")] IReadOnlyList<ManagedPiRecord> Pis);

    public ProjectController(
        IDatamartService datamartService,
        IAuthorizationService authorizationService,
        IUserService userService,
        PpmPortfolioService portfolioService)
    {
        _datamartService = datamartService;
        _authorizationService = authorizationService;
        _userService = userService;
        _portfolioService = portfolioService;
    }

    [HttpGet("by-iam/{iamId}")]
    public async Task<IActionResult> GetByIamIdAsync(string iamId, CancellationToken cancellationToken)
    {
        // Check if the user has financial access
        var hasFinancialAccess = (await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            policyName: AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

        var person = await _datamartService.GetSearchablePersonByIamIdAsync(iamId, cancellationToken);
        if (person is null)
        {
            // Non-financial callers should not be able to distinguish unknown IAM IDs from inaccessible portfolios.
            return hasFinancialAccess ? NotFound() : Forbid();
        }

        var employeeId = person.EmployeeId;

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

        var piTask = _portfolioService.GetEmployeeProjectsAsync(employeeId, PpmRole.PrincipalInvestigator, cancellationToken);
        var pmTask = _portfolioService.GetEmployeeProjectsAsync(employeeId, PpmRole.ProjectManager, cancellationToken);
        await Task.WhenAll(piTask, pmTask);
        var piProjects = await piTask;
        var managedProjects = await pmTask;

        // PM projects without a project PI belong in the PM's own portfolio.
        var orphanedProjects = managedProjects
            .Where(p => !p.TeamMembers.Any(m => m.RoleName == PpmRole.PrincipalInvestigator))
            .ToList();

        var piProjectNumbers = piProjects.Select(p => p.ProjectNumber).Distinct();
        var orphanedProjectNumbers = orphanedProjects.Select(p => p.ProjectNumber).Distinct();
        var projectNumbers = piProjectNumbers.Union(orphanedProjectNumbers).ToList();

        if (!projectNumbers.Any())
            return Ok(Array.Empty<FacultyPortfolioRecord>());

        // Build lookup for PM employee ID by project number (from both PI and orphaned projects)
        var pmByProject = piProjects
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

        // Award-only owners may not appear on a project team; preserve the nullable owner name.
        var ownerName = piProjects.Concat(orphanedProjects)
            .SelectMany(p => p.TeamMembers)
            .FirstOrDefault(m => m.EmployeeId == employeeId)?.Name;

        // Join PM employee ID from project-team data
        foreach (var project in activeProjects)
        {
            if (pmByProject.TryGetValue(project.ProjectNumber, out var pmEmployeeId))
            {
                project.PmEmployeeId = pmEmployeeId;
            }
            project.OwnerName = ownerName;
        }

        return Ok(activeProjects);
    }

    [HttpGet("byNumber")]
    public async Task<IActionResult> GetByProjectNumberAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<FacultyPortfolioRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries);

        if (!await CallerCanAccessProjectsAsync(codes, cancellationToken))
        {
            return Forbid();
        }

        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var projects = await _datamartService.GetFacultyPortfolioAsync(codes, applicationUser, emulatingUser, cancellationToken);

        return Ok(projects.Where(p => p.ProjectStatus == "ACTIVE").ToList());
    }

    [HttpGet("personnel")]
    public async Task<IActionResult> GetPersonnelForProjects(
        CancellationToken cancellationToken,
        [FromQuery] string? iamId = null,
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
            if (string.IsNullOrWhiteSpace(iamId))
            {
                return BadRequest("iamId is required.");
            }

            var person = await _datamartService.GetSearchablePersonByIamIdAsync(iamId, cancellationToken);
            if (person is null)
            {
                // Keep missing IAM IDs indistinguishable from inaccessible personnel for restricted callers.
                return Forbid();
            }

            var currentEmployeeId = await GetCurrentEmployeeIdAsync(cancellationToken);
            if (!await IsOnAnyProjectForPiAsync(currentEmployeeId, person.EmployeeId, cancellationToken))
            {
                return Forbid();
            }

            var accessibleProjectNumbers = await GetAccessibleProjectNumbersForEmployeeAsync(person.EmployeeId, cancellationToken);
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

    [HttpGet("transactions")]
    public async Task<IActionResult> GetTransactionsForProjectsAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<GLTransactionRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries);

        if (!await CallerCanAccessProjectsAsync(codes, cancellationToken))
        {
            return Forbid();
        }

        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var transactions = await _datamartService.GetGLTransactionListingsAsync(codes, applicationUser, emulatingUser, cancellationToken);

        return Ok(transactions);
    }

    [HttpGet("gl-ppm-reconciliation")]
    public async Task<IActionResult> GetGLPPMReconciliationAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<GLPPMReconciliationRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries);

        if (!await CallerCanAccessProjectsAsync(codes, cancellationToken))
        {
            return Forbid();
        }

        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var reconciliation = await _datamartService.GetGLPPMReconciliationAsync(codes, applicationUser, emulatingUser, cancellationToken);

        return Ok(reconciliation);
    }

    [HttpGet("projection/{projectNumber}")]
    public async Task<IActionResult> GetProjectionAsync(
        string projectNumber, CancellationToken cancellationToken, [FromQuery] int historyMonths = 3)
    {
        if (string.IsNullOrWhiteSpace(projectNumber))
        {
            return BadRequest("projectNumber is required.");
        }

        if (historyMonths is not (3 or 6 or 12))
        {
            return BadRequest("historyMonths must be 3, 6, or 12.");
        }

        if (!await CallerCanAccessProjectsAsync(new[] { projectNumber }, cancellationToken))
        {
            return Forbid();
        }

        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var projection = await _datamartService.GetProjectProjectionAsync(
            projectNumber, historyMonths, applicationUser, emulatingUser, cancellationToken);

        return Ok(projection);
    }

    /// <summary>
    /// Gets a unique list of Principal Investigators for all projects managed by the specified Person.
    /// </summary>
    /// <param name="iamId">The IAM ID of the Project Manager</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>A unique list of Principal Investigators with Employee ID for transitional logic and nullable IAM ID for navigation.</returns>
    [HttpGet("managed/by-iam/{iamId}")]
    public async Task<IActionResult> GetManagedFaculty(string iamId, CancellationToken cancellationToken)
    {
        var hasFinancialAccess = (await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            policyName: AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

        var projectManagerPerson = await _datamartService.GetSearchablePersonByIamIdAsync(iamId, cancellationToken);
        if (projectManagerPerson is null)
        {
            // Match the non-self response below so restricted callers cannot enumerate IAM IDs.
            return hasFinancialAccess ? NotFound() : EmptyManagedFacultyResult();
        }

        var employeeId = projectManagerPerson.EmployeeId;

        if (!hasFinancialAccess)
        {
            var currentEmployeeId = await GetCurrentEmployeeIdAsync(cancellationToken);
            var isSelf = string.Equals(currentEmployeeId, employeeId, StringComparison.OrdinalIgnoreCase);

            if (!isSelf)
            {
                return EmptyManagedFacultyResult();
            }
        }

        var managedProjects = await _portfolioService.GetEmployeeProjectsAsync(
            employeeId, PpmRole.ProjectManager, cancellationToken);

        // Look up the PM's name from any team they appear on
        var pmMember = managedProjects
            .SelectMany(p => p.TeamMembers)
            .FirstOrDefault(m => m.EmployeeId == employeeId);

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
            var orphanedPiName = pmMember?.Name ?? "Unassigned PI";

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
                    name = orphanedPiName,
                    employeeId,
                    projectCount = orphanedProjectCount
                });
            }

            principalInvestigators = principalInvestigators.OrderBy(pi => pi.name).ToList();
        }

        var peopleByEmployeeId = (await _datamartService.GetSearchablePeopleByEmployeeIdsAsync(
                principalInvestigators.Select(pi => pi.employeeId).Append(employeeId),
                cancellationToken))
            .ToDictionary(p => p.EmployeeId, StringComparer.OrdinalIgnoreCase);

        var managedPiRecords = principalInvestigators
            .Select(pi =>
            {
                peopleByEmployeeId.TryGetValue(pi.employeeId, out var person);
                return new ManagedPiRecord(
                    pi.employeeId,
                    person?.IamId,
                    pi.name,
                    pi.projectCount);
            })
            .OrderBy(pi => pi.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return Ok(new ManagedPisEnvelope(
            new ManagedPisProjectManager(employeeId, projectManagerPerson.IamId, pmMember?.Name),
            managedPiRecords));
    }

    private IActionResult EmptyManagedFacultyResult()
    {
        return Ok(new ManagedPisEnvelope(
            ProjectManager: null,
            Pis: Array.Empty<ManagedPiRecord>()));
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

    /// <summary>
    /// Returns true if the caller has CanViewFinancials, or if they are PI/PM
    /// on every requested project. Used by endpoints that need to surface
    /// project data to PMs viewing their PIs' projects.
    /// </summary>
    private async Task<bool> CallerCanAccessProjectsAsync(
        string[] requestedProjectCodes,
        CancellationToken cancellationToken)
    {
        var hasFinancialAccess = (await _authorizationService.AuthorizeAsync(
            User,
            resource: null,
            policyName: AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

        if (hasFinancialAccess)
        {
            return true;
        }

        var currentEmployeeId = await GetCurrentEmployeeIdAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(currentEmployeeId))
        {
            return false;
        }

        var accessibleProjectNumbers = await GetAccessibleProjectNumbersForEmployeeAsync(currentEmployeeId, cancellationToken);
        var requestedProjectNumbers = new HashSet<string>(requestedProjectCodes, StringComparer.OrdinalIgnoreCase);

        return requestedProjectNumbers.IsSubsetOf(accessibleProjectNumbers);
    }

    /// <summary>Includes both project and award PI/PM roles for individual project access.</summary>
    private async Task<HashSet<string>> GetAccessibleProjectNumbersForEmployeeAsync(
        string employeeId,
        CancellationToken cancellationToken)
    {
        var piResultTask = _portfolioService.GetEmployeeProjectsAsync(
            employeeId, PpmRole.PrincipalInvestigator, cancellationToken);
        var pmResultTask = _portfolioService.GetEmployeeProjectsAsync(
            employeeId, PpmRole.ProjectManager, cancellationToken);

        await Task.WhenAll(piResultTask, pmResultTask);

        return (await piResultTask)
            .Concat(await pmResultTask)
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

        var projects = await _portfolioService.GetEmployeeProjectsAsync(
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
