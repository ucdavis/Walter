using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using AggieEnterpriseApi;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;
using Server.Controllers;
using Server.Demo;
using server.Helpers;
using server.Services;

namespace server.tests.Controllers;

public sealed class DemoSessionTests
{
    private static readonly Guid PresenterId = Guid.Parse("aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb");

    [Theory]
    [InlineData("pi")]
    [InlineData("pm")]
    public void Starting_a_presentation_only_sets_a_separate_session_cookie(string profile)
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create();
        var actualPrincipal = http.User;

        Assert.True(demo.Start(profile));

        Assert.Same(actualPrincipal, http.User);
        Assert.Equal(PresenterId.ToString(), http.User.FindFirstValue(ClaimConstants.ObjectId));
        var cookie = Assert.Single(http.Response.Headers.SetCookie);
        Assert.StartsWith(DemoRequestContext.CookieName + "=", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("expires=", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("max-age=", cookie, StringComparison.OrdinalIgnoreCase);

        var (_, subsequent) = fixture.Create(cookie: CookiePair(http));
        Assert.True(subsequent.IsActive);
        Assert.Equal(profile, subsequent.Profile);
        Assert.Equal("demo:" + profile, subsequent.ResponseContext);
        Assert.NotEqual(PresenterId, subsequent.PresentationUser!.Id);
    }

    [Theory]
    [InlineData("Production", true, true, false)]
    [InlineData("Development", false, true, false)]
    [InlineData("Development", true, false, true)]
    [InlineData("Test", true, false, false)]
    [InlineData("Test", true, true, true)]
    [InlineData("Staging", true, true, true)]
    public void Activation_requires_an_enabled_supported_environment_and_presenter(
        string environment, bool enabled, bool allowlisted, bool expected)
    {
        using var fixture = new SessionFixture(environment, enabled, allowlisted);
        var (http, demo) = fixture.Create();

        Assert.Equal(expected, demo.CanStart);
        Assert.Equal(expected, demo.Start("pi"));
        Assert.Equal(expected, http.Response.Headers.ContainsKey("Set-Cookie"));
    }

    [Fact]
    public void Anonymous_emulating_and_unknown_persona_requests_cannot_start()
    {
        using var fixture = new SessionFixture();
        var (anonymous, anonymousDemo) = fixture.Create();
        anonymous.User = new ClaimsPrincipal(new ClaimsIdentity());
        Assert.False(anonymousDemo.Start("pi"));

        var (emulating, emulatingDemo) = fixture.Create();
        ((ClaimsIdentity)emulating.User.Identity!).AddClaim(new Claim("emulating_user", "operator"));
        Assert.False(emulatingDemo.Start("pi"));

        var (http, demo) = fixture.Create();
        Assert.False(demo.Start("arbitrary-real-user"));
        Assert.False(http.Response.Headers.ContainsKey("Set-Cookie"));
    }

    [Fact]
    public async Task Presentation_cookie_is_bound_to_the_real_presenter()
    {
        using var fixture = new SessionFixture();
        var cookie = fixture.Start();
        var (http, demo) = fixture.Create(cookie, Guid.NewGuid());
        SetAction<UserController>(http, nameof(UserController.Me));

        await AssertRejectedAsync(http, demo, StatusCodes.Status409Conflict, "presentation_session_invalid");

        Assert.True(demo.HasSession);
        Assert.False(demo.IsActive);
        Assert.Null(demo.PresentationUser);
    }

    [Theory]
    [InlineData("expired")]
    [InlineData("disabled")]
    [InlineData("tampered")]
    [InlineData("revoked")]
    public async Task Invalid_session_never_falls_back_to_live_data_and_requires_explicit_exit(string reason)
    {
        using var fixture = new SessionFixture(environment: "Test");
        var cookie = fixture.Start();
        switch (reason)
        {
            case "expired": fixture.Clock.Advance(TimeSpan.FromHours(9)); break;
            case "disabled": fixture.Options.Enabled = false; break;
            case "tampered": cookie = DemoRequestContext.CookieName + "=invalid-cookie"; break;
            case "revoked": fixture.Options.AllowedPresenterIds = []; break;
        }
        var (http, demo) = fixture.Create(cookie);
        SetAction<ProjectController>(http, nameof(ProjectController.GetByIamIdAsync));

        await AssertRejectedAsync(http, demo, StatusCodes.Status409Conflict, "presentation_session_invalid");

        Assert.Equal("invalid", demo.ResponseContext);
        Assert.False(demo.Start("pi"));
        Assert.False(http.Response.Headers.ContainsKey("Set-Cookie"));

        foreach (var action in new[] { nameof(DemoController.Status), nameof(DemoController.Stop) })
        {
            var (recoveryHttp, recoveryDemo) = fixture.Create(cookie);
            SetAction<DemoController>(recoveryHttp, action, action == nameof(DemoController.Stop) ? "POST" : "GET");
            var reachedRecovery = false;
            await new DemoMiddleware(_ => { reachedRecovery = true; return Task.CompletedTask; })
                .InvokeAsync(recoveryHttp, recoveryDemo);
            Assert.True(reachedRecovery);
        }

        demo.Stop();
        var deletion = Assert.Single(http.Response.Headers.SetCookie);
        Assert.StartsWith(DemoRequestContext.CookieName + "=", deletion);
        Assert.Contains("expires=", deletion, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(typeof(ProjectionsController), nameof(ProjectionsController.ListByIam), "GET")]
    [InlineData(typeof(ProjectionsController), nameof(ProjectionsController.Create), "POST")]
    [InlineData(typeof(AdminUsersController), nameof(AdminUsersController.SearchUsers), "GET")]
    [InlineData(typeof(ChartStringLabelsController), nameof(ChartStringLabelsController.GetAsync), "GET")]
    [InlineData(typeof(UserController), nameof(UserController.MePhoto), "GET")]
    [InlineData(typeof(SystemController), nameof(SystemController.Emulate), "GET")]
    [InlineData(typeof(NotificationController), nameof(NotificationController.Update), "PUT")]
    [InlineData(typeof(ProjectController), "FutureExport", "GET")]
    [InlineData(typeof(ProjectController), nameof(ProjectController.GetByIamIdAsync), "POST")]
    public async Task Presentation_allowlist_blocks_unsupported_endpoints_even_for_admins(
        Type controller, string action, string method)
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create(fixture.Start());
        ((ClaimsIdentity)http.User.Identity!).AddClaim(new Claim(ClaimTypes.Role, "Admin"));
        SetAction(http, controller, action, method);

        await AssertRejectedAsync(http, demo, StatusCodes.Status403Forbidden);
    }

    [Theory]
    [InlineData(typeof(UserController), nameof(UserController.Me))]
    [InlineData(typeof(ProjectController), nameof(ProjectController.GetByIamIdAsync))]
    [InlineData(typeof(ProjectController), nameof(ProjectController.GetProjectCostsAsync))]
    [InlineData(typeof(SearchController), nameof(SearchController.GetProjectsWhereCurrentUserIsTeamMember))]
    [InlineData(typeof(SystemController), nameof(SystemController.GetFeatures))]
    public async Task Supported_reads_keep_the_real_audit_principal_and_mark_responses_uncacheable(Type controller, string action)
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create(fixture.Start());
        var principal = http.User;
        SetAction(http, controller, action);
        var reached = false;

        await new DemoMiddleware(context =>
        {
            reached = true;
            Assert.Same(principal, context.User);
            return Task.CompletedTask;
        }).InvokeAsync(http, demo);

        Assert.True(reached);
        Assert.Equal("demo:pi", http.Response.Headers[DemoRequestContext.ContextHeader].ToString());
        Assert.Equal("no-store", http.Response.Headers.CacheControl.ToString());
    }

