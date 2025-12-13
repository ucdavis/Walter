using AggieEnterpriseApi;
using Microsoft.Extensions.Options;

namespace server.Services;

/// <summary>
/// Service for accessing the Aggie Enterprise Financial API.
/// The GraphQL client is configured as a singleton and can be injected into controllers or other services.
/// </summary>
public interface IFinancialApiService
{
    /// <summary>
    /// Gets the configured GraphQL client for the Financial API
    /// </summary>
    IAggieEnterpriseClient GetClient();
}

public sealed class FinancialApiService : IFinancialApiService
{
    private readonly IAggieEnterpriseClient _client;

    public FinancialApiService(IOptions<FinancialSettings> financialSettings)
    {
        ArgumentNullException.ThrowIfNull(financialSettings);

        var settings = financialSettings.Value;

        // Validate required settings
        if (string.IsNullOrWhiteSpace(settings.ApiUrl))
        {
            throw new InvalidOperationException("Financial API URL is not configured.");
        }

        if (string.IsNullOrWhiteSpace(settings.TokenEndpoint))
        {
            throw new InvalidOperationException("Financial Token Endpoint is not configured.");
        }

        if (string.IsNullOrWhiteSpace(settings.ConsumerKey))
        {
            throw new InvalidOperationException("Financial Consumer Key is not configured.");
        }

        if (string.IsNullOrWhiteSpace(settings.ConsumerSecret))
        {
            throw new InvalidOperationException("Financial Consumer Secret is not configured.");
        }

        if (string.IsNullOrWhiteSpace(settings.ScopeApp))
        {
            throw new InvalidOperationException("Financial Scope App is not configured.");
        }

        if (string.IsNullOrWhiteSpace(settings.ScopeEnv))
        {
            throw new InvalidOperationException("Financial Scope Environment is not configured.");
        }

        var scope = $"{settings.ScopeApp}-{settings.ScopeEnv}";

        _client = GraphQlClient.Get(
            settings.ApiUrl,
            settings.TokenEndpoint,
            settings.ConsumerKey,
            settings.ConsumerSecret,
            scope
        );
    }

    public IAggieEnterpriseClient GetClient()
    {
        return _client;
    }
}

public sealed class FinancialSettings
{
    public string? ApiUrl { get; set; }
    public string? ConsumerKey { get; set; }
    public string? ConsumerSecret { get; set; }
    public string? TokenEndpoint { get; set; }
    public string? ScopeApp { get; set; }
    public string? ScopeEnv { get; set; }
}
