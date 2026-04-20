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
        await EnsureDevelopmentAccrualViewerAsync(ct);

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
            Role.Names.AccrualViewer,
            Role.Names.FinancialViewer,
            Role.Names.ProjectManager
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

    private async Task EnsureDevelopmentAccrualViewerAsync(CancellationToken ct)
    {
        var user = await _db.Users
            .SingleOrDefaultAsync(u => u.Id == DevelopmentSeedData.AccrualViewerUserId, ct);

        if (user is null)
        {
            user = new User
            {
                Id = DevelopmentSeedData.AccrualViewerUserId,
            };
            _db.Users.Add(user);
        }

        user.Kerberos = DevelopmentSeedData.AccrualViewerKerberos;
        user.IamId = DevelopmentSeedData.AccrualViewerIamId;
        user.EmployeeId = DevelopmentSeedData.AccrualViewerEmployeeId;
        user.DisplayName = DevelopmentSeedData.AccrualViewerDisplayName;
        user.Email = DevelopmentSeedData.AccrualViewerEmail;
        user.IsActive = true;

        await _db.SaveChangesAsync(ct);

        var accrualViewerRoleId = await _db.Roles
            .Where(r => r.Name == Role.Names.AccrualViewer)
            .Select(r => r.Id)
            .SingleAsync(ct);

        var hasPermission = await _db.Permissions.AnyAsync(p =>
            p.UserId == user.Id &&
            p.RoleId == accrualViewerRoleId &&
            p.DeptCode == null, ct);

        if (!hasPermission)
        {
            _db.Permissions.Add(new Permission
            {
                UserId = user.Id,
                RoleId = accrualViewerRoleId,
                DeptCode = null,
                IncludeDescendants = true,
                GrantedByUserId = null,
            });

            await _db.SaveChangesAsync(ct);
        }
    }
}
