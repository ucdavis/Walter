using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Server.Demo;

namespace Server.Controllers;

public sealed class DemoController(DemoRequestContext demo, IAntiforgery antiforgery) : ApiControllerBase
{
    [HttpGet]
    [AllowAnonymous]
    public IActionResult Status() => Ok(new
    {
        CanStart = demo.CanStart,
        IsActive = demo.IsActive,
        Profile = demo.Profile,
        RequestToken = antiforgery.GetAndStoreTokens(HttpContext).RequestToken,
    });

    [HttpPost("start/{profile}")]
    public async Task<IActionResult> Start(string profile)
    {
        if (!await IsValidRequestAsync()) return BadRequest("Invalid presentation request.");
        if (!demo.CanStart) return Forbid();
        if (DemoDataSet.GetProfile(profile) is null) return BadRequest("Unknown presentation profile.");
        return demo.Start(profile) ? NoContent() : Conflict(new { code = "presentation_session_invalid" });
    }

    [HttpPost("stop")]
    [AllowAnonymous]
    public async Task<IActionResult> Stop()
    {
        if (!await IsValidRequestAsync()) return BadRequest("Invalid presentation request.");
        // Explicit exit must work even after the real sign-in expires; it only removes the presentation cookie.
        demo.Stop();
        return NoContent();
    }

    /// <summary>Both cookie-changing actions require CSRF validation, including anonymous recovery.</summary>
    private async Task<bool> IsValidRequestAsync()
    {
        try
        {
            await antiforgery.ValidateRequestAsync(HttpContext);
            return true;
        }
        catch (AntiforgeryValidationException)
        {
            return false;
        }
    }
}
