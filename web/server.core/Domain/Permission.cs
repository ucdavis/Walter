using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

public class Permission
{
    [Key]
    public int Id { get; set; }

    [Required]
    public Guid UserId { get; set; }

    public User? User { get; set; }

    [Required]
    public int RoleId { get; set; }

    public Role? Role { get; set; }

    [MaxLength(50)]
    public string? DeptCode { get; set; }

    public bool IncludeDescendants { get; set; } = true;

    public Guid? GrantedByUserId { get; set; }

    public User? GrantedByUser { get; set; }

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Permission>()
            .HasOne(p => p.User)
            .WithMany(u => u.Permissions)
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Permission>()
            .HasOne(p => p.GrantedByUser)
            .WithMany(u => u.GrantedPermissions)
            .HasForeignKey(p => p.GrantedByUserId)
            .OnDelete(DeleteBehavior.NoAction);

        modelBuilder.Entity<Permission>()
            .HasOne(p => p.Role)
            .WithMany(r => r.Permissions)
            .HasForeignKey(p => p.RoleId);
    }
}
