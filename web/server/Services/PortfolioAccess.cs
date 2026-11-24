using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using server.Helpers;
using Server.Services;

namespace server.Services;

/// <summary>The access rule for a person's portfolio page, shared by every endpoint that follows it.</summary>
public sealed class PortfolioAccess(
    IAuthorizationService authorizationService,
    IUserService userService,
    PpmPortfolioService portfolioService)
{
    public async Task<bool> CanViewFinancialsAsync(ClaimsPrincipal caller) =>
        (await authorizationService.AuthorizeAsync(
            caller,
            resource: null,
            policyName: AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

    /// <summary>
    /// True for financial viewers, and for a PI or PM on at least one of the owner's projects
    /// (covers both self-lookup and a PM viewing their PI).
    /// </summary>
    public async Task<bool> CanOpenPortfolioAsync(
        ClaimsPrincipal caller, string ownerEmployeeId, CancellationToken cancellationToken)
    {
        if (await CanViewFinancialsAsync(caller))
        {
            return true;
        }

        Guid userId;
        try
        {
            userId = caller.GetUserId();
        }
        catch (InvalidOperationException)
        {
            return false;
        }

        var currentUser = await userService.GetByIdAsync(userId, cancellationToken);
        return await portfolioService.IsOnAnyProjectForPiAsync(
            currentUser?.EmployeeId, ownerEmployeeId, cancellationToken);
    }
}
