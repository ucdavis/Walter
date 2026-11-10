using System.Net;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Microsoft.Identity.Web;
using server.core.Data;
using server.core.Domain;
using server.Helpers;
using Server.Controllers;
using Server.Services;
using Server.Tests;

namespace server.tests.Controllers;

public class FeatureManagementTests
{
    [Fact]
    public async Task Anonymous_features_are_denied_but_rum_remains_public()
    {
        await using var host = await FeatureHost.Start();
        (await host.Client.GetAsync("/api/system/features")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await host.Client.GetAsync("/api/system/rum-config")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Ordinary_user_gets_exact_contract_and_no_store_but_cannot_emulate()
    {
        await using var host = await FeatureHost.Start(new Dictionary<string, string?>
        {
            ["FeatureManagement:walter.BurndownEnabled"] = "true",
            ["FeatureManagement:walter.ExpenditureProgressEnabled"] = "false",
            ["FeatureManagement:walter.ProjectCostsEnabled"] = "true",
            ["FeatureManagement:walter.ProjectionsEnabled"] = "false",
        });
        host.SignIn();
        var response = await host.Client.GetAsync("/api/system/features");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoStore.Should().BeTrue();
        response.Headers.CacheControl.NoCache.Should().BeTrue();
        var json = await response.Content.ReadFromJsonAsync<Dictionary<string, bool>>();
        json.Should().BeEquivalentTo(new Dictionary<string, bool>
        {
            ["burndownEnabled"] = true,
            ["expenditureProgressEnabled"] = false,
            ["projectCostsEnabled"] = true,
            ["projectionsEnabled"] = false,
        });
        (await host.Client.GetAsync("/api/system/emulate/someone")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        host.Client.DefaultRequestHeaders.Add("X-Test-Role", "System");
        // A blank identifier reaches the action's validation only for an authorized operator.
        (await host.Client.GetAsync("/api/system/emulate/%20")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("walter.BurndownEnabled", "burndownEnabled")]
    [InlineData("walter.ExpenditureProgressEnabled", "expenditureProgressEnabled")]
    [InlineData("walter.ProjectCostsEnabled", "projectCostsEnabled")]
    [InlineData("walter.ProjectionsEnabled", "projectionsEnabled")]
    public async Task Each_native_id_controls_only_its_contract_property(string feature, string property)
    {
        await using var host = await FeatureHost.Start(new Dictionary<string, string?>
        {
            [$"feature_management:feature_flags:0:id"] = feature,
            [$"feature_management:feature_flags:0:enabled"] = "true",
            ["FeatureManagement:anotherApp.BurndownEnabled"] = "true",
        });
        host.SignIn();
        var flags = await host.Flags();
        flags![property].Should().BeTrue();
        flags.Where(flag => flag.Key != property).Should().OnlyContain(flag => !flag.Value);
    }

    [Fact]
    public async Task Native_definition_changes_and_deletions_apply_without_restarting()
    {
        await using var host = await FeatureHost.Start(new Dictionary<string, string?>
        {
            ["feature_management:feature_flags:0:id"] = "walter.BurndownEnabled",
            ["feature_management:feature_flags:0:enabled"] = "true",
        });
        host.SignIn();
        (await host.Flags())["burndownEnabled"].Should().BeTrue();
        host.Configuration["feature_management:feature_flags:0:enabled"] = "false";
        ((IConfigurationRoot)host.Configuration).Reload();
        (await host.Flags())["burndownEnabled"].Should().BeFalse();
        host.Configuration["feature_management:feature_flags:0:id"] = null;
        host.Configuration["feature_management:feature_flags:0:enabled"] = null;
        ((IConfigurationRoot)host.Configuration).Reload();
        (await host.Flags())["burndownEnabled"].Should().BeFalse();
        host.Logs.Messages.Should().Contain(message => message.Contains("walter.BurndownEnabled") && message.Contains("missing"));
    }

    [Fact]
    public async Task Missing_flags_are_off_with_warnings_even_at_startup()
    {
        await using var host = await FeatureHost.Start();
        host.SignIn();
        (await host.Flags()).Should().OnlyContain(flag => !flag.Value);
        foreach (var name in UiFeatureNames.LegacyNames.Values)
        {
            host.Logs.Messages.Should().Contain(message => message.Contains(name) && message.Contains("missing"));
        }
    }

    [Theory]
    [InlineData("111", 0, true)]
    [InlineData("222", 0, false)]
    [InlineData("333", 100, false)]
    [InlineData("222", 100, true)]
    public async Task Native_targeting_uses_IAM_allowlists_and_exclusions(string iamId, int defaultPercentage, bool enabled)
    {
        await using var host = await FeatureHost.Start(Targeting(defaultPercentage));
        host.SignIn(iamId: iamId);
        (await host.Flags())["burndownEnabled"].Should().Be(enabled);
    }

    [Fact]
    public async Task Exclusion_wins_over_explicit_inclusion()
    {
        var config = Targeting(100);
        config["feature_management:feature_flags:0:conditions:client_filters:0:parameters:Audience:Exclusion:Users:1"] = "111";
        await using var host = await FeatureHost.Start(config);
        host.SignIn(iamId: "111");
        (await host.Flags())["burndownEnabled"].Should().BeFalse();
    }

    [Fact]
    public async Task Server_resolves_IAM_from_effective_user_record_during_emulation()
    {
        await using var host = await FeatureHost.Start(Targeting(0));
        var target = new User { Id = Guid.NewGuid(), IamId = "111", Kerberos = "target", EmployeeId = "employee" };
        host.Database.Users.Add(target);
        await host.Database.SaveChangesAsync();
        host.SignIn(target.Id, "333");
        host.Client.DefaultRequestHeaders.Add("X-Test-Emulating", "operator");
        (await host.Flags())["burndownEnabled"].Should().BeTrue();
        host.Client.DefaultRequestHeaders.Remove("X-Test-Emulating");
        host.Client.DefaultRequestHeaders.Remove("X-Test-IAM");
        (await host.Flags())["burndownEnabled"].Should().BeTrue();
    }

    [Fact]
    public async Task Missing_IAM_disables_targeting_even_for_default_on_but_leaves_global_flags_usable()
    {
        var config = Targeting(100);
        config["FeatureManagement:walter.ProjectCostsEnabled"] = "true";
        await using var host = await FeatureHost.Start(config);
        host.SignIn();
        // Browser-controlled identifiers must not select a different person's audience.
        var response = await host.Client.GetFromJsonAsync<Dictionary<string, bool>>("/api/system/features?iamId=111");
        response!["burndownEnabled"].Should().BeFalse();
        response["projectCostsEnabled"].Should().BeTrue();
        host.Logs.Messages.Should().Contain(message => message.Contains("no IAM ID"));
    }

    [Fact]
    public async Task Different_requests_do_not_share_targeting_context()
    {
        await using var host = await FeatureHost.Start(Targeting(0));
        host.SignIn(iamId: "111");
        (await host.Flags())["burndownEnabled"].Should().BeTrue();
        host.Client.DefaultRequestHeaders.Remove("X-Test-IAM");
        host.Client.DefaultRequestHeaders.Add("X-Test-IAM", "222");
        (await host.Flags())["burndownEnabled"].Should().BeFalse();
    }

    [Fact]
    public async Task No_endpoint_uses_legacy_values_through_the_same_feature_manager()
    {
        var configuration = new ConfigurationManager();
        configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["FeatureFlags:BurndownEnabled"] = "true",
            ["FeatureFlags:ExpenditureProgressEnabled"] = "false",
            ["FeatureFlags:ProjectCostsEnabled"] = "false",
            ["FeatureFlags:ProjectionsEnabled"] = "true",
        });
        await using var host = await FeatureHost.Start(configuration, useLegacyFallback: true);
        host.SignIn();
        (await host.Flags()).Should().BeEquivalentTo(new Dictionary<string, bool>
        {
            ["burndownEnabled"] = true, ["expenditureProgressEnabled"] = false,
            ["projectCostsEnabled"] = false, ["projectionsEnabled"] = true,
        });
    }

    [Fact]
    public async Task Development_file_keeps_all_four_local_defaults_enabled_without_Azure()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "server", "appsettings.Development.json")))
            root = root.Parent;
        root.Should().NotBeNull();
        var configuration = new ConfigurationManager();
        configuration.AddJsonFile(Path.Combine(root!.FullName, "server", "appsettings.Development.json"));
        await using var host = await FeatureHost.Start(configuration, useLegacyFallback: true);
        host.SignIn();
        (await host.Flags()).Should().OnlyContain(flag => flag.Value);
    }

    [Theory]
    [InlineData(null, null, true)]
    [InlineData("false", null, false)]
    [InlineData("true", "false", false)]
    [InlineData("false", "true", true)]
    public void GraphQL_legacy_override_keeps_its_precedence(string? nested, string? legacy, bool expected)
    {
        var configuration = new ConfigurationManager();
        configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["FeatureFlags:UseGraphQLAPI"] = nested,
            ["FeatureFlags_UseGraphQLAPI"] = legacy,
        }.Where(pair => pair.Value is not null));
        var services = new ServiceCollection();
        services.AddWalterFeatureManagement(configuration, "Production").Should().BeFalse();
        using var provider = services.BuildServiceProvider();
        provider.GetRequiredService<IOptions<FeatureFlagOptions>>().Value.UseGraphQLAPI.Should().Be(expected);
    }

    private static Dictionary<string, string?> Targeting(int defaultPercentage) => new()
    {
        ["feature_management:feature_flags:0:id"] = "walter.BurndownEnabled",
        ["feature_management:feature_flags:0:enabled"] = "true",
        ["feature_management:feature_flags:0:conditions:client_filters:0:name"] = "Microsoft.Targeting",
        ["feature_management:feature_flags:0:conditions:client_filters:0:parameters:Audience:Users:0"] = "111",
        ["feature_management:feature_flags:0:conditions:client_filters:0:parameters:Audience:Exclusion:Users:0"] = "333",
        ["feature_management:feature_flags:0:conditions:client_filters:0:parameters:Audience:DefaultRolloutPercentage"] = defaultPercentage.ToString(),
    };

    private sealed class FeatureHost(WebApplication app, ConfigurationManager configuration, AppDbContext database, TestLogs logs) : IAsyncDisposable
    {
        public HttpClient Client { get; } = app.GetTestClient();
        public ConfigurationManager Configuration => configuration;
        public AppDbContext Database => database;
        public TestLogs Logs => logs;

        public static Task<FeatureHost> Start(Dictionary<string, string?>? values = null)
        {
            var configuration = new ConfigurationManager();
            configuration.AddInMemoryCollection(values ?? []);
            return Start(configuration);
        }

        public static async Task<FeatureHost> Start(ConfigurationManager configuration, bool useLegacyFallback = false)
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Test" });
            builder.WebHost.UseTestServer();
            var logs = new TestLogs();
            builder.Logging.ClearProviders();
            builder.Logging.AddProvider(logs);
            var database = TestDbContextFactory.CreateInMemory();
            builder.Services.AddSingleton(database);
            builder.Services.AddScoped<IUserService, UserService>();
            builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("Test", _ => { });
            builder.Services.AddAuthorizationPolicies();
            if (useLegacyFallback)
                builder.Services.AddWalterFeatureManagement(configuration, "Test").Should().BeFalse();
            else
            {
                builder.Services.AddHttpContextAccessor();
                builder.Services.AddScopedFeatureManagement(configuration).WithTargeting<WalterTargetingContextAccessor>();
            }
            builder.Services.AddControllers().AddApplicationPart(typeof(SystemController).Assembly).AddControllersAsServices();
            builder.Services.AddTransient(provider => new SystemController(
                provider.GetRequiredService<IUserService>(), null!, null!, null!, Options.Create(new RumOptions()),
                provider.GetRequiredService<IFeatureManager>(), provider.GetRequiredService<IFeatureDefinitionProvider>(),
                provider.GetRequiredService<IHostEnvironment>(), provider.GetRequiredService<ILogger<SystemController>>()));
            var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapControllers();
            await app.StartAsync();
            return new FeatureHost(app, configuration, database, logs);
        }

        public void SignIn(Guid? userId = null, string? iamId = null)
        {
            Client.DefaultRequestHeaders.Add("X-Test-User", (userId ?? Guid.NewGuid()).ToString());
            if (iamId is not null) Client.DefaultRequestHeaders.Add("X-Test-IAM", iamId);
        }

        public async Task<Dictionary<string, bool>> Flags() =>
            (await Client.GetFromJsonAsync<Dictionary<string, bool>>("/api/system/features"))!;

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.DisposeAsync();
            await database.DisposeAsync();
            ((IDisposable)configuration).Dispose();
        }
    }

    private sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var userId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var claims = new List<Claim> { new(ClaimConstants.ObjectId, userId.ToString()) };
            if (Request.Headers.TryGetValue("X-Test-IAM", out var iamId)) claims.Add(new(server.Helpers.ClaimsPrincipalExtensions.IamIdClaimType, iamId.ToString()));
            if (Request.Headers.TryGetValue("X-Test-Role", out var role)) claims.Add(new(ClaimTypes.Role, role.ToString()));
            if (Request.Headers.TryGetValue("X-Test-Emulating", out var emulating)) claims.Add(new("emulating_user", emulating.ToString()));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
        }
    }

    private sealed class TestLogs : ILoggerProvider
    {
        public ConcurrentQueue<string> Messages { get; } = [];
        public ILogger CreateLogger(string categoryName) => new TestLogger(Messages);
        public void Dispose() { }
        private sealed class TestLogger(ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Warning;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                if (IsEnabled(logLevel)) messages.Enqueue(formatter(state, exception));
            }
        }
    }
}
