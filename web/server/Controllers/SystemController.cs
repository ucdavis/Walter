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

    [HttpGet("emulate/{identifier}")]
    public async Task<IActionResult> Emulate(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return BadRequest("Identifier is required.");
        }

        User? user;

        if (Guid.TryParse(identifier, out var userId))
        {
            user = await _userService.GetByIdAsync(userId);
        }
        else
        {
            user = await _userService.GetByEmployeeIdAsync(identifier);
            userId = user?.Id ?? Guid.Empty;
        }

        if (user == null)
        {
            return NotFound($"User '{identifier}' not found.");
        }

        var roles = await _userService.GetRolesForUser(userId);

        var claims = new List<Claim>
        {
            new(ClaimConstants.ObjectId, userId.ToString()),
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

        return Redirect("/");
    }

    [HttpGet("endemulate")]
    [Authorize] // Allow any authenticated user to end emulation (not just System role)
    [AllowAnonymous] // Actually, just sign them out regardless
    public async Task<IActionResult> EndEmulate()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

        return Ok("Emulation ended. Please log in again.");
    }
}
