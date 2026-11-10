using System.Text.Json;
using Azure;
using Azure.Core;
using Azure.Core.Pipeline;
using Azure.Data.AppConfiguration;
using FluentAssertions;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.AzureAppConfiguration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.FeatureManagement;
using server.Helpers;
using Server.Services;
using Server.Tests;

namespace server.tests.Controllers;

public class AzureFeatureConfigurationTests
{
    [Theory]
    [InlineData("Development")]
    [InlineData("Test")]
    [InlineData("Production")]
    public async Task Azure_uses_only_matching_native_flags_and_never_inherits_local_defaults(string environment)
    {
        var client = new StoreClient([
            Flag("walter.BurndownEnabled", environment),
            Flag("walter.ProjectCostsEnabled", "WrongLabel"),
            Flag("anotherApp.ProjectionsEnabled", environment),
            new ConfigurationSetting("FeatureManagement:walter.ProjectionsEnabled", "true", environment),
        ]);
        var configuration = LocalDefaults();
        using var configurationLifetime = (IDisposable)configuration;
        var services = new ServiceCollection();
        services.AddLogging();
        using var database = TestDbContextFactory.CreateInMemory();
        services.AddSingleton(database);
        services.AddScoped<IUserService, UserService>();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddWalterFeatureManagement(configuration, environment, new ClientFactory(client)).Should().BeTrue();
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var manager = scope.ServiceProvider.GetRequiredService<IFeatureManager>();
        (await manager.IsEnabledAsync(UiFeatureNames.Burndown)).Should().BeTrue();
        (await manager.IsEnabledAsync(UiFeatureNames.ProjectCosts)).Should().BeFalse();
        (await manager.IsEnabledAsync(UiFeatureNames.Projections)).Should().BeFalse();
        (await manager.GetFeatureNamesAsync().ToListAsync()).Should().Equal(UiFeatureNames.Burndown);
        client.Selectors.Should().HaveCount(2).And.OnlyContain(selector =>
            (selector.KeyFilter == "." || selector.KeyFilter == ".appconfig.featureflag/walter.*") &&
            selector.LabelFilter == environment);
        client.Selectors.Count(selector => selector.KeyFilter == ".appconfig.featureflag/walter.*").Should().Be(1);

        // Middleware must find the refresher through the chained configuration root.
        var refresher = provider.GetRequiredService<IConfigurationRefresherProvider>().Refreshers.Single();
        var startupRequests = client.Selectors.Count;
        for (var i = 0; i < 10; i++)
        {
            await refresher.TryRefreshAsync();
            (await manager.IsEnabledAsync(UiFeatureNames.Burndown)).Should().BeTrue();
        }
        client.Selectors.Should().HaveCount(startupRequests, "evaluations and refresh calls inside the interval use the shared cache");

        client.ReplaceSettings([]);
        await RefreshNow(refresher);
        client.Selectors.Count.Should().BeGreaterThan(startupRequests);
        (await manager.IsEnabledAsync(UiFeatureNames.Burndown)).Should().BeFalse();
        (await manager.GetFeatureNamesAsync().ToListAsync()).Should().BeEmpty();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("WrongLabel")]
    public async Task Flags_removed_between_startup_reads_stay_missing_after_due_refresh(string? newLabel)
    {
        string[] names = [
            "walter.BurndownEnabled", "walter.ExpenditureProgressEnabled",
            "walter.ProjectCostsEnabled", "walter.ProjectionsEnabled",
        ];
        var client = new StoreClient(names.Select(name => Flag(name, "Test")).ToArray())
        {
            SettingsAfterFirstRead = newLabel is null ? [] : names.Select(name => Flag(name, newLabel)).ToArray(),
        };
        var configuration = LocalDefaults();
        using var configurationLifetime = (IDisposable)configuration;
        var services = new ServiceCollection();
        services.AddLogging();
        using var database = TestDbContextFactory.CreateInMemory();
        services.AddSingleton(database);
        services.AddScoped<IUserService, UserService>();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddWalterFeatureManagement(configuration, "Test", new ClientFactory(client)).Should().BeTrue();
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var manager = scope.ServiceProvider.GetRequiredService<IFeatureManager>();
        var definitions = scope.ServiceProvider.GetRequiredService<IFeatureDefinitionProvider>();
        foreach (var name in names)
        {
            (await manager.IsEnabledAsync(name)).Should().BeFalse();
            (await definitions.GetFeatureDefinitionAsync(name)).Should().BeNull();
        }

        var startupRequests = client.Selectors.Count;
        await RefreshNow(provider.GetRequiredService<IConfigurationRefresherProvider>().Refreshers.Single());
        client.Selectors.Count.Should().BeGreaterThan(startupRequests);
        foreach (var name in names)
        {
            (await manager.IsEnabledAsync(name)).Should().BeFalse();
            (await definitions.GetFeatureDefinitionAsync(name)).Should().BeNull();
        }
    }

