using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Helpers;

namespace Server.Controllers;

[Authorize(Policy = AuthorizationHelper.Policies.CanViewAccruals)]
public sealed class AccrualController : ApiControllerBase
{
    private readonly IWebHostEnvironment _env;

    public AccrualController(IWebHostEnvironment env)
    {
        _env = env;
    }


    /// <summary>
    /// Get all accruals. Requires AccrualViewer role.
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
