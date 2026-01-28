using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using Polly;
using Polly.Retry;

namespace server.Helpers;

public sealed class DmConnectionHelper
{
    private readonly string _connectionString;
    private readonly AsyncRetryPolicy _retry;

    public DmConnectionHelper(IConfiguration configuration)
    {
        _connectionString = configuration["DM_CONNECTION"]
            ?? throw new InvalidOperationException("DM_CONNECTION environment variable is required but not set or empty");

        _retry = Policy
            .Handle<SqlException>()               // transient SQL errors (network blips, failovers, etc.)
            .Or<TimeoutException>()               // app-side timeouts
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt =>
                    TimeSpan.FromMilliseconds(200 * Math.Pow(2, attempt)) // 400ms, 800ms, 1600ms
            );
    }

    public async Task<IReadOnlyList<T>> ExecuteSprocAsync<T>(
        string sprocName,
        object? parameters = null,
        int commandTimeoutSeconds = 60,
        CancellationToken ct = default)
    {
        return await _retry.ExecuteAsync(async ct2 =>
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync(ct2);

            var cmd = new CommandDefinition(
                commandText: sprocName,
                parameters: parameters,
                commandType: CommandType.StoredProcedure,
                commandTimeout: commandTimeoutSeconds,
                cancellationToken: ct2);

            var rows = await conn.QueryAsync<T>(cmd);
            return rows.AsList();
        }, ct);
    }
}
