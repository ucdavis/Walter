using System;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Identity.Web;
using Server.Services;

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
    private static async Task OnTokenValidated(TokenValidatedContext ctx)
    {
        var principal = ctx.Principal ?? throw new InvalidOperationException("Token validation did not provide a claims principal.");

        var userIdClaim = principal.FindFirst(ClaimConstants.ObjectId)?.Value
                          ?? throw new InvalidOperationException("Authenticated principal is missing the NameIdentifier claim.");

        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            throw new InvalidOperationException($"NameIdentifier claim '{userIdClaim}' is not a valid GUID.");
        }

        var profileOrchestrator = ctx.HttpContext.RequestServices.GetRequiredService<IUserProfileOrchestrator>();
        var cancellationToken = ctx.HttpContext.RequestAborted;

        await profileOrchestrator.EnsureUserProfileAsync(userId, userIdClaim, principal, cancellationToken);

        // now we have our user in the DB, and can load them via their name identifier.
        // we'll load the roles from the db when validating the cookie on future requests.
        // If we want, later on we can add roles/attribute claims here for the initial login token.
    }

    /// <summary>
    /// Validates cookie principal on every request - updates user roles/claims if needed
    /// </summary>
    private static async Task OnValidatePrincipal(CookieValidatePrincipalContext ctx)
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
