using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using Microsoft.Kiota.Abstractions;
using server.Helpers;
using server.core.Domain;
using server.core.Services;
using Server.Services;

namespace Server.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Policy = AuthorizationHelper.Policies.IsManager)]
public sealed class AdminUsersController : ControllerBase
{
    private readonly IGraphService _graphService;
    private readonly IUserService _userService;
    private readonly IIdentityService _identityService;
    private readonly ILogger<AdminUsersController> _logger;

    public AdminUsersController(
        IGraphService graphService,
        IUserService userService,
        IIdentityService identityService,
        ILogger<AdminUsersController> logger)
    {
        _graphService = graphService;
        _userService = userService;
        _identityService = identityService;
        _logger = logger;
    }

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<GraphUserSearchResult>>> SearchUsers(
        [FromQuery] string? query,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 3)
        {
            return Ok(Array.Empty<GraphUserSearchResult>());
        }

        try
        {
            var results = await _graphService.SearchUsersAsync(User, query, cancellationToken);
            return Ok(results);
        }
        catch (MicrosoftIdentityWebChallengeUserException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for user search.");
            return Unauthorized();
        }
        catch (MsalUiRequiredException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for user search.");
            return Unauthorized();
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Microsoft Graph user search failed.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unexpected error searching Microsoft Graph users.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    public sealed record AssignRoleRequest(string RoleName);

    public sealed record AdminManagedUser(
        Guid Id,
        string Name,
        string? Email,
        string EmployeeId,
        string Kerberos,
        string IamId,
        IReadOnlyList<string> Roles);

    public sealed record AssignRoleResponse(AdminManagedUser User, bool Added);

    [HttpPost("{entraUserId:guid}/roles")]
    public async Task<ActionResult<AssignRoleResponse>> AssignRole(
        Guid entraUserId,
        [FromBody] AssignRoleRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (entraUserId == Guid.Empty)
        {
            return BadRequest("Entra user ID is required.");
        }

        var roleName = request?.RoleName?.Trim();
        if (string.IsNullOrWhiteSpace(roleName))
        {
            return BadRequest("Role name is required.");
        }

        var allowed = new[] { Role.Names.Manager, Role.Names.AccrualViewer };
        if (!allowed.Contains(roleName, StringComparer.Ordinal))
        {
            return BadRequest($"Role '{roleName}' is not assignable via this endpoint.");
        }

        GraphUserProfile? profile;
        try
        {
            profile = await _graphService.GetUserProfileAsync(User, entraUserId.ToString(), cancellationToken);
        }
        catch (MicrosoftIdentityWebChallengeUserException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for user lookup.");
            return Unauthorized();
        }
        catch (MsalUiRequiredException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for user lookup.");
            return Unauthorized();
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Microsoft Graph user lookup failed.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        if (profile is null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(profile.Kerberos))
        {
            return BadRequest("Kerberos extension attribute is missing for the selected user.");
        }

        if (string.IsNullOrWhiteSpace(profile.IamId))
        {
            return BadRequest("IAMID extension attribute is missing for the selected user.");
        }

        IamIdentity? iamIdentity;
        try
        {
            iamIdentity = await _identityService.GetByIamId(profile.IamId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve IAM identity for IAM ID '{IamId}'.", profile.IamId);
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        if (iamIdentity is null)
        {
            return BadRequest($"IAM lookup failed for IAM ID '{profile.IamId}'.");
        }

        if (string.IsNullOrWhiteSpace(iamIdentity.EmployeeId))
        {
            return BadRequest($"Employee ID is missing for IAM ID '{profile.IamId}'.");
        }

        var userProfile = new UserProfileData
        {
            UserId = entraUserId,
            Kerberos = profile.Kerberos,
            IamId = profile.IamId,
            EmployeeId = iamIdentity.EmployeeId,
            DisplayName = iamIdentity.FullName ?? profile.DisplayName,
            Email = profile.Email,
        };

        await _userService.CreateOrUpdateUserAsync(userProfile, cancellationToken);

        var grantingUserId = User.GetUserId();
        var added = await _userService.AddRoleToUserAsync(entraUserId, roleName, grantingUserId, cancellationToken);
        var roles = await _userService.GetRolesForUser(entraUserId);

        var responseUser = new AdminManagedUser(
            Id: entraUserId,
            Name: userProfile.DisplayName ?? userProfile.Kerberos,
            Email: userProfile.Email,
            EmployeeId: userProfile.EmployeeId,
            Kerberos: userProfile.Kerberos,
            IamId: userProfile.IamId,
            Roles: roles);

        return Ok(new AssignRoleResponse(responseUser, added));
    }
}
