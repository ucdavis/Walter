using System;
using System.Security.Claims;
using Microsoft.Identity.Web;

namespace server.Helpers;

public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Returns the authenticated user's object ID as a GUID.
    /// Falls back to the legacy OID claim if needed.
    /// </summary>
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);

        var userIdValue = principal.FindFirstValue(ClaimConstants.ObjectId)
                          ?? principal.FindFirstValue(ClaimConstants.Oid);

        if (string.IsNullOrWhiteSpace(userIdValue))
        {
            throw new InvalidOperationException("Authenticated principal is missing the ObjectId claim.");
        }

        if (!Guid.TryParse(userIdValue, out var userId))
        {
            throw new InvalidOperationException($"ObjectId claim '{userIdValue}' is not a valid GUID.");
        }

        return userId;
    }

    /// <summary>
    /// Returns the authenticated user's kerberos ID or email for audit logging.
    /// </summary>
    public static string? GetUserIdentifier(this ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);

        return principal.FindFirstValue("kerberos")
            ?? principal.FindFirstValue(ClaimTypes.Email);
    }
}
