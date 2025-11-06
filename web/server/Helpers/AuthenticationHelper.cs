using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Identity.Web;
using Microsoft.Extensions.Logging;
using Server.Services;

namespace server.Helpers;

public static class AuthenticationHelper
{
    private const string KerberosClaimType = "urn:ucdavis:iam:kerberos";
    private const string IamIdClaimType = "urn:ucdavis:iam:iamid";

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
        // Load up the roles on first login (can also change other user info/claims here if needed)
        var userKey = ctx.Principal!.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userKey)) return;

        var userObjectId = ctx.Principal.FindFirstValue(ClaimConstants.ObjectId)
                          ?? ctx.Principal.FindFirstValue(ClaimConstants.Oid)
                          ?? userKey;

        var logger = ctx.HttpContext.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("AuthenticationHelper");

        var attributeService = ctx.HttpContext.RequestServices.GetRequiredService<IEntraUserAttributeService>();
        var attributes = await attributeService.GetExtensionAttributesAsync(userObjectId, ctx.Principal, ctx.HttpContext.RequestAborted);

        var identity = (ClaimsIdentity)ctx.Principal.Identity!;

        if (attributes?.Kerberos is { Length: > 0 } kerberos)
        {
            AddOrUpdateClaim(identity, KerberosClaimType, kerberos);
        }
        else
        {
            logger.LogInformation("Kerberos (extension attribute 2) not available for user {UserId}", userKey);
        }

        if (attributes?.IamId is { Length: > 0 } iamId)
        {
            AddOrUpdateClaim(identity, IamIdClaimType, iamId);
        }
        else
        {
            logger.LogInformation("IAMID (extension attribute 7) not available for user {UserId}", userKey);
        }

        var userService = ctx.HttpContext.RequestServices.GetRequiredService<IUserService>();
        var roles = await userService.GetRolesForUser(userKey);

        foreach (var role in roles)
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, role));
        }
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

    private static void AddOrUpdateClaim(ClaimsIdentity identity, string claimType, string value)
    {
        var existing = identity.FindFirst(claimType);
        if (existing != null)
        {
            identity.RemoveClaim(existing);
        }

        identity.AddClaim(new Claim(claimType, value));
    }
}