    [Fact]
    public void Configured_but_inaccessible_store_fails_startup_instead_of_using_enabled_local_flags()
    {
        var configuration = LocalDefaults();
        using var configurationLifetime = (IDisposable)configuration;
        var services = new ServiceCollection();
        var configure = () => services.AddWalterFeatureManagement(configuration, "Test",
            new ClientFactory(new StoreClient([]) { Failure = new RequestFailedException(403, "Access denied") }));
        var failure = configure.Should().Throw<TimeoutException>()
            .WithInnerException<AggregateException>().Which;
        failure.InnerExceptions.Should().NotBeEmpty()
            .And.OnlyContain(exception => exception is RequestFailedException && ((RequestFailedException)exception).Status == 403);
    }

    private static ConfigurationManager LocalDefaults()
    {
        var configuration = new ConfigurationManager();
        configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AppConfiguration:Endpoint"] = "https://test.azconfig.io",
            ["FeatureFlags:ProjectCostsEnabled"] = "true",
            ["FeatureManagement:walter.ProjectionsEnabled"] = "true",
        });
        return configuration;
    }

    private static ConfigurationSetting Flag(string id, string label) => new(
        $".appconfig.featureflag/{id}",
        $$$"""{"id":"{{{id}}}","enabled":true,"conditions":{"client_filters":[]}}""", label)
    {
        ContentType = "application/vnd.microsoft.appconfig.ff+json;charset=utf-8",
    };

    private static async Task RefreshNow(IConfigurationRefresher refresher)
    {
        refresher.ProcessPushNotification(new PushNotification
        {
            ResourceUri = new Uri("https://test.azconfig.io"),
            EventType = "Microsoft.AppConfiguration.KeyValueDeleted",
            SyncToken = "offline=dmVyc2lvbg==;sn=1",
        }, TimeSpan.Zero);
        await refresher.RefreshAsync();
    }

    private sealed class ClientFactory(ConfigurationClient client) : IAzureClientFactory<ConfigurationClient>
    {
        public ConfigurationClient CreateClient(string name) => client;
    }

    private sealed class StoreClient(ConfigurationSetting[] settings) : ConfigurationClient
    {
        private int _version = 1;
        public List<SettingSelector> Selectors { get; } = [];
        public Exception? Failure { get; init; }
        public ConfigurationSetting[]? SettingsAfterFirstRead { get; init; }

        public void ReplaceSettings(ConfigurationSetting[] updated)
        {
            settings = updated;
            _version++;
        }

        public override void UpdateSyncToken(string syncToken) { }

        public override AsyncPageable<ConfigurationSetting> GetConfigurationSettingsAsync(
            SettingSelector selector, CancellationToken cancellationToken = default)
        {
            Selectors.Add(selector);
            if (Failure is not null) throw Failure;
            var matching = settings.Where(setting => setting.Label == selector.LabelFilter &&
                (selector.KeyFilter.EndsWith('*')
                    ? setting.Key.StartsWith(selector.KeyFilter[..^1], StringComparison.Ordinal)
                    : setting.Key == selector.KeyFilter)).ToArray();
            var response = new StoreResponse($"\"version-{_version}\"")
            {
                ContentStream = new MemoryStream(JsonSerializer.SerializeToUtf8Bytes(new
                {
                    items = matching.Select(setting => new
                    {
                        key = setting.Key,
                        label = setting.Label,
                        value = setting.Value,
                        content_type = setting.ContentType,
                    }),
                })),
            };
            if (Selectors.Count == 1 && SettingsAfterFirstRead is not null)
                ReplaceSettings(SettingsAfterFirstRead);
            var client = new ConfigurationClient(new Uri("https://test.azconfig.io"), new OfflineCredential(),
                new ConfigurationClientOptions { Transport = new StoreTransport(response) });
            return client.GetConfigurationSettingsAsync(selector, cancellationToken);
        }
    }

    private sealed class OfflineCredential : TokenCredential
    {
        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            new("offline", DateTimeOffset.MaxValue);
        public override ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            ValueTask.FromResult(GetToken(requestContext, cancellationToken));
    }

    private sealed class StoreTransport(Response response) : HttpPipelineTransport
    {
        public override Request CreateRequest() => HttpClientTransport.Shared.CreateRequest();
        public override void Process(HttpMessage message) => message.Response = response;
        public override ValueTask ProcessAsync(HttpMessage message)
        {
            Process(message);
            return ValueTask.CompletedTask;
        }
    }

    private sealed class StoreResponse(string etag) : Response
    {
        public override int Status => 200;
        public override string ReasonPhrase => "OK";
        public override Stream? ContentStream { get; set; }
        public override string ClientRequestId { get; set; } = "offline-test";
        public override void Dispose() { }
        protected override bool ContainsHeader(string name) => name.Equals("ETag", StringComparison.OrdinalIgnoreCase);
        protected override IEnumerable<HttpHeader> EnumerateHeaders() => [new("ETag", etag)];
        protected override bool TryGetHeader(string name, out string value)
        {
            value = ContainsHeader(name) ? etag : "";
            return ContainsHeader(name);
        }
        protected override bool TryGetHeaderValues(string name, out IEnumerable<string> values)
        {
            var found = TryGetHeader(name, out var value);
            values = found ? [value] : [];
            return found;
        }
    }
}
