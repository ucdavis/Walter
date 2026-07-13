using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

/// <summary>
/// A shared, user-authored explanation of a chart-string segment combination on the financial
/// summary report (e.g. "summer employment 2026"). Empty string in a segment column means that
/// segment is not part of the label's key; at least one segment must be set. One label per
/// combination — everyone with report access shares the same layer.
/// </summary>
public class DepartmentBalanceLabel
{
    public const int TextMaxLength = 500;

    [Key]
    public int Id { get; set; }

    [Required, MaxLength(20)]
    public string Dept { get; set; } = "";

    [Required, MaxLength(20)]
    public string Fund { get; set; } = "";

    [Required, MaxLength(20)]
    public string Account { get; set; } = "";

    [Required, MaxLength(20)]
    public string Purpose { get; set; } = "";

    [Required, MaxLength(20)]
    public string Project { get; set; } = "";

    [Required, MaxLength(20)]
    public string Activity { get; set; } = "";

    [Required, MaxLength(TextMaxLength)]
    public string Text { get; set; } = "";

    [MaxLength(200)]
    public string? UpdatedBy { get; set; }

    public DateTime UpdatedAt { get; set; }

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DepartmentBalanceLabel>()
            .HasIndex(l => new { l.Dept, l.Fund, l.Account, l.Purpose, l.Project, l.Activity })
            .IsUnique();
    }
}
