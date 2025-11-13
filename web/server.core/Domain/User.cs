using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

public class User
{
    /// <summary>
    /// Primary key - will be Entra ID.
    /// </summary>
    [Key]
    public Guid Id { get; set; }

    /// <summary>
    /// Kerberos ID - will be looked up via Entra.
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Kerberos { get; set; } = null!;

    /// <summary>
    /// IAM ID - will be looked up via IAM.  UNIQUIE constraint.
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string IamId { get; set; } = null!;

    /// <summary>
    /// Employee ID - will be looked up via Entra.
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string EmployeeId { get; set; } = null!;

    [MaxLength(200)]
    public string? DisplayName { get; set; }

    [EmailAddress]
    [MaxLength(200)]
    public string? Email { get; set; }

    /// <summary>
    /// User affiliations - retrieved via Entra or IAM.
    /// </summary>
    [MaxLength(400)]
    public string? Affiliations { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Permissions that have been granted to this user.
    /// </summary>
    public ICollection<Permission> Permissions { get; set; } = new List<Permission>();

    /// <summary>
    /// Permissions that have been explicitly granted by this user to others.
    /// </summary>
    public ICollection<Permission> GrantedPermissions { get; set; } = new List<Permission>();

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(u => u.Kerberos)
            .IsUnique();

        modelBuilder.Entity<User>()
            .HasIndex(u => u.IamId)
            .IsUnique();
    }
}
