using Microsoft.AspNetCore.Authorization;
using server.core.Domain;

namespace server.Helpers;

public static class AuthorizationHelper
{
    public static class Policies
    {
        public const string CanViewAccruals = nameof(CanViewAccruals);
        public const string IsManager = nameof(IsManager);
        public const string IsSystem = nameof(IsSystem);
    }

    /// <summary>
    /// Configures authorization policies for the application.
    /// Admin role bypasses all policy checks via AdminBypassHandler.
    /// </summary>
    public static IServiceCollection AddAuthorizationPolicies(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy(Policies.CanViewAccruals, policy =>
                policy.RequireRole(Role.Names.AccrualViewer));

            options.AddPolicy(Policies.IsManager, policy =>
                policy.RequireRole(Role.Names.Manager));

            options.AddPolicy(Policies.IsSystem, policy =>
                policy.RequireRole(Role.Names.System));
        });

        services.AddSingleton<IAuthorizationHandler, AdminBypassHandler>();

        return services;
    }
}

/// <summary>
/// Authorization handler that grants Admin role access to all resources.
/// This handler runs for every authorization check and succeeds all requirements
/// if the user has the Admin role.
/// Note: System role is intentionally excluded - it only grants access to system
/// operations like user emulation, not general application resources.
/// </summary>
public class AdminBypassHandler : IAuthorizationHandler
{
    public Task HandleAsync(AuthorizationHandlerContext context)
    {
        var user = context.User;

        if (user.IsInRole(Role.Names.Admin))
        {
            foreach (var requirement in context.PendingRequirements.ToList())
            {
                context.Succeed(requirement);
            }
        }

        return Task.CompletedTask;
    }
}
