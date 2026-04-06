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

    public RumPublicConfig ToPublicConfig(IHostEnvironment hostEnvironment)
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

        return new RumPublicConfig
        {
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
}

public sealed class RumPublicConfig
{
    public bool Enabled { get; init; }

    public string ServiceName { get; init; } = string.Empty;

    public string ServiceVersion { get; init; } = string.Empty;

    public string Environment { get; init; } = string.Empty;

    public string ServerUrl { get; init; } = string.Empty;

    public double TransactionSampleRate { get; init; }
}
