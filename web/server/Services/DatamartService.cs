using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using Polly;
using Polly.Retry;
using server.Models;

namespace server.Services;

public interface IDatamartService
{
    Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
        IEnumerable<string> projectNumbers, CancellationToken ct = default);

    Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
        IEnumerable<string> projectNumbers, CancellationToken ct = default);
}

public sealed class DatamartService : IDatamartService
{
    private readonly string _connectionString;
    private readonly string _appName;
    private readonly AsyncRetryPolicy _retry;

    public DatamartService(IConfiguration configuration, IWebHostEnvironment env)
    {
        _connectionString = configuration["DM_CONNECTION"]
            ?? throw new InvalidOperationException("DM_CONNECTION environment variable is required but not set or empty");

        _appName = $"Walter-{env.EnvironmentName}";

        _retry = Policy
            .Handle<SqlException>()
            .Or<TimeoutException>()
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt =>
                    TimeSpan.FromMilliseconds(200 * Math.Pow(2, attempt))
            );
    }

    public async Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
        IEnumerable<string> projectNumbers, CancellationToken ct = default)
    {
        var projectNumbersParam = string.Join(",", projectNumbers);
        return await ExecuteSprocAsync<FacultyPortfolioRecord>(
            "dbo.usp_GetFacultyDeptPortfolio",
            new { ProjectIds = projectNumbersParam, ApplicationName = _appName },
            ct: ct);
    }

    public async Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
        IEnumerable<string> projectNumbers, CancellationToken ct = default)
    {
        var projectNumbersParam = string.Join(",", projectNumbers);
        return await ExecuteSprocAsync<PositionBudgetRecord>(
            "dbo.usp_GetPositionBudgets",
            new { ProjectIds = projectNumbersParam, ApplicationName = _appName },
            ct: ct);
    }

    private async Task<IReadOnlyList<T>> ExecuteSprocAsync<T>(
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
