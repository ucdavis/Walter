using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using server.core.Domain;

namespace server.core.Services;

public sealed record OutboundMessageSenderOptions
{
    public int BatchSize { get; init; } = 500;
    public int MaxAttempts { get; init; } = 5;
    public TimeSpan LockDuration { get; init; } = TimeSpan.FromMinutes(15);
    public TimeSpan LockRenewalThreshold { get; init; } = TimeSpan.FromMinutes(2);
    public TimeProvider TimeProvider { get; init; } = TimeProvider.System;
    public TimeSpan RetryBaseDelay { get; init; } = TimeSpan.FromMinutes(15);
    public TimeSpan RetryMaxDelay { get; init; } = TimeSpan.FromHours(12);
}

public sealed record OutboundMessageSenderResult(
    int ClaimedCount,
    int SentCount,
    int RetryCount,
    int DeadLetterCount,
    int LostLockCount);

public interface IOutboundMessageSender
{
    /// <summary>
    /// Claims due outbound messages, renders them, sends email, and records final attempt state.
    /// </summary>
    Task<OutboundMessageSenderResult> ProcessDueAsync(
        DateTime nowUtc,
        CancellationToken cancellationToken = default);
}

public sealed class OutboundMessageSender : IOutboundMessageSender
{
    private readonly IOutboundMessageQueue _queue;
    private readonly IOutboundMessageRenderer _renderer;
    private readonly IOutboundEmailClient _emailClient;
    private readonly OutboundMessageSenderOptions _options;
    private readonly ILogger<OutboundMessageSender> _logger;

    public OutboundMessageSender(
        IOutboundMessageQueue queue,
        IOutboundMessageRenderer renderer,
        IOutboundEmailClient emailClient,
        OutboundMessageSenderOptions? options = null,
        ILogger<OutboundMessageSender>? logger = null)
    {
        _queue = queue;
        _renderer = renderer;
        _emailClient = emailClient;
        _options = options ?? new OutboundMessageSenderOptions();
        _logger = logger ?? NullLogger<OutboundMessageSender>.Instance;
        ValidateOptions(_options);
    }

