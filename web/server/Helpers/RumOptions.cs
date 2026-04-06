using System.Globalization;
using System.Reflection;

namespace server.Helpers;

public sealed class RumOptions
{
    public bool Enabled { get; set; }

    public string ServiceName { get; set; } = "walter-web";

    public string? ServiceVersion { get; set; }

    public string? Environment { get; set; }

    public string? ServerUrl { get; set; }

    public string? TransactionSampleRate { get; set; }

    public string? DistributedTracingOrigins { get; set; }

    public RumPublicConfig ToPublicConfig(HttpRequest request, IHostEnvironment hostEnvironment)
    {
        var environment = string.IsNullOrWhiteSpace(Environment)
            ? hostEnvironment.EnvironmentName
            : Environment.Trim();

        var serviceVersion = string.IsNullOrWhiteSpace(ServiceVersion)
            ? ResolveServiceVersion()
            : ServiceVersion.Trim();

        var sampleRate = ResolveSampleRate(environment);
        var serverUrl = ServerUrl?.Trim() ?? string.Empty;
        var isEnabled = Enabled && !string.IsNullOrWhiteSpace(serverUrl);
        var distributedTracingOrigins = ResolveDistributedTracingOrigins(request);

        return new RumPublicConfig
        {
            DistributedTracingOrigins = distributedTracingOrigins,
            Enabled = isEnabled,
            Environment = environment,
            ServerUrl = isEnabled ? serverUrl : string.Empty,
            ServiceName = string.IsNullOrWhiteSpace(ServiceName) ? "walter-web" : ServiceName.Trim(),
            ServiceVersion = serviceVersion,
            TransactionSampleRate = sampleRate,
        };
    }

    internal static string ResolveServiceVersion()
    {
        var informationalVersion = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion;

        if (!string.IsNullOrWhiteSpace(informationalVersion))
        {
            return informationalVersion.Split('+')[0];
        }

        return Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
    }

    internal double ResolveSampleRate(string environmentName)
    {
        if (double.TryParse(TransactionSampleRate, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
        {
            return Math.Clamp(parsed, 0d, 1d);
        }

        return string.Equals(environmentName, Environments.Production, StringComparison.OrdinalIgnoreCase)
            ? 0.2d
            : 1d;
    }

    private string[] ResolveDistributedTracingOrigins(HttpRequest request)
    {
        var configuredOrigins = (DistributedTracingOrigins ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var requestOrigin = $"{request.Scheme}://{request.Host}";
        if (!string.IsNullOrWhiteSpace(requestOrigin))
        {
            configuredOrigins.Insert(0, requestOrigin);
        }

        return configuredOrigins
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}

public sealed class RumPublicConfig
{
    public bool Enabled { get; init; }

    public string ServiceName { get; init; } = string.Empty;

    public string ServiceVersion { get; init; } = string.Empty;

    public string Environment { get; init; } = string.Empty;

    public string ServerUrl { get; init; } = string.Empty;

    public double TransactionSampleRate { get; init; }

    public string[] DistributedTracingOrigins { get; init; } = [];
}
