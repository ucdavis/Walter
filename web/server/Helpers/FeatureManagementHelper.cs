using Azure.Identity;
using Azure.Data.AppConfiguration;
using Microsoft.Extensions.Azure;
using Microsoft.FeatureManagement;

namespace server.Helpers;

public static class FeatureManagementHelper
{
    /// <summary>
    /// Registers UI flag evaluation and IAM targeting. Returns whether request-driven Azure refresh is needed.
    /// Legacy UI settings remain the fallback only when no store endpoint is configured.
    /// </summary>
    public static bool AddWalterFeatureManagement(
        this IServiceCollection services, ConfigurationManager configuration, string environmentName,
        IAzureClientFactory<ConfigurationClient>? clientFactory = null)
    {
        services.Configure<FeatureFlagOptions>(configuration.GetSection(FeatureFlagOptions.SectionName));
        services.PostConfigure<FeatureFlagOptions>(options =>
        {
            // Preserve the single-underscore environment key used for the GraphQL rollout switch.
            options.UseGraphQLAPI = configuration.GetValue<bool?>("FeatureFlags_UseGraphQLAPI")
                ?? options.UseGraphQLAPI;
        });

        var endpoint = configuration["AppConfiguration:Endpoint"];
        var useAzure = !string.IsNullOrWhiteSpace(endpoint);
        IConfiguration featureConfiguration;

        if (useAzure)
        {
            // Isolate Azure definitions: a deleted/mislabeled flag must never inherit a local enabled default.
            var azureFlags = new ConfigurationBuilder()
                .AddAzureAppConfiguration(options =>
                {
                    options.Connect(new Uri(endpoint!), new DefaultAzureCredential())
                    // Suppress the default all-keys query. Load flags only through the native selector
                    // so the provider tracks every loaded flag for deletion during refresh.
                    .Select(".", environmentName)
                    .UseFeatureFlags(flags => flags
                        .Select("walter.*", environmentName)
                        .SetRefreshInterval(TimeSpan.FromMinutes(10)))
                    .ConfigureStartupOptions(startup => startup.Timeout = TimeSpan.FromSeconds(30));
                    if (clientFactory is not null) options.SetClientFactory(clientFactory);
                }, optional: false)
                .Build();

            // The middleware discovers refreshers through chained configuration providers.
            configuration.AddConfiguration(azureFlags, shouldDisposeConfiguration: true);
            featureConfiguration = azureFlags;
            services.AddAzureAppConfiguration();
        }
        else
        {
            var defaults = UiFeatureNames.LegacyNames.Select(flag => new KeyValuePair<string, string?>(
                $"FeatureManagement:{flag.Value}",
                configuration.GetValue<bool>($"FeatureFlags:{flag.Key}").ToString()));
            featureConfiguration = new ConfigurationBuilder()
                .AddInMemoryCollection(defaults)
                .Build();
        }

        services.AddHttpContextAccessor();
        services.AddScopedFeatureManagement(featureConfiguration)
            .WithTargeting<WalterTargetingContextAccessor>();
        services.Configure<FeatureManagementOptions>(options => options.IgnoreMissingFeatures = true);
        return useAzure;
    }
}
