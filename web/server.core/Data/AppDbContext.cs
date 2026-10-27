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
    public DbSet<ChartStringLabel> ChartStringLabels => Set<ChartStringLabel>();
    public DbSet<Projection> Projections => Set<Projection>();
    public DbSet<ProjectionProject> ProjectionProjects => Set<ProjectionProject>();
    public DbSet<ProjectionBudget> ProjectionBudgets => Set<ProjectionBudget>();
    public DbSet<ProjectionActual> ProjectionActuals => Set<ProjectionActual>();
    public DbSet<ProjectionRunRate> ProjectionRunRates => Set<ProjectionRunRate>();
    public DbSet<ProjectionJob> ProjectionJobs => Set<ProjectionJob>();
    public DbSet<ProjectionFundingEntry> ProjectionFundingEntries => Set<ProjectionFundingEntry>();
    public DbSet<ProjectionExpense> ProjectionExpenses => Set<ProjectionExpense>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        User.OnModelCreating(modelBuilder);
        Role.OnModelCreating(modelBuilder);
        Permission.OnModelCreating(modelBuilder);
        Notification.OnModelCreating(modelBuilder);
        OutboundMessage.OnModelCreating(modelBuilder);
        ChartStringLabel.OnModelCreating(modelBuilder);
        Projection.OnModelCreating(modelBuilder);
    }
}