    /// <summary>
    /// Processes one queue batch. Timer/worker hosts can call this as often as needed.
    /// </summary>
    public async Task<OutboundMessageSenderResult> ProcessDueAsync(
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        var messages = await _queue.ClaimAsync(
            _options.BatchSize,
            nowUtc,
            _options.LockDuration,
            cancellationToken);

        if (messages.Count == 0)
        {
            _logger.LogDebug(
                "Outbound message sender found no due messages. BatchSize={BatchSize}",
                _options.BatchSize);
        }

        var sentCount = 0;
        var retryCount = 0;
        var deadLetterCount = 0;
        var lostLockCount = 0;

        foreach (var message in messages)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var lockId = message.LockId;
            if (lockId is null)
            {
                lostLockCount++;
                _logger.LogWarning(
                    "Claimed outbound message was missing a lock token. MessageId={MessageId} NotificationType={NotificationType}",
                    message.Id,
                    message.NotificationType);
                continue;
            }

            if (message.Channel != OutboundMessage.Channels.Email)
            {
                var lastError = $"Outbound channel '{message.Channel}' is not supported.";
                _logger.LogError(
                    "Outbound message uses unsupported channel and will be dead-lettered. MessageId={MessageId} NotificationType={NotificationType} Channel={Channel}",
                    message.Id,
                    message.NotificationType,
                    message.Channel);

                if (await _queue.MarkDeadLetterAsync(
                    message.Id,
                    lockId.Value,
                    lastError,
                    cancellationToken))
                {
                    deadLetterCount++;
                }
                else
                {
                    lostLockCount++;
                    _logger.LogWarning(
                        "Outbound message could not be marked dead-letter because its lock was lost. MessageId={MessageId} NotificationType={NotificationType}",
                        message.Id,
                        message.NotificationType);
                }

                continue;
            }

            var renewalCheckUtc = _options.TimeProvider.GetUtcNow().UtcDateTime;
            if (ShouldRenewLock(message, renewalCheckUtc))
            {
                var renewedLockedUntilUtc = renewalCheckUtc.Add(_options.LockDuration);
                if (!await _queue.RenewLockAsync(
                    message.Id,
                    lockId.Value,
                    renewedLockedUntilUtc,
                    cancellationToken))
                {
                    lostLockCount++;
                    _logger.LogWarning(
                        "Outbound message will not be rendered or sent because its lock could not be renewed. MessageId={MessageId} NotificationType={NotificationType}",
                        message.Id,
                        message.NotificationType);
                    continue;
                }
            }

            try
            {
                var rendered = await _renderer.RenderAsync(message, cancellationToken);
                var sendResult = await _emailClient.SendAsync(
                    new OutboundEmailMessage
                    {
                        ToEmail = message.RecipientEmail,
                        ToName = message.RecipientName,
                        Subject = rendered.Subject,
                        TextBody = rendered.TextBody,
                        HtmlBody = rendered.HtmlBody,
                    },
                    cancellationToken);

                if (await _queue.MarkSentAsync(
                    message.Id,
                    lockId.Value,
                    sendResult.ProviderMessageId,
                    nowUtc,
                    CancellationToken.None))
                {
                    sentCount++;
                }
                else
                {
                    lostLockCount++;
                    _logger.LogWarning(
                        "Outbound message was sent but could not be marked sent because its lock was lost. MessageId={MessageId} NotificationType={NotificationType}",
                        message.Id,
                        message.NotificationType);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (ShouldDeadLetter(message))
                {
                    _logger.LogError(
                        ex,
                        "Outbound message failed and will be dead-lettered. MessageId={MessageId} NotificationType={NotificationType} AttemptNumber={AttemptNumber} MaxAttempts={MaxAttempts}",
                        message.Id,
                        message.NotificationType,
                        message.AttemptCount + 1,
                        _options.MaxAttempts);

                    if (await _queue.MarkDeadLetterAsync(
                        message.Id,
                        lockId.Value,
                        ex.Message,
                        cancellationToken))
                    {
                        deadLetterCount++;
                    }
                    else
                    {
                        lostLockCount++;
                        _logger.LogWarning(
                            "Outbound message could not be marked dead-letter because its lock was lost. MessageId={MessageId} NotificationType={NotificationType}",
                            message.Id,
                            message.NotificationType);
                    }

                    continue;
                }

                var nextRetryUtc = CalculateNextRetryUtc(nowUtc, message.AttemptCount);
                _logger.LogWarning(
                    ex,
                    "Outbound message failed and will be retried. MessageId={MessageId} NotificationType={NotificationType} AttemptNumber={AttemptNumber} NextRetryUtc={NextRetryUtc}",
                    message.Id,
                    message.NotificationType,
                    message.AttemptCount + 1,
                    nextRetryUtc);

                if (await _queue.MarkRetryAsync(
                    message.Id,
                    lockId.Value,
                    ex.Message,
                    nextRetryUtc,
                    cancellationToken))
                {
                    retryCount++;
                }
                else
                {
                    lostLockCount++;
                    _logger.LogWarning(
                        "Outbound message could not be marked retry because its lock was lost. MessageId={MessageId} NotificationType={NotificationType}",
                        message.Id,
                        message.NotificationType);
                }
            }
        }

        var result = new OutboundMessageSenderResult(
            ClaimedCount: messages.Count,
            SentCount: sentCount,
            RetryCount: retryCount,
            DeadLetterCount: deadLetterCount,
            LostLockCount: lostLockCount);

        if (messages.Count > 0)
        {
            _logger.LogInformation(
                "Processed outbound message batch. ClaimedCount={ClaimedCount} SentCount={SentCount} RetryCount={RetryCount} DeadLetterCount={DeadLetterCount} LostLockCount={LostLockCount}",
                result.ClaimedCount,
                result.SentCount,
                result.RetryCount,
                result.DeadLetterCount,
                result.LostLockCount);
        }

        return result;
    }

    private bool ShouldDeadLetter(OutboundMessage message)
    {
        return message.AttemptCount + 1 >= _options.MaxAttempts;
    }

    private bool ShouldRenewLock(OutboundMessage message, DateTime nowUtc)
    {
        return message.LockedUntilUtc is null ||
            message.LockedUntilUtc <= nowUtc.Add(_options.LockRenewalThreshold);
    }

    private DateTime CalculateNextRetryUtc(DateTime nowUtc, int currentAttemptCount)
    {
        // AttemptCount is incremented when the row is marked retry/dead, so calculate
        // delay from the attempt currently being processed.
        var multiplier = Math.Pow(2, Math.Min(currentAttemptCount, 5));
        var delayTicks = (long)Math.Min(
            _options.RetryBaseDelay.Ticks * multiplier,
            _options.RetryMaxDelay.Ticks);

        return nowUtc.AddTicks(delayTicks);
    }

    private static void ValidateOptions(OutboundMessageSenderOptions options)
    {
        if (options.BatchSize <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "Batch size must be greater than zero.");
        }

        if (options.MaxAttempts <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "Max attempts must be greater than zero.");
        }

        if (options.LockDuration <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "Lock duration must be greater than zero.");
        }

        if (options.LockRenewalThreshold < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "Lock renewal threshold cannot be negative.");
        }

        if (options.TimeProvider is null)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "Time provider is required.");
        }

        if (options.RetryBaseDelay <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "Retry base delay must be greater than zero.");
        }

        if (options.RetryMaxDelay <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "Retry max delay must be greater than zero.");
        }
    }
}
