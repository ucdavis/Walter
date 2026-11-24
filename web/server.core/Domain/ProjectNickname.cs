using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

/// <summary>
/// A short, shared name for a project or for one of its tasks, shown ahead of the official
/// name. One per project and one per project+task; everyone sees the same nickname.
/// </summary>
public class ProjectNickname
{
    public const int NicknameMaxLength = 40;
    public const int NumberMaxLength = 50;

    [Key]
    public int Id { get; set; }

    /// <summary>Stored trimmed and upper-cased.</summary>
    [Required, MaxLength(NumberMaxLength)]
    public string ProjectNumber { get; set; } = "";

    /// <summary>Empty string means the nickname is for the project itself. Stored trimmed and upper-cased.</summary>
    [Required(AllowEmptyStrings = true), MaxLength(NumberMaxLength)]
    public string TaskNumber { get; set; } = "";

    [Required, MaxLength(NicknameMaxLength)]
    public string Nickname { get; set; } = "";

    [MaxLength(200)]
    public string? UpdatedBy { get; set; }

    public DateTime UpdatedAt { get; set; }

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ProjectNickname>()
            .HasIndex(n => new { n.ProjectNumber, n.TaskNumber })
            .IsUnique();
    }
}
