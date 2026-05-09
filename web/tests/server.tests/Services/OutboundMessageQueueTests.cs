using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using server.core.Domain;
using server.core.Services;
using Server.Tests;

namespace server.tests.Services;

public sealed class OutboundMessageQueueTests
{
    [Fact]
    public async Task EnqueueAsync_inserts_pending_messages_and_skips_duplicate_dedupe_keys()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var runId = Guid.NewGuid();

        var first = await queue.EnqueueAsync(
            [
                CreateDraft(runId, "accrual:employee:E001:2026-04-30"),
                CreateDraft(runId, "accrual:employee:E002:2026-04-30"),
            ],
            now);

        var second = await queue.EnqueueAsync(
            [
                CreateDraft(runId, "accrual:employee:E001:2026-04-30"),
                CreateDraft(runId, "accrual:employee:E003:2026-04-30", notBeforeUtc: now.AddHours(1)),
            ],
            now.AddMinutes(5));

        first.EnqueuedCount.Should().Be(2);
        first.DuplicateCount.Should().Be(0);
        second.EnqueuedCount.Should().Be(1);
        second.DuplicateCount.Should().Be(1);

        var messages = await ctx.OutboundMessages
            .OrderBy(message => message.DedupeKey)
            .ToListAsync();

        messages.Should().HaveCount(3);
        messages.Should().OnlyContain(message => message.Status == OutboundMessage.Statuses.Pending);
        messages.Should().OnlyContain(message => message.Channel == OutboundMessage.Channels.Email);
        messages.Should().OnlyContain(message => message.CreatedUtc == now || message.CreatedUtc == now.AddMinutes(5));
        messages.Single(message => message.DedupeKey.EndsWith("E003:2026-04-30")).NotBeforeUtc
            .Should().Be(now.AddHours(1));
    }

    [Fact]
    public async Task EnqueueAsync_skips_duplicate_dedupe_keys_within_same_batch()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);

        var result = await queue.EnqueueAsync(
            [
                CreateDraft(Guid.NewGuid(), "accrual:employee:E001:2026-04-30"),
                CreateDraft(Guid.NewGuid(), "accrual:employee:E001:2026-04-30"),
            ],
            new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc));

        result.EnqueuedCount.Should().Be(1);
        result.DuplicateCount.Should().Be(1);
        ctx.OutboundMessages.Should().ContainSingle();
    }

    [Fact]
    public async Task ClaimAsync_claims_due_pending_retry_and_stale_processing_messages()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var lockDuration = TimeSpan.FromMinutes(10);

        var duePending = CreateMessage("due-pending", OutboundMessage.Statuses.Pending, now.AddMinutes(-10), now.AddMinutes(-20));
        var dueRetry = CreateMessage("due-retry", OutboundMessage.Statuses.Retry, now.AddMinutes(-5), now.AddMinutes(-15));
        var staleProcessing = CreateMessage(
            "stale-processing",
            OutboundMessage.Statuses.Processing,
            now.AddMinutes(-30),
            now.AddMinutes(-30),
            lockId: Guid.NewGuid(),
            lockedUntilUtc: now.AddSeconds(-1),
            attemptCount: 2);
        var futurePending = CreateMessage("future-pending", OutboundMessage.Statuses.Pending, now.AddMinutes(5), now);
        var activeProcessing = CreateMessage(
            "active-processing",
            OutboundMessage.Statuses.Processing,
            now.AddMinutes(-30),
            now.AddMinutes(-30),
            lockId: Guid.NewGuid(),
            lockedUntilUtc: now.AddMinutes(5));
        var sent = CreateMessage("sent", OutboundMessage.Statuses.Sent, now.AddMinutes(-30), now.AddMinutes(-30));

        ctx.OutboundMessages.AddRange(
            duePending,
            dueRetry,
            staleProcessing,
            futurePending,
            activeProcessing,
            sent);
        await ctx.SaveChangesAsync();

        var claimed = await queue.ClaimAsync(10, now, lockDuration);

        claimed.Select(message => message.DedupeKey).Should().Equal(
            staleProcessing.DedupeKey,
            duePending.DedupeKey,
            dueRetry.DedupeKey);

        claimed.Should().OnlyContain(message => message.Status == OutboundMessage.Statuses.Processing);
        claimed.Should().OnlyContain(message => message.LockId != null);
        claimed.Should().OnlyContain(message => message.LockedUntilUtc == now.Add(lockDuration));
        claimed.Select(message => message.LockId).Distinct().Should().ContainSingle();

        var reloaded = await ctx.OutboundMessages.ToDictionaryAsync(message => message.DedupeKey);
        reloaded[futurePending.DedupeKey].Status.Should().Be(OutboundMessage.Statuses.Pending);
        reloaded[activeProcessing.DedupeKey].LockId.Should().Be(activeProcessing.LockId);
        reloaded[staleProcessing.DedupeKey].AttemptCount.Should().Be(2);
    }

    [Fact]
    public async Task ClaimAsync_respects_batch_size()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);

        ctx.OutboundMessages.AddRange(
            CreateMessage("first", OutboundMessage.Statuses.Pending, now.AddMinutes(-2), now.AddMinutes(-2)),
            CreateMessage("second", OutboundMessage.Statuses.Pending, now.AddMinutes(-1), now.AddMinutes(-1)));
        await ctx.SaveChangesAsync();

        var claimed = await queue.ClaimAsync(1, now, TimeSpan.FromMinutes(10));

        claimed.Should().ContainSingle();
        claimed[0].DedupeKey.Should().Be("first");
        (await ctx.OutboundMessages.CountAsync(message => message.Status == OutboundMessage.Statuses.Processing))
            .Should().Be(1);
    }

    [Fact]
    public async Task MarkSentAsync_updates_only_matching_lock()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var lockId = Guid.NewGuid();
        var message = CreateMessage(
            "send-me",
            OutboundMessage.Statuses.Processing,
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(-1),
            lockId: lockId,
            lockedUntilUtc: DateTime.UtcNow.AddMinutes(5));

        ctx.OutboundMessages.Add(message);
        await ctx.SaveChangesAsync();

        (await queue.MarkSentAsync(message.Id, Guid.NewGuid(), "provider-wrong", DateTime.UtcNow))
            .Should().BeFalse();

        (await queue.MarkSentAsync(message.Id, lockId, "provider-123", new DateTime(2026, 5, 7, 20, 5, 0, DateTimeKind.Utc)))
            .Should().BeTrue();

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.Sent);
        reloaded.AttemptCount.Should().Be(1);
        reloaded.ProviderMessageId.Should().Be("provider-123");
        reloaded.SentUtc.Should().Be(new DateTime(2026, 5, 7, 20, 5, 0, DateTimeKind.Utc));
        reloaded.LockId.Should().BeNull();
        reloaded.LockedUntilUtc.Should().BeNull();
        reloaded.LastError.Should().BeNull();
    }

    [Fact]
    public async Task RenewLockAsync_extends_only_matching_processing_lock()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var lockId = Guid.NewGuid();
        var originalLockedUntilUtc = new DateTime(2026, 5, 7, 20, 5, 0, DateTimeKind.Utc);
        var renewedLockedUntilUtc = new DateTime(2026, 5, 7, 20, 20, 0, DateTimeKind.Utc);
        var message = CreateMessage(
            "renew-me",
            OutboundMessage.Statuses.Processing,
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(-1),
            lockId: lockId,
            lockedUntilUtc: originalLockedUntilUtc);
        var pendingMessage = CreateMessage(
            "pending-renew",
            OutboundMessage.Statuses.Pending,
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(-1),
            lockId: lockId,
            lockedUntilUtc: originalLockedUntilUtc);

        ctx.OutboundMessages.AddRange(message, pendingMessage);
        await ctx.SaveChangesAsync();

        (await queue.RenewLockAsync(message.Id, Guid.NewGuid(), renewedLockedUntilUtc))
            .Should().BeFalse();
        (await queue.RenewLockAsync(pendingMessage.Id, lockId, renewedLockedUntilUtc))
            .Should().BeFalse();

        (await queue.RenewLockAsync(message.Id, lockId, renewedLockedUntilUtc))
            .Should().BeTrue();

        var reloaded = await ctx.OutboundMessages.ToDictionaryAsync(row => row.DedupeKey);
        reloaded[message.DedupeKey].Status.Should().Be(OutboundMessage.Statuses.Processing);
        reloaded[message.DedupeKey].LockId.Should().Be(lockId);
        reloaded[message.DedupeKey].LockedUntilUtc.Should().Be(renewedLockedUntilUtc);
        reloaded[pendingMessage.DedupeKey].LockedUntilUtc.Should().Be(originalLockedUntilUtc);
    }

    [Fact]
    public async Task MarkRetryAsync_sets_retry_state_and_sanitized_error()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var lockId = Guid.NewGuid();
        var retryAt = new DateTime(2026, 5, 7, 20, 30, 0, DateTimeKind.Utc);
        var longError = new string('x', 2100);
        var message = CreateMessage(
            "retry-me",
            OutboundMessage.Statuses.Processing,
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(-1),
            lockId: lockId,
            lockedUntilUtc: DateTime.UtcNow.AddMinutes(5),
            attemptCount: 4);

        ctx.OutboundMessages.Add(message);
        await ctx.SaveChangesAsync();

        (await queue.MarkRetryAsync(message.Id, lockId, longError, retryAt)).Should().BeTrue();

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.Retry);
        reloaded.AttemptCount.Should().Be(5);
        reloaded.NotBeforeUtc.Should().Be(retryAt);
        reloaded.LastError.Should().HaveLength(2000);
        reloaded.LockId.Should().BeNull();
        reloaded.LockedUntilUtc.Should().BeNull();
    }

    [Fact]
    public async Task MarkDeadLetterAsync_sets_terminal_state()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var lockId = Guid.NewGuid();
        var message = CreateMessage(
            "dead-me",
            OutboundMessage.Statuses.Processing,
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(-1),
            lockId: lockId,
            lockedUntilUtc: DateTime.UtcNow.AddMinutes(5));

        ctx.OutboundMessages.Add(message);
        await ctx.SaveChangesAsync();

        (await queue.MarkDeadLetterAsync(message.Id, lockId, "Permanent recipient failure.")).Should().BeTrue();

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.DeadLetter);
        reloaded.AttemptCount.Should().Be(1);
        reloaded.LastError.Should().Be("Permanent recipient failure.");
        reloaded.LockId.Should().BeNull();
        reloaded.LockedUntilUtc.Should().BeNull();
    }

    private static OutboundMessageDraft CreateDraft(
        Guid runId,
        string dedupeKey,
        DateTime? notBeforeUtc = null)
    {
        return new OutboundMessageDraft
        {
            RunId = runId,
            NotificationType = "accrual.employee",
            RecipientType = OutboundMessage.RecipientTypes.Employee,
            RecipientEmail = "person@example.com",
            RecipientName = "Person Example",
            DedupeKey = dedupeKey,
            TemplateKey = "accrual.employee.staff.v1",
            TemplateVersion = 1,
            PayloadVersion = 1,
            PayloadJson = """{"employeeId":"E001"}""",
            NotBeforeUtc = notBeforeUtc,
        };
    }

    private static OutboundMessage CreateMessage(
        string dedupeKey,
        string status,
        DateTime notBeforeUtc,
        DateTime createdUtc,
        Guid? lockId = null,
        DateTime? lockedUntilUtc = null,
        int attemptCount = 0)
    {
        return new OutboundMessage
        {
            RunId = Guid.NewGuid(),
            NotificationType = "accrual.employee",
            RecipientType = OutboundMessage.RecipientTypes.Employee,
            Channel = OutboundMessage.Channels.Email,
            RecipientEmail = "person@example.com",
            RecipientName = "Person Example",
            Status = status,
            DedupeKey = dedupeKey,
            TemplateKey = "accrual.employee.staff.v1",
            TemplateVersion = 1,
            PayloadVersion = 1,
            PayloadJson = """{"employeeId":"E001"}""",
            NotBeforeUtc = notBeforeUtc,
            CreatedUtc = createdUtc,
            LockId = lockId,
            LockedUntilUtc = lockedUntilUtc,
            AttemptCount = attemptCount,
        };
    }
}
