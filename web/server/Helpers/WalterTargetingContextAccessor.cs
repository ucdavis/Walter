using Microsoft.FeatureManagement.FeatureFilters;
using Server.Services;

namespace server.Helpers;

/// <summary>Resolves the effective authenticated user's IAM ID, including user emulation, once per request.</summary>
public sealed class WalterTargetingContextAccessor(
    IHttpContextAccessor httpContextAccessor,
    IUserService users,
    ILogger<WalterTargetingContextAccessor> logger) : ITargetingContextAccessor
{
    private Task<TargetingContext?>? _context;

    public async ValueTask<TargetingContext> GetContextAsync()
    {
        // All four evaluations share this scoped lookup; never cache identity across requests.
        return (await (_context ??= ResolveContextAsync()))!;
    }

    /// <summary>Never substitutes another identifier for a missing IAM ID or trusts browser-supplied identity.</summary>
    private async Task<TargetingContext?> ResolveContextAsync()
    {
        var context = httpContextAccessor.HttpContext;
        var principal = context?.User;
        if (principal?.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        // Emulation must use the target record even if an operator IAM claim survives a future sign-in change.
        var iamId = principal.GetEmulatingUser() is null ? principal.GetIamId() : null;
        if (string.IsNullOrWhiteSpace(iamId))
        {
            Guid userId;
            try
            {
                userId = principal.GetUserId();
            }
            catch (InvalidOperationException)
            {
                logger.LogWarning("IAM targeting is unavailable because the authenticated user identifier is missing.");
                return null;
            }

            try
            {
                var user = await users.GetByIdAsync(userId, context!.RequestAborted);
                iamId = user?.IamId?.Trim();
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "IAM targeting is unavailable because the user lookup failed.");
                return null;
            }
        }

        if (string.IsNullOrWhiteSpace(iamId))
        {
            logger.LogWarning("IAM targeting is unavailable because the authenticated user has no IAM ID.");
            // Null context makes the SDK targeting filter return false, even with a 100% default audience.
            return null;
        }

        return new TargetingContext { UserId = iamId, Groups = [] };
    }
}
