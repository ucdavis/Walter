using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using server.core.Data;

namespace server.tests.Integration;

public sealed class ProjectionSqlServerFactAttribute : FactAttribute
{
    public ProjectionSqlServerFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ProjectionSqlServerFixture.ConnectionVariable)))
            Skip = "Run web/tests/server.tests/run-projection-sql-tests.sh for isolated SQL Server verification.";
    }
}

public sealed class ProjectionSqlServerTheoryAttribute : TheoryAttribute
{
    public ProjectionSqlServerTheoryAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ProjectionSqlServerFixture.ConnectionVariable)))
            Skip = "Run web/tests/server.tests/run-projection-sql-tests.sh for isolated SQL Server verification.";
    }
}

/// <summary>Creates and drops only its own uniquely named database on a loopback SQL test instance.</summary>
public sealed class ProjectionSqlServerFixture : IAsyncLifetime
{
    public const string ConnectionVariable = "WALTER_PROJECTION_SQL_CONNECTION";
    private readonly string databaseName = $"WalterProjectionTests_{Guid.NewGuid():N}";
    private string? masterConnection;
    private bool created;
    public string ConnectionString { get; private set; } = "";

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(configured)) return;
        var builder = new SqlConnectionStringBuilder(configured);
        // The runner owns the local container. Never run these destructive fixtures against a remote server.
        if (!builder.DataSource.StartsWith("127.0.0.1,", StringComparison.Ordinal))
            throw new InvalidOperationException("Projection SQL tests require an isolated loopback SQL Server port.");
        builder.InitialCatalog = "master";
        masterConnection = builder.ConnectionString;
        await using var connection = new SqlConnection(masterConnection);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"CREATE DATABASE [{databaseName}]";
        await command.ExecuteNonQueryAsync();
        created = true;
        builder.InitialCatalog = databaseName;
        ConnectionString = builder.ConnectionString;
        await using var db = CreateContext();
        await db.Database.MigrateAsync();
    }

    public AppDbContext CreateContext(params IInterceptor[] interceptors)
    {
        var builder = new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(ConnectionString);
        if (interceptors.Length > 0) builder.AddInterceptors(interceptors);
        return new AppDbContext(builder.Options);
    }

    public async Task DisposeAsync()
    {
        if (!created) return;
        SqlConnection.ClearAllPools();
        await using var connection = new SqlConnection(masterConnection);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]";
        await command.ExecuteNonQueryAsync();
    }
}
