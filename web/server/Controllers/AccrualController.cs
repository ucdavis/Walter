using DotEnv.Core;
using Microsoft.AspNetCore.Mvc;

namespace Server.Controllers;

public sealed class AccrualController : ApiControllerBase
{
    private readonly ILogger<AccrualController> _logger;
    private readonly IWebHostEnvironment _env;

    public AccrualController(ILogger<AccrualController> logger, IWebHostEnvironment env)
    {
        _logger = logger;
        _env = env;
    }


    /// <summary>
    /// Get all accruals
    /// TODO: who can access this, what depts can they see, etc.
    /// </summary>
    /// <param name="cancellationToken"></param>
    /// <returns></returns>
    [HttpGet]
    public IActionResult Get(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var path = Path.Combine(_env.ContentRootPath, "Models", "AccrualFake.json");
        var json = System.IO.File.ReadAllText(path);

        return Content(json, "application/json");
    }
}
