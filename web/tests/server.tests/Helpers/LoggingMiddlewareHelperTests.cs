using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using server.Helpers;

namespace server.tests.Helpers;

public class LoggingMiddlewareHelperTests
{
    private static readonly Guid EntraId = Guid.Parse("11111111-2222-3333-4444-555555555555");

    [Theory]
    [InlineData(true, " 001234567 ", "001234567")]
    [InlineData(true, null, null)]
    [InlineData(true, "   ", null)]
    [InlineData(false, "001234567", null)]
    public async Task EnrichesActivityAndActualLogScopeOnlyFromAuthenticatedClaims(
        bool authenticated, string? iamClaim, string? expectedIamId)
    {
        var logs = new ScopeLoggerProvider();
        await using var app = CreateApp(logs);
        app.UseRequestContextLogging();
        app.Run(ctx =>
        {
            app.Logger.LogInformation("Inside request");
            return Task.CompletedTask;
        });
        var pipeline = ((IApplicationBuilder)app).Build();
        var context = CreateContext(app, authenticated, iamClaim);
        using var activity = new Activity("request").Start();

        await pipeline(context);

        Assert.Equal(expectedIamId, activity.GetTagItem("user.id"));
        Assert.Null(activity.GetTagItem("user.entra_id"));
        var scope = Assert.Single(logs.Entries).Scope;
        Assert.Equal(expectedIamId, scope["user.id"]);
        Assert.DoesNotContain("user.entra_id", scope.Keys);
        Assert.Equal(authenticated ? "testuser" : null, scope["user.identifier"]);
        Assert.Equal("original-user", scope["user.emulating"]);
        Assert.Equal(context.TraceIdentifier, scope["request.id"]);
        Assert.Equal(activity.TraceId.ToString(), scope["trace.id"]);
        Assert.Equal(activity.SpanId.ToString(), scope["span.id"]);

        app.Logger.LogInformation("Outside request");
        Assert.DoesNotContain("user.id", logs.Entries.Last().Scope.Keys);
        Assert.DoesNotContain("user.entra_id", logs.Entries.Last().Scope.Keys);
    }

