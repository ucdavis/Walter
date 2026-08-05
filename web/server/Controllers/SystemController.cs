using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;
using server.core.Domain;
using server.core.Services;
using server.Helpers;
using Server.Services;

namespace Server.Controllers;

[Authorize(Policy = AuthorizationHelper.Policies.IsSystem)]
public class SystemController : ApiControllerBase
{
    private readonly IUserService _userService;
    private readonly IGraphService _graphService;
    private readonly IDatamartService _datamartService;
    private readonly IUserProfileOrchestrator _profileOrchestrator;
    private readonly RumOptions _rumOptions;
    private readonly FeatureFlagOptions _featureFlags;
    private readonly IHostEnvironment _hostEnvironment;

    public SystemController(
        IUserService userService,
        IGraphService graphService,
        IDatamartService datamartService,
        IUserProfileOrchestrator profileOrchestrator,
        IOptions<RumOptions> rumOptions,
        IOptions<FeatureFlagOptions> featureFlags,
        IHostEnvironment hostEnvironment)
    {
        _userService = userService;
        _graphService = graphService;
        _datamartService = datamartService;
        _profileOrchestrator = profileOrchestrator;
        _rumOptions = rumOptions.Value;
        _featureFlags = featureFlags.Value;
        _hostEnvironment = hostEnvironment;
    }

    [AllowAnonymous]
    [HttpGet("rum-config")]
    public ActionResult<RumPublicConfig> GetRumConfig()
    {
        return Ok(_rumOptions.ToPublicConfig(_hostEnvironment));
    }

    /// <summary>
    /// Environment feature flags the SPA reads at load to decide which optional features to show.
    /// Anonymous + non-sensitive, mirroring rum-config.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("features")]
    public ActionResult<ClientFeatures> GetFeatures()
    {
        return Ok(new ClientFeatures(
            _featureFlags.BurndownEnabled,
            _featureFlags.ExpenditureProgressEnabled));
    }

    [HttpGet("emulate/{identifier}")]
    public async Task<IActionResult> Emulate(
        string identifier,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return BadRequest("Identifier is required.");
        }

        var normalizedIdentifier = identifier.Trim();

        // Block chained emulation — end current emulation first
        if (User.FindFirst("emulating_user") != null)
        {
            return BadRequest("Already emulating a user. End the current emulation before starting a new one.");
        }

        // Preserve the actual user's identity for audit logging
        var actualUserIdentifier = User.GetUserIdentifier();

        User? user;

        if (Guid.TryParse(normalizedIdentifier, out var userId))
        {
            user = await _userService.GetByIdAsync(userId, cancellationToken);
        }
        else
        {
            user = await _userService.GetByEmployeeIdAsync(normalizedIdentifier, cancellationToken);
            userId = user?.Id ?? Guid.Empty;
        }

        if (user == null)
        {
            user = await ProvisionEmulationUserAsync(
                normalizedIdentifier,
                userId == Guid.Empty ? null : userId,
                cancellationToken);
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

        if (!string.IsNullOrEmpty(actualUserIdentifier))
        {
            claims.Add(new Claim("emulating_user", actualUserIdentifier));
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);

        return Redirect("/");
    }

    private async Task<User?> ProvisionEmulationUserAsync(
        string identifier,
        Guid? entraUserId,
        CancellationToken cancellationToken)
    {
        GraphUserProfile? graphProfile;
        string? fallbackIamId = null;

        if (entraUserId.HasValue)
        {
            graphProfile = await _graphService.GetUserProfileAsync(
                User,
                entraUserId.Value.ToString(),
                cancellationToken);
        }
        else
        {
            var person = await _datamartService.GetSearchablePersonByEmployeeIdAsync(
                identifier,
                cancellationToken);
            if (person is null || string.IsNullOrWhiteSpace(person.Email))
            {
                return null;
            }

            fallbackIamId = person.IamId;
            graphProfile = await _graphService.FindUserByEmailAsync(
                User,
                person.Email,
                cancellationToken);
        }

        if (graphProfile is null || !Guid.TryParse(graphProfile.Id, out var resolvedUserId))
        {
            return null;
        }

        var iamId = graphProfile.IamId?.Trim();
        if (string.IsNullOrWhiteSpace(iamId) && !string.IsNullOrWhiteSpace(graphProfile.Email))
        {
            var person = await _datamartService.GetSearchablePersonByEmailAsync(
                graphProfile.Email,
                cancellationToken);
            if (string.IsNullOrWhiteSpace(fallbackIamId))
            {
                fallbackIamId = person?.IamId;
            }
        }

        iamId = string.IsNullOrWhiteSpace(iamId) ? fallbackIamId?.Trim() : iamId;
        if (string.IsNullOrWhiteSpace(iamId))
        {
            return null;
        }

        // Supply the target's IAM claim so profile creation never acquires Graph tokens
        // for this synthetic principal; the acting System user's principal performed the lookup above.
        var claims = new List<Claim>
        {
            new(ClaimConstants.ObjectId, resolvedUserId.ToString()),
            new(server.Helpers.ClaimsPrincipalExtensions.IamIdClaimType, iamId),
        };

        if (!string.IsNullOrWhiteSpace(graphProfile.Email))
        {
            claims.Add(new Claim("preferred_username", graphProfile.Email));
            claims.Add(new Claim(ClaimTypes.Email, graphProfile.Email));
        }

        var targetPrincipal = new ClaimsPrincipal(
            new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));

        await _profileOrchestrator.EnsureUserProfileAsync(
            resolvedUserId,
            resolvedUserId.ToString(),
            targetPrincipal,
            cancellationToken);

        return await _userService.GetByIdAsync(resolvedUserId, cancellationToken);
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

/// <summary>Environment feature flags surfaced to the SPA via GET /api/system/features.</summary>
public sealed record ClientFeatures(bool BurndownEnabled, bool ExpenditureProgressEnabled);
