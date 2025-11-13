using Microsoft.EntityFrameworkCore;
using server.core.Domain;

namespace server.core.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        User.OnModelCreating(modelBuilder);
        Role.OnModelCreating(modelBuilder);
        Permission.OnModelCreating(modelBuilder);
    }
}