    [Fact]
    public async Task MissingEntraClaimDoesNotPreventIamEnrichmentWithoutAnActivity()
    {
        var logs = new ScopeLoggerProvider();
        await using var app = CreateApp(logs);
        app.UseRequestContextLogging();
        app.Run(ctx =>
        {
            app.Logger.LogInformation("Inside request");
            return Task.CompletedTask;
        });
        var context = new DefaultHttpContext
        {
            RequestServices = app.Services,
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimsPrincipalExtensions.IamIdClaimType, "001234567")], "test"))
        };
        await ((IApplicationBuilder)app).Build()(context);

        var scope = Assert.Single(logs.Entries).Scope;
        Assert.Equal("001234567", scope["user.id"]);
        Assert.DoesNotContain("user.entra_id", scope.Keys);
    }

    [Fact]
    public async Task OverlappingRequestsAndSubsequentAnonymousRequestDoNotShareIdentity()
    {
        var logs = new ScopeLoggerProvider();
        await using var app = CreateApp(logs);
        var bothEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var entered = 0;
        app.UseRequestContextLogging();
        app.Run(async ctx =>
        {
            if (Interlocked.Increment(ref entered) == 2)
            {
                bothEntered.SetResult();
            }
            await bothEntered.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.Equal(ctx.User.Identity?.IsAuthenticated == true ? ctx.User.GetIamId() : null,
                Activity.Current?.GetTagItem("user.id"));
            app.Logger.LogInformation("Request {RequestId}", ctx.TraceIdentifier);
        });
        var pipeline = ((IApplicationBuilder)app).Build();
        async Task Invoke(bool authenticated, string? iamId)
        {
            using var activity = new Activity("request").Start();
            var context = CreateContext(app, authenticated, iamId);
            context.TraceIdentifier = iamId ?? "anonymous";
            await pipeline(context);
        }

        await Task.WhenAll(Invoke(true, "001234567"), Invoke(true, "009876543"));
        await Invoke(false, null);

        Assert.Equal(3, logs.Entries.Count);
        foreach (var entry in logs.Entries)
        {
            var requestId = entry.Scope["request.id"];
            Assert.Equal(Equals(requestId, "anonymous") ? null : requestId, entry.Scope["user.id"]);
        }
    }

    [Fact]
    public async Task DisposesIdentityScopeWhenDownstreamThrows()
    {
        var logs = new ScopeLoggerProvider();
        await using var app = CreateApp(logs);
        app.UseRequestContextLogging();
        app.Run(ctx => throw new InvalidOperationException("test failure"));
        using var activity = new Activity("request").Start();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            ((IApplicationBuilder)app).Build()(CreateContext(app, true, "001234567")));

        Assert.Equal("001234567", activity.GetTagItem("user.id"));
        app.Logger.LogInformation("Outside failed request");
        Assert.DoesNotContain("user.id", Assert.Single(logs.Entries).Scope.Keys);
    }

    [Fact]
    public async Task EnrichesDeniedRequestsBeforeAuthorizationShortCircuits()
    {
        var logs = new ScopeLoggerProvider();
        await using var app = CreateApp(logs, authorization: true);
        app.UseRequestContextLogging();
        app.UseAuthorization();
        var reachedEndpoint = false;
        app.Run(ctx =>
        {
            reachedEndpoint = true;
            return Task.CompletedTask;
        });
        var context = CreateContext(app, true, "001234567");
        context.SetEndpoint(new Endpoint(null,
            new EndpointMetadataCollection(new AuthorizeAttribute { Roles = "Admin" }), "Admin endpoint"));
        using var activity = new Activity("denied request").Start();

        await ((IApplicationBuilder)app).Build()(context);

        Assert.False(reachedEndpoint);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        Assert.Equal("001234567", activity.GetTagItem("user.id"));
        var deniedLog = Assert.Single(logs.Entries, entry => entry.Message == "Authorization denied");
        Assert.Equal("001234567", deniedLog.Scope["user.id"]);
    }

    private sealed class DeniedResultHandler(ILogger<DeniedResultHandler> logger) : IAuthorizationMiddlewareResultHandler
    {
        public Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy,
            PolicyAuthorizationResult authorizeResult)
        {
            Assert.True(authorizeResult.Forbidden);
            logger.LogInformation("Authorization denied");
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        }
    }

    private static WebApplication CreateApp(ScopeLoggerProvider logs, bool authorization = false)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Logging.ClearProviders();
        builder.Logging.AddProvider(logs);
        if (authorization)
        {
            builder.Services.AddAuthentication();
            builder.Services.AddAuthorization();
            builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, DeniedResultHandler>();
        }
        return builder.Build();
    }

    private static DefaultHttpContext CreateContext(WebApplication app, bool authenticated, string? iamId)
    {
        var claims = new List<Claim>
        {
            new("oid", EntraId.ToString()),
            new("kerberos", "testuser"),
            new("emulating_user", "original-user")
        };
        if (iamId != null)
        {
            claims.Add(new Claim(ClaimsPrincipalExtensions.IamIdClaimType, iamId));
        }
        return new DefaultHttpContext
        {
            RequestServices = app.Services,
            User = new ClaimsPrincipal(new ClaimsIdentity(claims, authenticated ? "test" : null))
        };
    }

    private sealed class ScopeLoggerProvider : ILoggerProvider, ISupportExternalScope
    {
        private IExternalScopeProvider _scopes = new LoggerExternalScopeProvider();
        public ConcurrentQueue<(string Message, Dictionary<string, object?> Scope)> Entries { get; } = new();
        public ILogger CreateLogger(string categoryName) => new ScopeLogger(this);
        public void SetScopeProvider(IExternalScopeProvider scopeProvider) => _scopes = scopeProvider;
        public void Dispose() { }

        private sealed class ScopeLogger(ScopeLoggerProvider provider) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => provider._scopes.Push(state);
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                var values = new Dictionary<string, object?>();
                provider._scopes.ForEachScope((scope, target) =>
                {
                    if (scope is IEnumerable<KeyValuePair<string, object?>> fields)
                    {
                        foreach (var field in fields) target[field.Key] = field.Value;
                    }
                }, values);
                provider.Entries.Enqueue((formatter(state, exception), values));
            }
        }
    }
}
