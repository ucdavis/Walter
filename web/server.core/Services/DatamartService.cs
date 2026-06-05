using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using Polly;
using Polly.Retry;
using server.core.Models;

namespace server.core.Services;

public sealed class DatamartOptions
{
    public const string SectionName = "Datamart";

    /// <summary>Live UCPath data warehouse via Oracle linked server (dbo.usp_GetPositionBudgets).</summary>
    public const string UCPathDWHSource = "UCPathDWH";

    /// <summary>Local ETL-populated dbo.PositionBudgets table (dbo.usp_GetPositionBudgetsLocal).</summary>
    public const string LocalSource = "Local";

    public string ConnectionString { get; set; } = string.Empty;
    public string ApplicationName { get; set; } = "Walter";

    /// <summary>
    /// Which backing source position budgets are read from. Defaults to the live UCPath
    /// data warehouse; set Datamart:PositionBudgetsSource=Local (env Datamart__PositionBudgetsSource)
    /// to cut an environment over to the local table.
    /// </summary>
    public string PositionBudgetsSource { get; set; } = UCPathDWHSource;

    public bool UsePositionBudgetsLocalTable =>
        string.Equals(PositionBudgetsSource?.Trim(), LocalSource, StringComparison.OrdinalIgnoreCase);
}

public interface IDatamartService
{
    /// <summary>
    /// Searches People records that have both an IAM ID for navigation and an Employee ID for downstream project data.
    /// </summary>
    Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(
        string query, int limit, CancellationToken ct = default);

    /// <summary>
    /// Resolves a public IAM ID to the corresponding People record when downstream services require Employee ID.
    /// </summary>
    Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(
        string iamId, CancellationToken ct = default);

    /// <summary>
    /// Resolves a downstream Employee ID to a People record when Walter needs to decide whether a Person can be navigated by IAM ID.
    /// </summary>
    Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(
        string employeeId, CancellationToken ct = default);

    /// <summary>
    /// Resolves downstream Employee IDs to People records in batches for project team navigation.
    /// </summary>
    Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(
        IEnumerable<string> employeeIds, CancellationToken ct = default);

    /// <summary>
    /// Resolves an email address from downstream project data to a People record when PPM does not provide Employee ID.
    /// </summary>
    Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(
        string email, CancellationToken ct = default);

    Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
        DateTime startDate, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default);

    Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default);

    Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default);

    Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default);

    Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default);
}

public sealed class DatamartService : IDatamartService, IAccrualReportDataSource
{
    private const string GetSearchablePeopleSproc = "dbo.usp_GetSearchablePeople";

    private readonly string _connectionString;
    private readonly string _appName;
    private readonly string _positionBudgetsSproc;
    private readonly AsyncRetryPolicy _retry;

    static DatamartService()
    {
        Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true;
    }

    public DatamartService(IOptions<DatamartOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var value = options.Value;
        _connectionString = string.IsNullOrWhiteSpace(value.ConnectionString)
            ? throw new InvalidOperationException("Datamart connection string is required. Set Datamart:ConnectionString or DM_CONNECTION.")
            : value.ConnectionString;

        _appName = string.IsNullOrWhiteSpace(value.ApplicationName)
            ? "Walter"
            : value.ApplicationName.Trim();

        // Feature flag: read position budgets from the local ETL table or the live UCPath DWH.
        _positionBudgetsSproc = value.UsePositionBudgetsLocalTable
            ? "dbo.usp_GetPositionBudgetsLocal"
            : "dbo.usp_GetPositionBudgets";

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
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var projectNumbersParam = string.Join(",", projectNumbers);
        return await ExecuteSprocAsync<FacultyPortfolioRecord>(
            "dbo.usp_GetProjectSummary",
            new { ProjectIds = projectNumbersParam, ApplicationName = _appName, ApplicationUser = applicationUser, EmulatingUser = emulatingUser },
            ct: ct);
    }

    public async Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(
        string query, int limit, CancellationToken ct = default)
    {
        const int MaxSearchPeopleLimit = 100;
        var normalizedQuery = query.Trim();
        if (normalizedQuery.Length < 3 || limit <= 0)
        {
            return Array.Empty<SearchablePersonRecord>();
        }
        var boundedLimit = Math.Min(limit, MaxSearchPeopleLimit);

        return await ExecuteSprocAsync<SearchablePersonRecord>(
            GetSearchablePeopleSproc,
            new
            {
                SearchQuery = normalizedQuery,
                Limit = boundedLimit,
            },
            ct: ct);
    }

