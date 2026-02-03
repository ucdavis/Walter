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

    public ProjectController(
        IWebHostEnvironment env,
        IFinancialApiService financialApiService,
        IDatamartService datamartService)
    {
        _env = env;
        _financialApiService = financialApiService;
        _datamartService = datamartService;
    }

    [HttpGet("{employeeId}")]
    public async Task<IActionResult> GetByEmployeeIdAsync(string employeeId, CancellationToken cancellationToken)
    {
        var client = _financialApiService.GetClient();

        // Query projects where the specified employee is a Principal Investigator
        var result = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.PrincipalInvestigator, cancellationToken);

        var data = result.ReadData();
        var projectNumbers = data.PpmProjectByProjectTeamMemberEmployeeId
            .Select(p => p.ProjectNumber)
            .Distinct()
            .ToList();

        if (!projectNumbers.Any())
            return Ok(Array.Empty<FacultyPortfolioRecord>());

        var applicationUser = User.GetUserIdentifier();
        var projects = await _datamartService.GetFacultyPortfolioAsync(projectNumbers, applicationUser, cancellationToken);
        return Ok(projects);
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

    [HttpGet("transactions")]
    public IActionResult GetTransactionsForProjects(CancellationToken cancellationToken, [FromQuery] string projectCodes)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var path = Path.Combine(_env.ContentRootPath, "Models", "ProjectTransactionsFake.json");
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
