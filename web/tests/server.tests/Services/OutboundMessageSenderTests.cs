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
            new OutboundMessageSenderOptions { MaxAttempts = 1 });
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var message = CreateMessage(now);
        message.Channel = "Slack";

        ctx.OutboundMessages.Add(message);
        await ctx.SaveChangesAsync();

        var result = await sender.ProcessDueAsync(now);

        result.DeadLetterCount.Should().Be(1);
        emailClient.Messages.Should().BeEmpty();
        (await ctx.OutboundMessages.SingleAsync()).Status.Should().Be(OutboundMessage.Statuses.DeadLetter);
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

    private sealed class FakeOutboundEmailClient : IOutboundEmailClient
    {
        public List<OutboundEmailMessage> Messages { get; } = [];
        public string? ProviderMessageId { get; init; }
        public Exception? ExceptionToThrow { get; init; }

        public Task<OutboundEmailSendResult> SendAsync(
            OutboundEmailMessage message,
            CancellationToken cancellationToken = default)
        {
            if (ExceptionToThrow is not null)
            {
                throw ExceptionToThrow;
            }

            Messages.Add(message);
            return Task.FromResult(new OutboundEmailSendResult(ProviderMessageId));
        }
    }
}
