using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

public class GLReconciliationInclusion
{
    [Required]
    [Key]
    [MaxLength(20)]
    public string AccountingSequenceNumber { get; set; } = "";

    [MaxLength(500)]
    public string? Note { get; set; }

    [Required]
    [MaxLength(256)]
    public string CreatedBy { get; set; } = "";

    public DateTime CreatedOnUtc { get; set; }

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GLReconciliationInclusion>()
            .Property(e => e.AccountingSequenceNumber)
            .ValueGeneratedNever();
    }
}
