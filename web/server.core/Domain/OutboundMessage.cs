using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

/// <summary>
/// A durable queued delivery record for one outbound notification message.
/// </summary>
public class OutboundMessage
{
    public static class Channels
    {
        public const string Email = "Email";
    }

    public static class RecipientTypes
    {
        public const string Employee = "Employee";
        public const string AccrualViewer = "AccrualViewer";
    }

    public static class Statuses
    {
        public const string Pending = "Pending";
        public const string Processing = "Processing";
        public const string Sent = "Sent";
        public const string Retry = "Retry";
        public const string DeadLetter = "DeadLetter";
    }

    /// <summary>
    /// Database identifier for this outbound message.
    /// </summary>
    [Key]
    public long Id { get; set; }

    /// <summary>
    /// Correlation identifier shared by messages produced by the same queue-generation run.
    /// </summary>
    public Guid RunId { get; set; }

    /// <summary>
    /// Concrete notification workflow that produced the message, such as accrual.employee.
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string NotificationType { get; set; } = string.Empty;

    /// <summary>
    /// Coarse recipient class used for operational filtering, such as Employee or AccrualViewer.
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string RecipientType { get; set; } = string.Empty;

    /// <summary>
    /// Delivery channel for the message. V1 supports email only.
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string Channel { get; set; } = Channels.Email;

    /// <summary>
    /// Email address the sender will deliver to without re-resolving recipient identity.
    /// </summary>
    [Required]
    [MaxLength(320)]
    public string RecipientEmail { get; set; } = string.Empty;

    /// <summary>
    /// Optional display name for the email recipient.
    /// </summary>
    [MaxLength(200)]
    public string? RecipientName { get; set; }

    /// <summary>
    /// Current delivery state for sender claiming, completion, retry, and terminal failure.
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string Status { get; set; } = Statuses.Pending;

    /// <summary>
    /// Immutable logical notification key used to prevent duplicate queue rows forever.
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string DedupeKey { get; set; } = string.Empty;

    /// <summary>
    /// Renderer key that selects the code-versioned template for this message.
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string TemplateKey { get; set; } = string.Empty;

    /// <summary>
    /// Version of the template contract used when the message was queued.
    /// </summary>
    public int TemplateVersion { get; set; } = 1;

    /// <summary>
    /// Version of the structured payload schema stored in PayloadJson.
    /// </summary>
    public int PayloadVersion { get; set; } = 1;

    /// <summary>
    /// Structured renderable payload retained for auditability and later sending.
    /// </summary>
    [Required]
    public string PayloadJson { get; set; } = string.Empty;

    /// <summary>
    /// Earliest UTC time the sender may claim this message.
    /// </summary>
    public DateTime NotBeforeUtc { get; set; }

    /// <summary>
    /// UTC lease expiry for a worker currently processing the message.
    /// </summary>
    public DateTime? LockedUntilUtc { get; set; }

    /// <summary>
    /// Lease token that must match when a worker marks the message sent, retry, or dead-letter.
    /// </summary>
    public Guid? LockId { get; set; }

    /// <summary>
    /// Number of actual processing or send attempts made for this message.
    /// </summary>
    public int AttemptCount { get; set; }

    /// <summary>
    /// Sanitized summary of the most recent delivery or rendering error.
    /// </summary>
    [MaxLength(2000)]
    public string? LastError { get; set; }

    /// <summary>
    /// Message identifier returned by the email provider after a successful send.
    /// </summary>
    [MaxLength(200)]
    public string? ProviderMessageId { get; set; }

    /// <summary>
    /// UTC time when the queue row was created.
    /// </summary>
    public DateTime CreatedUtc { get; set; }

    /// <summary>
    /// UTC time when the message was successfully sent.
    /// </summary>
    public DateTime? SentUtc { get; set; }

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<OutboundMessage>();

        entity.HasIndex(m => m.DedupeKey).IsUnique();
        // Claiming depends on finding due rows that are pending and not locked by another worker.
        entity.HasIndex(m => new { m.Status, m.NotBeforeUtc, m.LockedUntilUtc });
        entity.HasIndex(m => m.RunId);
        entity.HasIndex(m => m.NotificationType);
        entity.HasIndex(m => m.RecipientType);
        entity.HasIndex(m => m.CreatedUtc);

        // Retained payloads can include recipient PII; keep retention and rendering paths intentional.
        entity.Property(m => m.PayloadJson).HasColumnType("nvarchar(max)");
    }
}
