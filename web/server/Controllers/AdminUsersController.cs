using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using Microsoft.Kiota.Abstractions;
using server.Helpers;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using Server.Services;

namespace Server.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Policy = AuthorizationHelper.Policies.IsManager)]
public sealed class AdminUsersController : ApiControllerBase
{
    private const int SearchResultLimit = 25;
    private readonly IGraphService _graphService;
    private readonly IUserService _userService;
    private readonly IIdentityService _identityService;
    private readonly IDatamartService _datamartService;
    private readonly ILogger<AdminUsersController> _logger;

    public AdminUsersController(
        IGraphService graphService,
        IUserService userService,
        IIdentityService identityService,
        IDatamartService datamartService,
        ILogger<AdminUsersController> logger)
    {
        _graphService = graphService;
        _userService = userService;
        _identityService = identityService;
        _datamartService = datamartService;
        _logger = logger;
    }

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<SearchablePersonRecord>>> SearchUsers(
        [FromQuery] string? query,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 3)
        {
            return Ok(Array.Empty<SearchablePersonRecord>());
        }

        var people = await _datamartService.SearchPeopleAsync(query.Trim(), SearchResultLimit, cancellationToken);
        return Ok(people);
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

    [HttpPost("by-iam/{iamId}/roles")]
    public async Task<ActionResult<AssignRoleResponse>> AssignRole(
        string iamId,
        [FromBody] AssignRoleRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var roleName = request?.RoleName?.Trim();
        if (string.IsNullOrWhiteSpace(roleName))
        {
            return BadRequest("Role name is required.");
        }

        var allowed = new[] { Role.Names.Manager, Role.Names.AccrualViewer, Role.Names.FinancialViewer, Role.Names.DepartmentViewer };
        if (!allowed.Contains(roleName, StringComparer.Ordinal))
        {
            return BadRequest($"Role '{roleName}' is not assignable via this endpoint.");
        }

        var person = await GetPersonAsync(iamId, cancellationToken);
        if (person is null)
        {
            return NotFound("A People record with an Employee ID is required.");
        }

        IReadOnlyList<GraphUserProfile> profiles;
        try
        {
            profiles = await _graphService.FindEligibleUsersByIamIdAsync(User, person.IamId, cancellationToken);
        }
        catch (MicrosoftIdentityWebChallengeUserException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for account linking.");
            return Unauthorized();
        }
        catch (MsalUiRequiredException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for account linking.");
            return Unauthorized();
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Microsoft Graph IAM ID lookup failed.");
            return StatusCode(StatusCodes.Status502BadGateway, "Unable to verify the Entra account. Please try again.");
        }

        if (profiles.Count == 0)
        {
            return NotFound("No enabled Entra member account matches this person's IAM ID. Newly updated accounts may take time to appear.");
        }
        if (profiles.Count != 1)
        {
            return Conflict("Multiple enabled Entra member accounts match this person's IAM ID. Resolve the duplicate accounts before granting access.");
        }

        var profile = profiles[0];
        if (!Guid.TryParse(profile.Id, out var entraUserId) || entraUserId == Guid.Empty ||
            !string.Equals(profile.IamId, person.IamId, StringComparison.Ordinal))
        {
            return Conflict("The Entra account does not match the selected person's IAM ID.");
        }

        // Never move existing permissions to another account or overwrite a different campus identity.
        var existingUser = await _userService.GetByIamIdAsync(person.IamId, cancellationToken);
        var linkedUser = await _userService.GetByIdAsync(entraUserId, cancellationToken);
        if ((existingUser is not null && existingUser.Id != entraUserId) ||
            (linkedUser is not null && linkedUser.IamId != person.IamId))
        {
            return Conflict("This person or Entra account already has a different Walter account link. Resolve that link before granting access.");
        }

        string? kerberos;
        try
        {
            kerberos = await _identityService.GetKerberosByIamId(person.IamId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve Kerberos for IAM ID '{IamId}'.", person.IamId);
            return StatusCode(StatusCodes.Status502BadGateway, "Unable to look up the campus username. Please try again.");
        }

        if (string.IsNullOrWhiteSpace(kerberos))
        {
            return BadRequest($"Kerberos is missing for IAM ID '{person.IamId}'.");
        }

        var userProfile = new UserProfileData
        {
            UserId = entraUserId,
            Kerberos = kerberos,
            IamId = person.IamId,
            EmployeeId = person.EmployeeId,
            DisplayName = person.Name,
            Email = person.Email,
        };

        await _userService.CreateOrUpdateUserAsync(userProfile, cancellationToken);
        var added = await _userService.AddRoleToUserAsync(entraUserId, roleName, User.GetUserId(), cancellationToken);
        var roles = await _userService.GetRolesForUser(entraUserId);
        return Ok(new AssignRoleResponse(new AdminManagedUser(
            entraUserId, person.Name, person.Email, person.EmployeeId, kerberos, person.IamId, roles), added));
    }

    public sealed record UserRolesResponse(
        IReadOnlyList<string> Roles,
        string? Name,
        string? Email,
        string? EmployeeId,
        string? Kerberos,
        string? IamId);

    [HttpGet("by-iam/{iamId}/roles")]
    public async Task<ActionResult<UserRolesResponse>> GetRoles(string iamId, CancellationToken cancellationToken)
    {
        var person = await GetPersonAsync(iamId, cancellationToken);
        if (person is null)
        {
            return NotFound("A People record with an Employee ID is required.");
        }

        var user = await _userService.GetByIamIdAsync(person.IamId, cancellationToken);
        IReadOnlyList<string> roles = user is null ? [] : await _userService.GetRolesForUser(user.Id);
        return Ok(new UserRolesResponse(roles, person.Name, person.Email, person.EmployeeId, user?.Kerberos, person.IamId));
    }

    public sealed record RemoveRoleRequest(string RoleName);
    public sealed record RemoveRoleResponse(IReadOnlyList<string> Roles, bool Removed);

    [HttpDelete("by-iam/{iamId}/roles")]
    public async Task<ActionResult<RemoveRoleResponse>> RemoveRole(
        string iamId,
        [FromBody] RemoveRoleRequest request,
        CancellationToken cancellationToken)
    {
        var roleName = request?.RoleName?.Trim();
        if (string.IsNullOrWhiteSpace(roleName))
        {
            return BadRequest("Role name is required.");
        }

        var person = await GetPersonAsync(iamId, cancellationToken);
        if (person is null)
        {
            return NotFound("A People record with an Employee ID is required.");
        }

        var user = await _userService.GetByIamIdAsync(person.IamId, cancellationToken);
        if (user is null)
        {
            return Ok(new RemoveRoleResponse([], false));
        }

        var removed = await _userService.RemoveRoleFromUserAsync(user.Id, roleName, cancellationToken);
        var roles = await _userService.GetRolesForUser(user.Id);
        return Ok(new RemoveRoleResponse(roles, removed));
    }

    /// <summary>Requires a current People record with an Employee ID for every admin permission operation.</summary>
    private async Task<SearchablePersonRecord?> GetPersonAsync(string iamId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(iamId)) return null;
        var person = await _datamartService.GetSearchablePersonByIamIdAsync(iamId.Trim(), cancellationToken);
        return person is not null && person.IamId == iamId.Trim() && !string.IsNullOrWhiteSpace(person.EmployeeId)
            ? person
            : null;
    }
}
