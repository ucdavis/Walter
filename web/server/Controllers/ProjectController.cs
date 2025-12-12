using AggieEnterpriseApi.Extensions;
using DotEnv.Core;
using Microsoft.AspNetCore.Mvc;
using server.Helpers;
using server.Services;

namespace Server.Controllers;

public sealed class ProjectController : ApiControllerBase
{
    private readonly ILogger<ProjectController> _logger;
    private readonly IWebHostEnvironment _env;
    private readonly DmConnectionHelper _dmConnection;
    private readonly IFinancialApiService _financialApiService;

    public ProjectController(
        ILogger<ProjectController> logger,
        IWebHostEnvironment env,
        DmConnectionHelper dmConnection,
        IFinancialApiService financialApiService)
    {
        _logger = logger;
        _env = env;
        _dmConnection = dmConnection;
        _financialApiService = financialApiService;
    }

    [HttpGet("{employeeId}")]
    public async Task<IActionResult> GetByEmployeeIdAsync(string employeeId, CancellationToken cancellationToken)
    {
        var client = _financialApiService.GetClient();

        // Query projects where the specified employee is a Principal Investigator
        var result = await client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(employeeId, PpmRole.PrincipalInvestigator, cancellationToken);

        var data = result.ReadData();

        var projectNumbers = data.PpmProjectByProjectTeamMemberEmployeeId.Select(p => p.ProjectNumber).Distinct().ToList();

        var sql = QueryService.FormatQueryWithList("FacultyProjectReport", projectNumbers);

        var results = await _dmConnection.QueryAsync<object>(sql, ct: cancellationToken);

        return Ok(results);
    }

    /// <summary>
    /// Gets all projects for the current authenticated user.
    /// TODO: For now, this will just read static data from a JSON file representing info from `ae_dwh.ucd_faculty_rpt_tae_dwh.ucd_faculty_rpt_t`
    /// </summary>
    /// <param name="cancellationToken"></param>
    /// <returns></returns>
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
    public IActionResult GetPersonnelForProjects(CancellationToken cancellationToken, [FromQuery] string projectCodes)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var path = Path.Combine(_env.ContentRootPath, "Models", "ProjectPersonnelFake.json");
        var json = System.IO.File.ReadAllText(path);

        return Content(json, "application/json");
    }
}