    [Theory]
    [InlineData(true, "normal")]
    [InlineData(true, "demo:pm")]
    [InlineData(false, "demo:pi")]
    public async Task Stale_tab_context_cannot_cross_the_presentation_boundary(bool active, string expected)
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create(active ? fixture.Start() : null);
        SetAction<ProjectController>(http, nameof(ProjectController.GetByIamIdAsync));
        http.Request.Headers[DemoRequestContext.ContextHeader] = expected;

        await AssertRejectedAsync(http, demo, StatusCodes.Status409Conflict, "presentation_context_changed");
    }

    [Fact]
    public async Task User_bootstrap_can_discover_a_changed_valid_session()
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create(fixture.Start());
        SetAction<UserController>(http, nameof(UserController.Me));
        http.Request.Headers[DemoRequestContext.ContextHeader] = "normal";
        var reached = false;

        await new DemoMiddleware(_ => { reached = true; return Task.CompletedTask; }).InvokeAsync(http, demo);

        Assert.True(reached);
        Assert.Equal("demo:pi", http.Response.Headers[DemoRequestContext.ContextHeader].ToString());
    }

    [Theory]
    [InlineData("pi")]
    [InlineData("pm")]
    public async Task Fictional_profile_photo_and_notice_do_not_require_a_database_or_graph(string profile)
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create(fixture.Start(profile));
        // Null dependencies prove these paths never resolve a real user, announcement, or profile photo.
        var userController = new UserController(null!, null!, demo)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
        var userResult = Assert.IsType<OkObjectResult>(await userController.Me(default));
        var response = JsonSerializer.SerializeToElement(userResult.Value);
        Assert.True(response.GetProperty("IsPresentation").GetBoolean());
        Assert.Equal(profile, response.GetProperty("PresentationProfile").GetString());
        Assert.Equal(demo.PresentationUser!.IamId, response.GetProperty("IamId").GetString());
        Assert.DoesNotContain("actual-presenter", response.ToString());
        Assert.IsType<NotFoundResult>(await userController.MePhoto(default));

        var noticeController = new NotificationController(null!, demo);
        var noticeResult = await noticeController.Get(default);
        var notice = Assert.IsType<NotificationController.NotificationResponse>(
            Assert.IsType<OkObjectResult>(noticeResult.Result).Value);
        Assert.False(notice.Enabled);
        Assert.Empty(notice.Message);
    }

    [Theory]
    [InlineData("pi")]
    [InlineData("pm")]
    public async Task Portfolio_and_search_use_synthetic_identity_without_user_rows_or_graphql(string profile)
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create(fixture.Start(profile));
        var source = new DemoDataSource(new DateTime(2026, 11, 1));
        var financial = new ThrowingFinancialApi();
        var flags = Options.Create(new FeatureFlagOptions { UseGraphQLAPI = true });
        var portfolio = new PpmPortfolioService(financial, source, flags, demo);
        var employeeId = demo.PresentationUser!.EmployeeId;
        var role = profile == "pi" ? PpmRole.PrincipalInvestigator : PpmRole.ProjectManager;

        var memberships = await portfolio.GetEmployeeProjectsAsync(employeeId, role, default);
        Assert.NotEmpty(memberships);
        Assert.NotEmpty(await portfolio.GetProjectTeamAsync(memberships[0].ProjectNumber, role, default));
        var manager = DemoDataSet.GetProfile("pm")!;
        Assert.Contains(manager.EmployeeId,
            await portfolio.GetProjectManagerEmployeeIdsAsync([manager.EmployeeId], default));

        var search = new SearchController(null!, financial, new FixedAuthorization(true), source, flags, portfolio, demo)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
        var teamResult = Assert.IsType<OkObjectResult>(await search.GetProjectsWhereCurrentUserIsTeamMember(default));
        var team = Assert.IsType<SearchController.SearchTeamMemberProjectsResponse>(teamResult.Value);
        Assert.NotEmpty(team.Projects);
        Assert.All(team.Projects, project => Assert.StartsWith("DEMO", project.ProjectNumber));
        var searchResult = Assert.IsType<OkObjectResult>(await search.SearchProjects("DEMO", default));
        Assert.NotEmpty(Assert.IsAssignableFrom<IReadOnlyList<SearchController.SearchProject>>(searchResult.Value));

        var pi = DemoDataSet.GetProfile("pi")!;
        var project = new ProjectController(source, new FixedAuthorization(false), null!, portfolio, demo)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
        Assert.IsType<OkObjectResult>(await project.GetByIamIdAsync(pi.IamId, default));
        Assert.Equal(0, financial.Calls);
    }

    [Theory]
    [InlineData(nameof(DemoController.Start))]
    [InlineData(nameof(DemoController.Stop))]
    public async Task Presentation_mutations_reject_requests_without_antiforgery_tokens(string action)
    {
        using var fixture = new SessionFixture();
        var (http, demo) = fixture.Create();
        http.Request.Method = "POST";
        var controller = new DemoController(demo, fixture.Antiforgery)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };

        var result = action == nameof(DemoController.Start) ? await controller.Start("pi") : await controller.Stop();

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.False(http.Response.Headers.ContainsKey("Set-Cookie"));
    }

    [Fact]
    public async Task Expired_real_sign_in_can_explicitly_exit_with_valid_antiforgery_but_cannot_start()
    {
        using var fixture = new SessionFixture();
        var presentationCookie = fixture.Start();
        var (statusHttp, statusDemo) = fixture.Create(presentationCookie);
        statusHttp.User = new ClaimsPrincipal(new ClaimsIdentity());
        var statusController = new DemoController(statusDemo, fixture.Antiforgery)
        {
            ControllerContext = new ControllerContext { HttpContext = statusHttp },
        };
        var status = Assert.IsType<OkObjectResult>(statusController.Status());
        var state = JsonSerializer.SerializeToElement(status.Value);
        Assert.False(state.GetProperty("CanStart").GetBoolean());
        Assert.False(state.GetProperty("IsActive").GetBoolean());
        var requestToken = state.GetProperty("RequestToken").GetString();
        Assert.False(string.IsNullOrEmpty(requestToken));

        var (http, demo) = fixture.Create(presentationCookie + "; " + CookiePair(statusHttp));
        http.User = new ClaimsPrincipal(new ClaimsIdentity());
        http.Request.Method = "POST";
        http.Request.Headers["X-CSRF-TOKEN"] = requestToken;
        var controller = new DemoController(demo, fixture.Antiforgery)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };

        Assert.IsType<ForbidResult>(await controller.Start("pi"));
        Assert.False(http.Response.Headers.ContainsKey("Set-Cookie"));
        Assert.IsType<NoContentResult>(await controller.Stop());
        var deletion = Assert.Single(http.Response.Headers.SetCookie);
        Assert.StartsWith(DemoRequestContext.CookieName + "=", deletion);
        Assert.Contains("expires=", deletion, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task AssertRejectedAsync(HttpContext http, DemoRequestContext demo, int status, string? code = null)
    {
        var reached = false;
        await new DemoMiddleware(_ => { reached = true; return Task.CompletedTask; }).InvokeAsync(http, demo);

        Assert.False(reached);
        Assert.Equal(status, http.Response.StatusCode);
        Assert.Equal("no-store", http.Response.Headers.CacheControl.ToString());
        if (code is not null)
        {
            http.Response.Body.Position = 0;
            using var body = await JsonDocument.ParseAsync(http.Response.Body);
            Assert.Equal(code, body.RootElement.GetProperty("code").GetString());
        }
    }

    private static void SetAction<TController>(HttpContext http, string action, string method = "GET") =>
        SetAction(http, typeof(TController), action, method);

    private static void SetAction(HttpContext http, Type controller, string action, string method = "GET")
    {
        http.Request.Method = method;
        http.Request.Path = "/api/test";
        http.SetEndpoint(new Endpoint(null, new EndpointMetadataCollection(new ControllerActionDescriptor
        {
            ControllerTypeInfo = controller.GetTypeInfo(),
            // MVC's default action name omits an Async suffix even when the method retains it.
            ActionName = action.EndsWith("Async", StringComparison.Ordinal) ? action[..^5] : action,
            MethodInfo = controller.GetMethod(action) ?? typeof(object).GetMethod(nameof(ToString))!,
        }), "Test presentation endpoint"));
    }

    private static string CookiePair(HttpContext http) => http.Response.Headers.SetCookie.ToString().Split(';')[0];

    private sealed class SessionFixture : IDisposable
    {
        private readonly IDataProtectionProvider _protection = new EphemeralDataProtectionProvider();
        private readonly ServiceProvider _services;
        private readonly IHostEnvironment _environment;
        public DemoOptions Options { get; }
        public MutableTimeProvider Clock { get; } = new();
        public IAntiforgery Antiforgery => _services.GetRequiredService<IAntiforgery>();

        public SessionFixture(string environment = "Development", bool enabled = true, bool allowlisted = true)
        {
            _environment = new TestEnvironment { EnvironmentName = environment };
            Options = new DemoOptions
            {
                Enabled = enabled,
                AllowedPresenterIds = allowlisted ? [PresenterId.ToString()] : [],
            };
            var registration = new ServiceCollection();
            registration.AddLogging();
            registration.AddSingleton<IDataProtectionProvider>(_protection);
            registration.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");
            _services = registration.BuildServiceProvider();
        }

        public (DefaultHttpContext Http, DemoRequestContext Demo) Create(string? cookie = null, Guid? presenter = null)
        {
            var http = new DefaultHttpContext
            {
                RequestServices = _services,
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimConstants.ObjectId, (presenter ?? PresenterId).ToString()),
                     new Claim(ClaimTypes.Name, "actual-presenter"),
                     new Claim("kerberos", "actual-presenter")], "test")),
            };
            http.Request.Scheme = "https";
            http.Request.Host = new HostString("walter.example.invalid");
            http.Response.Body = new MemoryStream();
            if (cookie is not null) http.Request.Headers.Cookie = cookie;
            var demo = new DemoRequestContext(new FixedAccessor { HttpContext = http }, _protection,
                Microsoft.Extensions.Options.Options.Create(Options), _environment, Clock);
            return (http, demo);
        }

        public string Start(string profile = "pi")
        {
            var (http, demo) = Create();
            Assert.True(demo.Start(profile));
            return CookiePair(http);
        }

        public void Dispose() => _services.Dispose();
    }

    private sealed class FixedAccessor : IHttpContextAccessor
    {
        public HttpContext? HttpContext { get; set; }
    }

    private sealed class MutableTimeProvider : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 11, 6, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan elapsed) => _now += elapsed;
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "DemoSessionTests";
        public string ContentRootPath { get; set; } = "C:\\GitProjects\\Walter";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class ThrowingFinancialApi : IFinancialApiService
    {
        public int Calls { get; private set; }
        public IAggieEnterpriseClient GetClient()
        {
            Calls++;
            throw new InvalidOperationException("Presentation requested the live financial service.");
        }
    }

    private sealed class FixedAuthorization(bool allowed) : IAuthorizationService
    {
        public Task<AuthorizationResult> AuthorizeAsync(ClaimsPrincipal user, object? resource, string policyName) =>
            Task.FromResult(allowed ? AuthorizationResult.Success() : AuthorizationResult.Failed());

        public Task<AuthorizationResult> AuthorizeAsync(ClaimsPrincipal user, object? resource,
            IEnumerable<IAuthorizationRequirement> requirements) =>
            Task.FromResult(allowed ? AuthorizationResult.Success() : AuthorizationResult.Failed());
    }
}
