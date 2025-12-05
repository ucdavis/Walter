using DotEnv.Core;
using Microsoft.AspNetCore.Mvc;

namespace Server.Controllers;

public sealed class ProjectController : ApiControllerBase
{
    private readonly ILogger<ProjectController> _logger;
    private readonly IWebHostEnvironment _env;

    public ProjectController(ILogger<ProjectController> logger, IWebHostEnvironment env)
    {
        _logger = logger;
        _env = env;
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
}
