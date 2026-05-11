using Microsoft.EntityFrameworkCore;
using server.core.Domain;

namespace server.core.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<OutboundMessage> OutboundMessages => Set<OutboundMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        User.OnModelCreating(modelBuilder);
        Role.OnModelCreating(modelBuilder);
        Permission.OnModelCreating(modelBuilder);
        Notification.OnModelCreating(modelBuilder);
        OutboundMessage.OnModelCreating(modelBuilder);
    }
}
