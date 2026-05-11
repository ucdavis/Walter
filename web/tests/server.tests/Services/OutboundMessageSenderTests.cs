using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using server.core.Domain;
using server.core.Services;
using Server.Tests;

namespace server.tests.Services;

public sealed class OutboundMessageSenderTests
{
    [Fact]
    public async Task ProcessDueAsync_renders_sends_and_marks_message_sent()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var emailClient = new FakeOutboundEmailClient
        {
            ProviderMessageId = "provider-123",
        };
        var sender = new OutboundMessageSender(
            queue,
            new PlaceholderOutboundMessageRenderer(),
            emailClient,
            new OutboundMessageSenderOptions { BatchSize = 500 });
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);

        ctx.OutboundMessages.Add(CreateMessage(now));
        await ctx.SaveChangesAsync();

        var result = await sender.ProcessDueAsync(now);

        result.Should().Be(new OutboundMessageSenderResult(
            ClaimedCount: 1,
            SentCount: 1,
            RetryCount: 0,
            DeadLetterCount: 0,
            LostLockCount: 0));
        emailClient.Messages.Should().ContainSingle();
        emailClient.Messages[0].ToEmail.Should().Be("person@example.com");
        emailClient.Messages[0].Subject.Should().Be("Action Needed: Your Vacation Accrual is at 100% of Maximum");
        emailClient.Messages[0].TextBody.Should().Contain("\"employeeId\": \"E001\"");

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.Sent);
        reloaded.AttemptCount.Should().Be(1);
        reloaded.ProviderMessageId.Should().Be("provider-123");
        reloaded.SentUtc.Should().Be(now);
        reloaded.LockId.Should().BeNull();
        reloaded.LockedUntilUtc.Should().BeNull();
    }

    [Fact]
    public async Task ProcessDueAsync_marks_message_sent_when_token_is_canceled_after_send_succeeds()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        using var cts = new CancellationTokenSource();
        var emailClient = new FakeOutboundEmailClient
        {
            ProviderMessageId = "provider-accepted",
            AfterSend = cts.Cancel,
        };
        var sender = new OutboundMessageSender(
            queue,
            new PlaceholderOutboundMessageRenderer(),
            emailClient,
            new OutboundMessageSenderOptions { BatchSize = 500 });
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);

        ctx.OutboundMessages.Add(CreateMessage(now));
        await ctx.SaveChangesAsync();

        var result = await sender.ProcessDueAsync(now, cts.Token);

        result.Should().Be(new OutboundMessageSenderResult(
            ClaimedCount: 1,
            SentCount: 1,
            RetryCount: 0,
            DeadLetterCount: 0,
            LostLockCount: 0));

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.Sent);
        reloaded.ProviderMessageId.Should().Be("provider-accepted");
        reloaded.SentUtc.Should().Be(now);
    }

    [Fact]
    public async Task ProcessDueAsync_marks_retry_when_send_fails_before_max_attempts()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var sender = new OutboundMessageSender(
            queue,
            new PlaceholderOutboundMessageRenderer(),
            new FakeOutboundEmailClient { ExceptionToThrow = new InvalidOperationException("SMTP unavailable") },
            new OutboundMessageSenderOptions
            {
                MaxAttempts = 3,
                RetryBaseDelay = TimeSpan.FromMinutes(10),
            });
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);

        ctx.OutboundMessages.Add(CreateMessage(now));
        await ctx.SaveChangesAsync();

        var result = await sender.ProcessDueAsync(now);

        result.RetryCount.Should().Be(1);
        result.DeadLetterCount.Should().Be(0);

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.Retry);
        reloaded.AttemptCount.Should().Be(1);
        reloaded.NotBeforeUtc.Should().Be(now.AddMinutes(10));
        reloaded.LastError.Should().Be("SMTP unavailable");
    }

    [Fact]
    public async Task ProcessDueAsync_marks_dead_letter_when_failure_reaches_max_attempts()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var sender = new OutboundMessageSender(
            queue,
            new PlaceholderOutboundMessageRenderer(),
            new FakeOutboundEmailClient { ExceptionToThrow = new InvalidOperationException("template failed") },
            new OutboundMessageSenderOptions { MaxAttempts = 3 });
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);

        ctx.OutboundMessages.Add(CreateMessage(now, attemptCount: 2));
        await ctx.SaveChangesAsync();

        var result = await sender.ProcessDueAsync(now);

        result.RetryCount.Should().Be(0);
        result.DeadLetterCount.Should().Be(1);

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.DeadLetter);
        reloaded.AttemptCount.Should().Be(3);
        reloaded.LastError.Should().Be("template failed");
        reloaded.LockId.Should().BeNull();
    }

    [Fact]
    public async Task ProcessDueAsync_marks_unsupported_channels_dead_letter()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var queue = new OutboundMessageQueue(ctx);
        var emailClient = new FakeOutboundEmailClient();
        var sender = new OutboundMessageSender(
            queue,
            new PlaceholderOutboundMessageRenderer(),
            emailClient,
            new OutboundMessageSenderOptions { MaxAttempts = 3 });
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var message = CreateMessage(now);
        message.Channel = "Slack";

        ctx.OutboundMessages.Add(message);
        await ctx.SaveChangesAsync();

        var result = await sender.ProcessDueAsync(now);

        result.RetryCount.Should().Be(0);
        result.DeadLetterCount.Should().Be(1);
        emailClient.Messages.Should().BeEmpty();

        var reloaded = await ctx.OutboundMessages.SingleAsync();
        reloaded.Status.Should().Be(OutboundMessage.Statuses.DeadLetter);
        reloaded.AttemptCount.Should().Be(1);
        reloaded.LastError.Should().Be("Outbound channel 'Slack' is not supported.");
        reloaded.LockId.Should().BeNull();
    }

    [Fact]
    public async Task ProcessDueAsync_sends_without_renewing_when_lock_is_not_near_expiry()
    {
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var message = CreateMessage(now);
        message.LockId = Guid.NewGuid();
        message.LockedUntilUtc = now.AddMinutes(10);
        var queue = new FakeOutboundMessageQueue
        {
            ClaimedMessages = [message],
        };
        var renderer = new CountingOutboundMessageRenderer();
        var emailClient = new FakeOutboundEmailClient
        {
            ProviderMessageId = "provider-123",
        };
        var timeProvider = new FixedTimeProvider(now);
        var sender = new OutboundMessageSender(
            queue,
            renderer,
            emailClient,
            new OutboundMessageSenderOptions
            {
                LockDuration = TimeSpan.FromMinutes(10),
                LockRenewalThreshold = TimeSpan.FromMinutes(2),
                TimeProvider = timeProvider,
            });

        var result = await sender.ProcessDueAsync(now);

        result.Should().Be(new OutboundMessageSenderResult(
            ClaimedCount: 1,
            SentCount: 1,
            RetryCount: 0,
            DeadLetterCount: 0,
            LostLockCount: 0));
        queue.RenewLockCallCount.Should().Be(0);
        queue.MarkSentCallCount.Should().Be(1);
        renderer.RenderCallCount.Should().Be(1);
        emailClient.Messages.Should().ContainSingle();
    }

    [Fact]
    public async Task ProcessDueAsync_renews_before_send_when_lock_is_near_expiry()
    {
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var message = CreateMessage(now);
        message.LockId = Guid.NewGuid();
        message.LockedUntilUtc = now.AddSeconds(30);
        var queue = new FakeOutboundMessageQueue
        {
            ClaimedMessages = [message],
        };
        var renderer = new CountingOutboundMessageRenderer();
        var emailClient = new FakeOutboundEmailClient();
        var timeProvider = new FixedTimeProvider(now);
        var sender = new OutboundMessageSender(
            queue,
            renderer,
            emailClient,
            new OutboundMessageSenderOptions
            {
                LockDuration = TimeSpan.FromMinutes(10),
                LockRenewalThreshold = TimeSpan.FromMinutes(2),
                TimeProvider = timeProvider,
            });

        var result = await sender.ProcessDueAsync(now);

        result.Should().Be(new OutboundMessageSenderResult(
            ClaimedCount: 1,
            SentCount: 1,
            RetryCount: 0,
            DeadLetterCount: 0,
            LostLockCount: 0));
        queue.RenewLockCallCount.Should().Be(1);
        queue.RenewedLockedUntilUtc.Should().Be(now.AddMinutes(10));
        queue.MarkSentCallCount.Should().Be(1);
        renderer.RenderCallCount.Should().Be(1);
        emailClient.Messages.Should().ContainSingle();
    }

    [Fact]
    public async Task ProcessDueAsync_renews_using_current_time_for_later_batch_message()
    {
        var batchNow = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var renewalCheckNow = batchNow.AddMinutes(9);
        var message = CreateMessage(batchNow);
        message.LockId = Guid.NewGuid();
        message.LockedUntilUtc = batchNow.AddMinutes(10);
        var queue = new FakeOutboundMessageQueue
        {
            ClaimedMessages = [message],
        };
        var renderer = new CountingOutboundMessageRenderer();
        var emailClient = new FakeOutboundEmailClient();
        var timeProvider = new FixedTimeProvider(renewalCheckNow);
        var sender = new OutboundMessageSender(
            queue,
            renderer,
            emailClient,
            new OutboundMessageSenderOptions
            {
                LockDuration = TimeSpan.FromMinutes(10),
                LockRenewalThreshold = TimeSpan.FromMinutes(2),
                TimeProvider = timeProvider,
            });

        var result = await sender.ProcessDueAsync(batchNow);

        result.Should().Be(new OutboundMessageSenderResult(
            ClaimedCount: 1,
            SentCount: 1,
            RetryCount: 0,
            DeadLetterCount: 0,
            LostLockCount: 0));
        queue.RenewLockCallCount.Should().Be(1);
        queue.RenewedLockedUntilUtc.Should().Be(renewalCheckNow.AddMinutes(10));
        queue.MarkSentCallCount.Should().Be(1);
        renderer.RenderCallCount.Should().Be(1);
        emailClient.Messages.Should().ContainSingle();
    }

    [Fact]
    public async Task ProcessDueAsync_skips_render_and_send_when_lock_renewal_fails()
    {
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var message = CreateMessage(now);
        message.LockId = Guid.NewGuid();
        message.LockedUntilUtc = now.AddSeconds(30);
        var queue = new FakeOutboundMessageQueue
        {
            ClaimedMessages = [message],
            RenewLockResult = false,
        };
        var renderer = new CountingOutboundMessageRenderer();
        var emailClient = new FakeOutboundEmailClient();
        var timeProvider = new FixedTimeProvider(now);
        var sender = new OutboundMessageSender(
            queue,
            renderer,
            emailClient,
            new OutboundMessageSenderOptions
            {
                LockDuration = TimeSpan.FromMinutes(10),
                TimeProvider = timeProvider,
            });

        var result = await sender.ProcessDueAsync(now);

        result.Should().Be(new OutboundMessageSenderResult(
            ClaimedCount: 1,
            SentCount: 0,
            RetryCount: 0,
            DeadLetterCount: 0,
            LostLockCount: 1));
        queue.RenewLockCallCount.Should().Be(1);
        queue.RenewedLockedUntilUtc.Should().BeAfter(now);
        renderer.RenderCallCount.Should().Be(0);
        emailClient.Messages.Should().BeEmpty();
    }

    private static OutboundMessage CreateMessage(DateTime now, int attemptCount = 0)
    {
        return new OutboundMessage
        {
            RunId = Guid.NewGuid(),
            NotificationType = AccrualNotificationMessageBuilder.EmployeeNotificationType,
            RecipientType = OutboundMessage.RecipientTypes.Employee,
            Channel = OutboundMessage.Channels.Email,
            RecipientEmail = "person@example.com",
            RecipientName = "Person Example",
            Status = OutboundMessage.Statuses.Pending,
            DedupeKey = $"accrual:employee:E001:{Guid.NewGuid():N}",
            TemplateKey = "accrual.employee.staff.v1",
            TemplateVersion = 1,
            PayloadVersion = 1,
            PayloadJson = """
                {
                  "employeeId": "E001",
                  "employeeName": "Person Example",
                  "pctOfCap": 100,
                  "balanceHours": 336,
                  "capHours": 336
                }
                """,
            NotBeforeUtc = now.AddMinutes(-1),
            CreatedUtc = now.AddMinutes(-2),
            AttemptCount = attemptCount,
        };
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow()
        {
            return new DateTimeOffset(utcNow, TimeSpan.Zero);
        }
    }

    private sealed class CountingOutboundMessageRenderer : IOutboundMessageRenderer
    {
        public int RenderCallCount { get; private set; }

        public Task<RenderedOutboundMessage> RenderAsync(
            OutboundMessage message,
            CancellationToken cancellationToken = default)
        {
            RenderCallCount++;
            return Task.FromResult(new RenderedOutboundMessage(
                "subject",
                "text body",
                "<p>html body</p>"));
        }
    }

    private sealed class FakeOutboundEmailClient : IOutboundEmailClient
    {
        public List<OutboundEmailMessage> Messages { get; } = [];
        public string? ProviderMessageId { get; init; }
        public Exception? ExceptionToThrow { get; init; }
        public Action? AfterSend { get; init; }

        public Task<OutboundEmailSendResult> SendAsync(
            OutboundEmailMessage message,
            CancellationToken cancellationToken = default)
        {
            if (ExceptionToThrow is not null)
            {
                throw ExceptionToThrow;
            }

            Messages.Add(message);
            AfterSend?.Invoke();
            return Task.FromResult(new OutboundEmailSendResult(ProviderMessageId));
        }
    }

    private sealed class FakeOutboundMessageQueue : IOutboundMessageQueue
    {
        public IReadOnlyList<OutboundMessage> ClaimedMessages { get; init; } = [];
        public bool RenewLockResult { get; init; } = true;
        public bool MarkSentResult { get; init; } = true;
        public int RenewLockCallCount { get; private set; }
        public int MarkSentCallCount { get; private set; }
        public DateTime? RenewedLockedUntilUtc { get; private set; }

        public Task<EnqueueOutboundMessagesResult> EnqueueAsync(
            IReadOnlyList<OutboundMessageDraft> messages,
            DateTime nowUtc,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<IReadOnlyList<OutboundMessage>> ClaimAsync(
            int batchSize,
            DateTime nowUtc,
            TimeSpan lockDuration,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(ClaimedMessages);
        }

        public Task<bool> RenewLockAsync(
            long id,
            Guid lockId,
            DateTime lockedUntilUtc,
            CancellationToken cancellationToken = default)
        {
            RenewLockCallCount++;
            RenewedLockedUntilUtc = lockedUntilUtc;
            return Task.FromResult(RenewLockResult);
        }

        public Task<bool> MarkSentAsync(
            long id,
            Guid lockId,
            string? providerMessageId,
            DateTime sentUtc,
            CancellationToken cancellationToken = default)
        {
            MarkSentCallCount++;
            return Task.FromResult(MarkSentResult);
        }

        public Task<bool> MarkRetryAsync(
            long id,
            Guid lockId,
            string lastError,
            DateTime notBeforeUtc,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<bool> MarkDeadLetterAsync(
            long id,
            Guid lockId,
            string lastError,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }
    }
}
