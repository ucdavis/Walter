using AggieEnterpriseApi.Extensions;
using Microsoft.AspNetCore.Mvc;
using server.Helpers;
using server.Models;
using server.Services;

namespace Server.Controllers;

public sealed class ProjectController : ApiControllerBase
{
    private readonly IWebHostEnvironment _env;
    private readonly IFinancialApiService _financialApiService;
    private readonly IDatamartService _datamartService;
    private readonly ILogger<ProjectController> _logger;

    public ProjectController(
        IWebHostEnvironment env,
        IFinancialApiService financialApiService,
        IDatamartService datamartService,
        ILogger<ProjectController> logger)
    {
        _env = env;
        _financialApiService = financialApiService;
        _datamartService = datamartService;
        _logger = logger;
    }

    [HttpGet("{employeeId}")]
    public async Task<IActionResult> GetByEmployeeIdAsync(string employeeId, CancellationToken cancellationToken)
    {
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

        _logger.LogInformation("PI query for {EmployeeId}: {Count} projects from PPM API", employeeId, graphProjects.Count);
        foreach (var p in graphProjects)
        {
            var roles = string.Join(", ", p.TeamMembers.Select(m => $"{m.Name}({m.RoleName})"));
            _logger.LogInformation("  [{Project}] - Team: {Roles}", p.ProjectNumber, roles);
        }

        // Find orphaned projects where this employee is PM but no PI is assigned
        var pmData = (await pmResultTask).ReadData();
        var managedProjects = pmData.PpmProjectByProjectTeamMemberEmployeeId;
        var orphanedProjects = managedProjects
            .Where(p => !p.TeamMembers.Any(m => m.RoleName == PpmRole.PrincipalInvestigator))
            .ToList();

        _logger.LogInformation("PM query for {EmployeeId}: {Count} managed projects, {Orphaned} with no PI",
            employeeId, managedProjects.Count, orphanedProjects.Count);

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

        // Fetch projects and reconciliation data in parallel
        var projectsTask = _datamartService.GetFacultyPortfolioAsync(projectNumbers, applicationUser, cancellationToken);
        var reconciliationTask = _datamartService.GetGLPPMReconciliationAsync(projectNumbers, applicationUser, cancellationToken);

        await Task.WhenAll(projectsTask, reconciliationTask);

        var projects = await projectsTask;
        var reconciliation = await reconciliationTask;

        // Build lookup for GL totals by project number
        var glTotalsLookup = reconciliation
            .GroupBy(r => r.Project)
            .ToDictionary(g => g.Key, g => g.Sum(r => r.GlActualAmount));

        // Build lookup for PPM totals by project number
        var ppmTotalsLookup = projects
            .GroupBy(p => p.ProjectNumber)
            .ToDictionary(g => g.Key, g => g.Sum(p => p.CatBudget - p.CatItdExp));

        var activeProjects = projects
            .Where(p => p.ProjectStatus == "ACTIVE")
            .ToList();

        _logger.LogInformation("Faculty portfolio: {Total} total, {Active} active",
            projects.Count, activeProjects.Count);

        // Join PM employee ID and GL/PPM discrepancy flag to project records
        foreach (var project in activeProjects)
        {
            if (pmByProject.TryGetValue(project.ProjectNumber, out var pmEmployeeId))
            {
                project.PmEmployeeId = pmEmployeeId;
            }

            if (project.ProjectType == "Internal" &&
                glTotalsLookup.TryGetValue(project.ProjectNumber, out var glTotal) &&
                ppmTotalsLookup.TryGetValue(project.ProjectNumber, out var ppmTotal))
            {
                var diff = Math.Abs(glTotal + ppmTotal);
                project.HasGlPpmDiscrepancy = diff > 1;
            }
        }

        return Ok(activeProjects);
    }

    /// <summary>
    /// Gets all projects for the current authenticated user.
    /// TODO: For now, this will just read static data from a JSON file
    /// </summary>
    [HttpGet]
    public IActionResult GetAllForCurrentUser(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var path = Path.Combine(_env.ContentRootPath, "Models", "FacultyReportFake.json");
        var json = System.IO.File.ReadAllText(path);

        return Content(json, "application/json");
    }

    [HttpGet("personnel")]
    public async Task<IActionResult> GetPersonnelForProjects(
        CancellationToken cancellationToken,
        [FromQuery] string? projectCodes = null)
    {
        if (string.IsNullOrWhiteSpace(projectCodes))
            return Ok(Array.Empty<PositionBudgetRecord>());

        var codes = projectCodes.Split(',', StringSplitOptions.RemoveEmptyEntries);
        var applicationUser = User.GetUserIdentifier();
        var personnel = await _datamartService.GetPositionBudgetsAsync(codes, applicationUser, cancellationToken);

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
        var applicationUser = User.GetUserIdentifier();
        var transactions = await _datamartService.GetGLTransactionListingsAsync(codes, applicationUser, cancellationToken);

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
        var applicationUser = User.GetUserIdentifier();
        var reconciliation = await _datamartService.GetGLPPMReconciliationAsync(codes, applicationUser, cancellationToken);

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
        var client = _financialApiService.GetClient();

        // Query projects where the specified employee is a Project Manager
        var result = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId,
            PpmRole.ProjectManager,
            cancellationToken);

        var data = result.ReadData();
        var managedProjects = data.PpmProjectByProjectTeamMemberEmployeeId;

        _logger.LogInformation("Managed query for PM {EmployeeId}: {Count} projects from PPM API", employeeId, managedProjects.Count);
        foreach (var p in managedProjects)
        {
            var roles = string.Join(", ", p.TeamMembers.Select(m => $"{m.Name}[{m.RoleName},{m.EmployeeId}]"));
            _logger.LogInformation("  [{Project}] - Team: {Roles}", p.ProjectNumber, roles);
        }

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
}
