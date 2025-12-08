using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.core.Domain;

namespace Server.Controllers;

[Authorize(Roles = Role.Names.System)]
public class SystemController : ApiControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok("ok");
    }
}
