using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using server.core.Data;
using server.core.Domain;

public interface IDbInitializer
{
    Task InitializeAsync(bool includeDevSeed, CancellationToken cancellationToken = default);
}

public class DbInitializer : IDbInitializer
{
    private readonly AppDbContext _db;
    private readonly ILogger<DbInitializer> _logger;

    public DbInitializer(AppDbContext db, ILogger<DbInitializer> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task InitializeAsync(bool includeDevSeed, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Applying database migrations...");
        await _db.Database.MigrateAsync(cancellationToken);
        _logger.LogInformation("Migrations applied.");

        if (includeDevSeed)
        {
            await SeedDevelopmentAsync(cancellationToken);
        }
        else
        {
            await SeedProductionSafeAsync(cancellationToken);
        }
    }

    private async Task SeedDevelopmentAsync(CancellationToken ct)
    {
        _logger.LogInformation("Seeding development data...");

        await AddRolesIfMissingAsync(ct);

        _logger.LogInformation("Development data seeded.");
    }

    /// <summary>
    /// In production we want to make sure the roles and other essential data exist,
    /// </summary>
    /// <param name="ct"></param>
    /// <returns></returns>
    private async Task SeedProductionSafeAsync(CancellationToken ct)
    {
        _logger.LogInformation("Seeding production-safe data...");

        await AddRolesIfMissingAsync(ct);

        _logger.LogInformation("Production-safe data seeded.");
    }

    private async Task AddRolesIfMissingAsync(CancellationToken ct)
    {
        var rolesToEnsure = new[]
        {
            Role.Names.System,
            Role.Names.Admin,
            Role.Names.Manager,
            Role.Names.AccrualViewer
        };

        foreach (var roleName in rolesToEnsure)
        {
            var exists = await _db.Roles.AnyAsync(r => r.Name == roleName, ct);
            if (!exists)
            {
                _db.Roles.Add(new Role { Name = roleName });
            }
        }

        await _db.SaveChangesAsync(ct);
    }
}