    public async Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(
        string iamId, CancellationToken ct = default)
    {
        var normalizedIamId = iamId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedIamId))
        {
            return null;
        }

        var results = await ExecuteSprocAsync<SearchablePersonRecord>(
            GetSearchablePeopleSproc,
            new { IamId = normalizedIamId },
            ct: ct);
        return results.FirstOrDefault();
    }

    public async Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(
        string employeeId, CancellationToken ct = default)
    {
        var normalizedEmployeeId = employeeId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedEmployeeId))
        {
            return null;
        }

        var results = await ExecuteSprocAsync<SearchablePersonRecord>(
            GetSearchablePeopleSproc,
            new { EmployeeId = normalizedEmployeeId },
            ct: ct);
        return results.FirstOrDefault();
    }

    public async Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(
        IEnumerable<string> employeeIds, CancellationToken ct = default)
    {
        var normalizedEmployeeIds = employeeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalizedEmployeeIds.Length == 0)
        {
            return Array.Empty<SearchablePersonRecord>();
        }

        return await ExecuteSprocAsync<SearchablePersonRecord>(
            GetSearchablePeopleSproc,
            new { EmployeeIds = string.Join(",", normalizedEmployeeIds) },
            ct: ct);
    }

    public async Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(
        string email, CancellationToken ct = default)
    {
        var normalizedEmail = email.Trim();
        if (string.IsNullOrWhiteSpace(normalizedEmail))
        {
            return null;
        }

        var results = await ExecuteSprocAsync<SearchablePersonRecord>(
            GetSearchablePeopleSproc,
            new { Email = normalizedEmail.ToLowerInvariant() },
            ct: ct);
        return results.FirstOrDefault();
    }

    public async Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
        DateTime startDate, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        const string sql = """
            SELECT
                EmployeeId,
                AsOfDate,
                EmployeeName,
                EmployeeEmail,
                EmployeeClassDescription,
                PositionNumber,
                Level5Dept,
                Level5DeptDesc,
                HoursTaken,
                CalculatedBal,
                AccrualLimit,
                AccrualHours,
                AccrualPercentage,
                TypeLabel
            FROM dbo.EmployeeAccrualBalances
            WHERE TypeLabel = 'Vacation'
              AND AsOfDate >= @StartDate
            ORDER BY EmployeeId, AsOfDate, PositionNumber
            """;

        return await ExecuteQueryAsync<EmployeeAccrualBalanceRecord>(
            sql,
            new
            {
                StartDate = startDate,
                ApplicationName = _appName,
                ApplicationUser = applicationUser,
                EmulatingUser = emulatingUser,
            },
            ct: ct);
    }

    public async Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var projectNumbersParam = string.Join(",", projectNumbers);
        return await ExecuteSprocAsync<PositionBudgetRecord>(
            _positionBudgetsSproc,
            new { ProjectIds = projectNumbersParam, ApplicationName = _appName, ApplicationUser = applicationUser, EmulatingUser = emulatingUser },
            ct: ct);
    }

    public async Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var projectNumbersParam = string.Join(",", projectNumbers);
        return await ExecuteSprocAsync<GLPPMReconciliationRecord>(
            "dbo.usp_GetGLPPMReconciliation",
            new { ProjectIds = projectNumbersParam, ApplicationName = _appName, ApplicationUser = applicationUser, EmulatingUser = emulatingUser },
            ct: ct);
    }

    public async Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(
        IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var projectNumbersParam = string.Join(",", projectNumbers);
        return await ExecuteSprocAsync<GLTransactionRecord>(
            "dbo.usp_GetGLTransactionListings",
            new { ProjectIds = projectNumbersParam, ApplicationName = _appName, ApplicationUser = applicationUser, EmulatingUser = emulatingUser },
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

    private async Task<IReadOnlyList<T>> ExecuteQueryAsync<T>(
        string sql,
        object? parameters = null,
        int commandTimeoutSeconds = 60,
        CancellationToken ct = default)
    {
        return await _retry.ExecuteAsync(async ct2 =>
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync(ct2);

            var cmd = new CommandDefinition(
                commandText: sql,
                parameters: parameters,
                commandType: CommandType.Text,
                commandTimeout: commandTimeoutSeconds,
                cancellationToken: ct2);

            var rows = await conn.QueryAsync<T>(cmd);
            return rows.AsList();
        }, ct);
    }
}
