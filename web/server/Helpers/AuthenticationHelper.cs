using System;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Identity.Web;
using Microsoft.Extensions.Logging;
using Server.Services;
using server.core.Domain;
using server.core.Services;

namespace server.Helpers;

public static class AuthenticationHelper
{
    /// <summary>
    /// Configures Microsoft Identity Web authentication with Azure AD/Entra ID
    /// </summary>
    public static IServiceCollection AddAuthenticationServices(this IServiceCollection services, IConfiguration configuration)
    {
        var authBuilder = services
            .AddAuthentication(options =>
            {
                options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
            })
            .AddMicrosoftIdentityWebApp(options =>
            {
                configuration.Bind("Auth", options);

                options.Scope.Add("User.Read.All"); // ability to look up other users and our own extension attributes

                options.TokenValidationParameters = new()
                {
                    NameClaimType = "name",
                    RoleClaimType = ClaimTypes.Role
                };

                options.Events ??= new OpenIdConnectEvents();
                options.Events.OnRedirectToIdentityProvider = OnRedirectToIdentityProvider;
                options.Events.OnTokenValidated = OnTokenValidated;
            });

        authBuilder
            .EnableTokenAcquisitionToCallDownstreamApi(initialScopes: EntraUserAttributeService.RequiredScopes)
            .AddInMemoryTokenCaches();

        services.PostConfigure<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme, options =>
        {
            options.Events = new CookieAuthenticationEvents
            {
                OnValidatePrincipal = OnValidatePrincipal,
                OnRedirectToAccessDenied = ctx =>
                {
                    // If the request is for an API endpoint, don't redirect to the access denied page
                    if (ctx.Request.Path.StartsWithSegments("/api"))
                    {
                        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    }
                    return Task.CompletedTask;
                }
            };
        });

        return services;
    }

    /// <summary>
    /// Handles redirect to identity provider - prevents API endpoints from redirecting to login page
    /// </summary>
    private static Task OnRedirectToIdentityProvider(Microsoft.AspNetCore.Authentication.OpenIdConnect.RedirectContext ctx)
    {
        // If the request is for an API endpoint, don't redirect to the login page
        if (ctx.Request.Path.StartsWithSegments("/api"))
        {
            ctx.Response.StatusCode = 401;
            ctx.HandleResponse();
            return Task.CompletedTask;
        }

        // Set domain hint for UC Davis
        ctx.ProtocolMessage.DomainHint = "ucdavis.edu";

        return Task.CompletedTask;
    }

    /// <summary>
    /// Handles token validation - loads user roles on first login
    /// </summary>
    private static async Task OnTokenValidated(Microsoft.AspNetCore.Authentication.OpenIdConnect.TokenValidatedContext ctx)
    {
        var principal = ctx.Principal ?? throw new InvalidOperationException("Token validation did not provide a claims principal.");

        var userIdClaim = principal.FindFirst(ClaimConstants.ObjectId)?.Value
                          ?? throw new InvalidOperationException("Authenticated principal is missing the NameIdentifier claim.");

        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            throw new InvalidOperationException($"NameIdentifier claim '{userIdClaim}' is not a valid GUID.");
        }

        var loggerFactory = ctx.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>();
        var logger = loggerFactory.CreateLogger("AuthenticationHelper");
        var attributeService = ctx.HttpContext.RequestServices.GetRequiredService<IEntraUserAttributeService>();
        var identityService = ctx.HttpContext.RequestServices.GetRequiredService<IIdentityService>();
        var userService = ctx.HttpContext.RequestServices.GetRequiredService<IUserService>();
        var cancellationToken = ctx.HttpContext.RequestAborted;

        var existingUser = await userService.GetByIdAsync(userId, cancellationToken);

        var attributes = await attributeService.GetAttributesAsync(userIdClaim, principal, cancellationToken);

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
            logger.LogWarning("Falling back to stored profile for user {UserId} because Entra attributes could not be loaded.", userId);
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
            iamIdentity = await identityService.GetByIamId(iamId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to retrieve IAM identity for IAM ID '{IamId}'.", iamId);
        }

        if (iamIdentity == null && existingUser != null)
        {
            logger.LogWarning("Using stored IAM profile for user {UserId} because IAM lookup failed.", userId);
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
            // entra has email as preferred_username claim so check that first
            Email = principal.FindFirst("preferred_username")?.Value
                    ?? principal.FindFirst(ClaimTypes.Email)?.Value
                    ?? existingUser?.Email
        };

        await userService.CreateOrUpdateUserAsync(profile, cancellationToken);

        // now we have our user in the DB, and can load them via their name identifier.
        // we'll load the roles from the db when validating the cookie on future requests.
        // If we want, later on we can add roles/attribute claims here for the initial login token.
    }

    /// <summary>
    /// Validates cookie principal on every request - updates user roles/claims if needed
    /// </summary>
    private static async Task OnValidatePrincipal(Microsoft.AspNetCore.Authentication.Cookies.CookieValidatePrincipalContext ctx)
    {
        // On every request with a cookie, check if the user's roles/claims need updating
        // We could use a cache here or roleVersion or timestamp or something, but for simplicity we'll just hit the DB every time
        var userService = ctx.HttpContext.RequestServices.GetRequiredService<IUserService>();
        var updated = await userService.UpdateUserPrincipalIfNeeded(ctx.Principal!);

        if (updated != null)
        {
            ctx.ReplacePrincipal(updated);
            ctx.ShouldRenew = true; // Renew the cookie with the new principal
        }
    }

}
