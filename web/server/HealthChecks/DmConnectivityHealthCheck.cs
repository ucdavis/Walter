using System.Data;
using System.Globalization;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace server.HealthChecks;

public sealed class DmConnectivityHealthCheck : IHealthCheck
{
    internal sealed record DmConnectivityResult(string Status, int SourcesTested, int SourcesFailed);

    private readonly IConfiguration _configuration;
    private readonly ILogger<DmConnectivityHealthCheck> _logger;

    internal static bool TryParseDmConnectivityResult(
        object? row,
        out DmConnectivityResult result)
    {
        result = new DmConnectivityResult(Status: string.Empty, SourcesTested: 0, SourcesFailed: 0);

        if (row is not IDictionary<string, object?> dict)
        {
            return false;
        }

        if (!TryGetValueIgnoreCase(dict, "Status", out var statusObj) ||
            !TryGetInt32IgnoreCase(dict, "SourcesTested", out var sourcesTested) ||
            !TryGetInt32IgnoreCase(dict, "SourcesFailed", out var sourcesFailed))
        {
            return false;
        }

        var status = statusObj is null or DBNull
            ? string.Empty
            : Convert.ToString(statusObj, CultureInfo.InvariantCulture) ?? string.Empty;

        result = new DmConnectivityResult(
            Status: status,
            SourcesTested: sourcesTested,
            SourcesFailed: sourcesFailed);

        return true;
    }

    private static bool TryGetValueIgnoreCase(
        IDictionary<string, object?> dict,
        string key,
        out object? value)
    {
        foreach (var kvp in dict)
        {
            if (string.Equals(kvp.Key, key, StringComparison.OrdinalIgnoreCase))
            {
                value = kvp.Value;
                return true;
            }
        }

        value = null;
        return false;
    }

    private static bool TryGetInt32IgnoreCase(IDictionary<string, object?> dict, string key, out int value)
    {
        value = 0;

        if (!TryGetValueIgnoreCase(dict, key, out var obj) || obj is null or DBNull)
        {
            return false;
        }

        try
        {
            value = obj switch
            {
                int i => i,
                short s => s,
                long l => checked((int)l),
                byte b => b,
                decimal d => checked((int)d),
                _ => Convert.ToInt32(obj, CultureInfo.InvariantCulture),
            };

            return true;
        }
        catch
        {
            value = 0;
            return false;
        }
    }

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

            DmConnectivityResult? result = null;

            await using (var grid = await conn.QueryMultipleAsync(cmd))
            {
                while (!grid.IsConsumed)
                {
                    var rows = (await grid.ReadAsync<dynamic>()).ToList();
                    if (rows.Count == 1 && TryParseDmConnectivityResult((object?)rows[0], out var parsed))
                    {
                        result = parsed;
                        break;
                    }
                }
            }

            if (result is null)
            {
                throw new InvalidOperationException(
                    "Datamart connectivity health check returned an unexpected result shape.");
            }

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
