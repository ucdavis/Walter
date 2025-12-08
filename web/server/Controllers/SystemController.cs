using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Web;
using server.core.Domain;
using Server.Services;

namespace Server.Controllers;

[Authorize(Roles = Role.Names.System)]
public class SystemController : ApiControllerBase
{
    private readonly IUserService _userService;

    public SystemController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpGet("emulate/{id:guid}")]
    public async Task<IActionResult> Emulate(Guid id)
    {
        var user = await _userService.GetByIdAsync(id);

        if (user == null)
        {
            return NotFound($"User with ID {id} not found.");
        }

        var roles = await _userService.GetRolesForUser(id);

        var claims = new List<Claim>
        {
            new(ClaimConstants.ObjectId, id.ToString()),
            new(ClaimTypes.Name, user.DisplayName ?? user.Kerberos),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new("kerberos", user.Kerberos),
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);

        return Ok($"Now emulating user: {user.DisplayName ?? user.Kerberos} ({user.Email})");
    }
}
