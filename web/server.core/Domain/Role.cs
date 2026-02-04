using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

public class Role
{
    // Centralized role name constants so assignments stay consistent.
    public static class Names
    {
        public const string System = "System";
        public const string Admin = "Admin";
        public const string Manager = "Manager";
        public const string AccrualViewer = "AccrualViewer";
    }

    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(60)]
    public string Name { get; set; } = null!;

    public ICollection<Permission> Permissions { get; set; } = new List<Permission>();

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Role>()
            .HasIndex(r => r.Name)
            .IsUnique();
    }
}
