using System.Security.Claims;
using AggieEnterpriseApi.Extensions;
using server.core.Domain;
using server.core.Services;
using server.Helpers;
using server.Services;

namespace Server.Services;

public interface IUserProfileOrchestrator
{
    Task<UserProfileData> EnsureUserProfileAsync(Guid userId, string userObjectId, ClaimsPrincipal principal, CancellationToken cancellationToken = default);
}

public sealed class UserProfileOrchestrator : IUserProfileOrchestrator
{
    private readonly IEntraUserAttributeService _attributeService;
    private readonly IIdentityService _identityService;
    private readonly IUserService _userService;
    private readonly IFinancialApiService _financialApiService;
    private readonly ILogger<UserProfileOrchestrator> _logger;

    public UserProfileOrchestrator(
        IEntraUserAttributeService attributeService,
        IIdentityService identityService,
        IUserService userService,
        IFinancialApiService financialApiService,
        ILogger<UserProfileOrchestrator> logger)
    {
        _attributeService = attributeService;
        _identityService = identityService;
        _userService = userService;
        _financialApiService = financialApiService;
        _logger = logger;
    }

    public async Task<UserProfileData> EnsureUserProfileAsync(
        Guid userId,
        string userObjectId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(principal);

        var existingUser = await _userService.GetByIdAsync(userId, cancellationToken);

        var attributes = await _attributeService.GetAttributesAsync(userObjectId, principal, cancellationToken);

        var kerberos = !string.IsNullOrWhiteSpace(attributes?.Kerberos)
            ? attributes!.Kerberos
            : existingUser?.Kerberos;

        if (string.IsNullOrWhiteSpace(kerberos))
        {
            throw new InvalidOperationException(existingUser == null
                ? $"Kerberos extension attribute is missing for new user {userId}."
                : $"Kerberos extension attribute missing for {userId} and no stored value was found.");
        }

        if (attributes == null && existingUser != null)
        {
            _logger.LogWarning("Falling back to stored profile for user {UserId} because Entra attributes could not be loaded.", userId);
        }

        var iamId = !string.IsNullOrWhiteSpace(attributes?.IamId)
            ? attributes!.IamId
            : existingUser?.IamId;

        if (string.IsNullOrWhiteSpace(iamId))
        {
            throw new InvalidOperationException(existingUser == null
                ? $"IAM extension attribute is missing for new user {userId}."
                : $"IAM extension attribute missing for {userId} and no stored value was found.");
        }

        IamIdentity? iamIdentity = null;
        try
        {
            iamIdentity = await _identityService.GetByIamId(iamId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve IAM identity for IAM ID '{IamId}'.", iamId);
        }

        if (iamIdentity == null && existingUser != null)
        {
            _logger.LogWarning("Using stored IAM profile for user {UserId} because IAM lookup failed.", userId);
        }
        else if (iamIdentity == null)
        {
            throw new InvalidOperationException($"IAM identity lookup failed for IAM ID '{iamId}'.");
        }

        var employeeId = iamIdentity?.EmployeeId ?? existingUser?.EmployeeId;
        if (string.IsNullOrWhiteSpace(employeeId))
        {
            throw new InvalidOperationException($"Employee ID is missing for user {userId}.");
        }

        var profile = new UserProfileData
        {
            UserId = userId,
            Kerberos = kerberos!,
            IamId = iamId!,
            EmployeeId = employeeId,
            DisplayName = iamIdentity?.FullName ?? existingUser?.DisplayName,
            Email = principal.FindFirst("preferred_username")?.Value
                    ?? principal.FindFirst(ClaimTypes.Email)?.Value
                    ?? existingUser?.Email
        };

        await _userService.CreateOrUpdateUserAsync(profile, cancellationToken);
        await SyncProjectManagerRoleAsync(userId, employeeId, cancellationToken);

        return profile;
    }

    private async Task SyncProjectManagerRoleAsync(Guid userId, string employeeId, CancellationToken cancellationToken)
    {
        var client = _financialApiService.GetClient();

        var pmResultTask = client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.ProjectManager, cancellationToken);

        var pmData = (await pmResultTask).ReadData();
        var isProjectManager = pmData.PpmProjectByProjectTeamMemberEmployeeId.Any();

        if (isProjectManager)
        {
            var added = await _userService.AddRoleToUserAsync(userId, Role.Names.ProjectManager, userId, cancellationToken);
            if (added)
            {
                _logger.LogInformation("Assigned {RoleName} role to user {UserId}.", Role.Names.ProjectManager, userId);
            }

            return;
        }

        var removed = await _userService.RemoveRoleFromUserAsync(userId, Role.Names.ProjectManager, cancellationToken);
        if (removed)
        {
            _logger.LogInformation("Removed {RoleName} role from user {UserId}.", Role.Names.ProjectManager, userId);
        }
    }
}
