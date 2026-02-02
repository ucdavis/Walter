using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace server.HealthChecks;

public sealed class DmConnectivityHealthCheck : IHealthCheck
{
    private sealed record DmConnectivityResult(string Status, int SourcesTested, int SourcesFailed);

    private readonly IConfiguration _configuration;
    private readonly ILogger<DmConnectivityHealthCheck> _logger;

    public DmConnectivityHealthCheck(
        IConfiguration configuration,
        ILogger<DmConnectivityHealthCheck> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken ct = default)
    {
        var connectionString = _configuration["DM_CONNECTION"];

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return new HealthCheckResult(
                status: context.Registration.FailureStatus,
                description: "DM_CONNECTION is not set.");
        }

        try
        {
            await using var conn = new SqlConnection(connectionString);
            await conn.OpenAsync(ct);

            var cmd = new CommandDefinition(
                commandText: "dbo.usp_HealthCheck_Connectivity",
                commandType: CommandType.StoredProcedure,
                commandTimeout: 60,
                cancellationToken: ct);

            var result = await conn.QuerySingleAsync<DmConnectivityResult>(cmd);

            var data = new Dictionary<string, object>
            {
                ["sourcesTested"] = result.SourcesTested,
                ["sourcesFailed"] = result.SourcesFailed,
            };

            if (result.SourcesFailed > 0)
            {
                return new HealthCheckResult(
                    status: context.Registration.FailureStatus,
                    description: result.Status,
                    data: data);
            }

            return HealthCheckResult.Healthy(description: result.Status, data: data);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Datamart connectivity health check failed.");

            return new HealthCheckResult(
                status: context.Registration.FailureStatus,
                description: ex.Message,
                exception: ex);
        }
    }
}
