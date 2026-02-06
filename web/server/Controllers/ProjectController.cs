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
        var result = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.PrincipalInvestigator, cancellationToken);

        var data = result.ReadData();
        var graphProjects = data.PpmProjectByProjectTeamMemberEmployeeId;
        var projectNumbers = graphProjects
            .Select(p => p.ProjectNumber)
            .Distinct()
            .ToList();

        if (!projectNumbers.Any())
            return Ok(Array.Empty<FacultyPortfolioRecord>());

        // Build lookup for PM employee ID by project number
        var pmByProject = graphProjects
            .ToDictionary(
                p => p.ProjectNumber,
                p => p.TeamMembers
                    .FirstOrDefault(m => m.RoleName == PpmRole.ProjectManager)?.EmployeeId);

        var applicationUser = User.GetUserIdentifier();

        // Fetch projects and reconciliation data in parallel
        var projectsTask = _datamartService.GetFacultyPortfolioAsync(projectNumbers, applicationUser, cancellationToken);
        var reconciliationTask = _datamartService.GetGLPPMReconciliationAsync(projectNumbers, applicationUser, cancellationToken);

        await Task.WhenAll(projectsTask, reconciliationTask);

        var projects = await projectsTask;
        var reconciliation = await reconciliationTask;

        _logger.LogInformation("Reconciliation: {Count} records returned", reconciliation.Count);

        // Build lookup for GL totals by project number
        var glTotalsLookup = reconciliation
            .GroupBy(r => r.Project)
            .ToDictionary(g => g.Key, g => g.Sum(r => r.GlTotalAmount));

        _logger.LogInformation("GL totals lookup: {Count} projects", glTotalsLookup.Count);
        foreach (var (proj, total) in glTotalsLookup.Take(5))
        {
            _logger.LogInformation("  GL [{Project}] = {Total}", proj, total);
        }

        // Build lookup for PPM totals by project number
        var ppmTotalsLookup = projects
            .GroupBy(p => p.ProjectNumber)
            .ToDictionary(g => g.Key, g => g.Sum(p => p.CatBudBal));

        _logger.LogInformation("PPM totals lookup: {Count} projects", ppmTotalsLookup.Count);
        foreach (var (proj, total) in ppmTotalsLookup.Take(5))
        {
            _logger.LogInformation("  PPM [{Project}] = {Total}", proj, total);
        }

        // Filter out inactive and expired projects
        var activeProjects = projects
            .Where(p => p.ProjectStatus == "ACTIVE")
            .Where(p => p.AwardEndDate == null || p.AwardEndDate >= DateTime.Today)
            .ToList();

        // Join PM employee ID and GL/PPM discrepancy flag to project records
        foreach (var project in activeProjects)
        {
            if (pmByProject.TryGetValue(project.ProjectNumber, out var pmEmployeeId))
            {
                project.PmEmployeeId = pmEmployeeId;
            }

            if (glTotalsLookup.TryGetValue(project.ProjectNumber, out var glTotal) &&
                ppmTotalsLookup.TryGetValue(project.ProjectNumber, out var ppmTotal))
            {
                var diff = Math.Abs(glTotal - ppmTotal);
                project.HasGlPpmDiscrepancy = diff > 1;
                _logger.LogInformation("Project {Project}: GL={GL}, PPM={PPM}, Diff={Diff}, Discrepancy={Discrepancy}",
                    project.ProjectNumber, glTotal, ppmTotal, diff, project.HasGlPpmDiscrepancy);
            }
            else
            {
                _logger.LogInformation("Project {Project}: No GL data found in lookup", project.ProjectNumber);
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

        // Extract unique Principal Investigators from all projects with project count
        var principalInvestigators = data.PpmProjectByProjectTeamMemberEmployeeId
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

        return Ok(principalInvestigators);
    }
}
