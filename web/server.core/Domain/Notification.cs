using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

public class Notification
{
    public const int SingletonId = 1;

    [Key]
    public int Id { get; set; }

    public bool Enabled { get; set; }

    [Required]
    [MaxLength(2000)]
    public string Message { get; set; } = "";

    public DateTime UpdatedOn { get; set; }

    [MaxLength(200)]
    public string? UpdatedBy { get; set; }

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Notification>().HasData(new Notification
        {
            Id = SingletonId,
            Enabled = false,
            Message = "",
            UpdatedOn = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedBy = null,
        });
    }
}
