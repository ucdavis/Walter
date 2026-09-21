using System.Diagnostics;

namespace server.Helpers;

public static class LoggingMiddlewareHelper
{
    /// <summary>
    /// Adds IAM IDs to request traces and includes request, user, and client details in log scopes.
    /// Register after authentication and before authorization to include denied requests.
    /// </summary>
    public static void UseRequestContextLogging(this WebApplication app)
    {
        app.Use(async (ctx, next) =>
        {
            // ASP.NET's intrinsic request id + W3C trace context
            var requestId = ctx.TraceIdentifier;
            var activity = Activity.Current;
            var traceId = activity?.TraceId.ToString();
            var spanId = activity?.SpanId.ToString();

            // user info (stable identifiers when authenticated)
            var isAuthenticated = ctx.User.Identity?.IsAuthenticated == true;

            string? iamId = null;
            string? userIdentifier = null;

            if (isAuthenticated)
            {
                userIdentifier = ctx.User.GetUserIdentifier();
                iamId = ctx.User.GetIamId();
                if (string.IsNullOrWhiteSpace(iamId))
                {
                    iamId = null;
                }
            }

            // Read only authenticated claims; telemetry must not trigger identity lookups.
            activity?.SetTag("user.id", iamId);

            // Track actual user when emulating
            var emulatingUser = ctx.User.FindFirst("emulating_user")?.Value;

            // client IP (respects ForwardedHeaders above)
            var clientIp = ctx.Connection.RemoteIpAddress?.ToString();

            // user agent
            var ua = ctx.Request.Headers.UserAgent.ToString();

            // Make these available to all logs in this request
            using (app.Logger.BeginScope(new Dictionary<string, object?>
            {
                ["user.id"] = iamId,
                ["user.identifier"] = userIdentifier,
                ["user.emulating"] = emulatingUser,
                ["request.id"] = requestId,
                ["trace.id"] = traceId,
                ["span.id"] = spanId,
                ["client.ip"] = clientIp,
                ["user_agent.original"] = ua
            }))
            {
                await next();
            }
        });
    }
}
