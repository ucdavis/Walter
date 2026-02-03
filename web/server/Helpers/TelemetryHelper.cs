using Microsoft.Extensions.Hosting;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace server.Helpers;

public static class TelemetryHelper
{
    /// <summary>
    /// Configures OpenTelemetry logging with JSON console output and OTLP exporter
    /// </summary>
    public static void ConfigureLogging(ILoggingBuilder logging)
    {
        logging.ClearProviders();
        logging.AddJsonConsole(options =>
        {
            options.IncludeScopes = true;
            options.UseUtcTimestamp = true;
        });

        logging.AddOpenTelemetry(logOptions =>
        {
            logOptions.IncludeFormattedMessage = true; // keep original message
            logOptions.IncludeScopes = true;           // carry our scope props
            logOptions.ParseStateValues = true;        // structured state
            logOptions.AddOtlpExporter(); // configured via OTEL_* env vars / IConfiguration
        });
    }

    /// <summary>
    /// Configures OpenTelemetry tracing and metrics with ASP.NET Core and HTTP client instrumentation
    /// </summary>
    public static void ConfigureOpenTelemetry(IServiceCollection services, IHostEnvironment env)
    {
        Sampler sampler = env.IsDevelopment()
            ? new AlwaysOnSampler()
            : new TraceIdRatioBasedSampler(0.2);

        services.AddOpenTelemetry()
            .WithTracing(t => t
                    .SetSampler(sampler)
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddSqlClientInstrumentation(o =>
                    {
                        o.RecordException = true;
                    })
                    .AddOtlpExporter() // configured via OTEL_* env vars / IConfiguration
            )
            .WithMetrics(m => m
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddOtlpExporter() // configured via OTEL_* env vars / IConfiguration
            );
    }
}
