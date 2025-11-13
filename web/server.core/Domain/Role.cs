using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

public class Role
{
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
