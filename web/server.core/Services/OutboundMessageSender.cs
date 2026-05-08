using server.core.Domain;

namespace server.core.Services;

public sealed record OutboundMessageSenderOptions
{
    public int BatchSize { get; init; } = 500;
    public int MaxAttempts { get; init; } = 5;
    public TimeSpan LockDuration { get; init; } = TimeSpan.FromMinutes(15);
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

    public OutboundMessageSender(
        IOutboundMessageQueue queue,
        IOutboundMessageRenderer renderer,
        IOutboundEmailClient emailClient,
        OutboundMessageSenderOptions? options = null)
    {
        _queue = queue;
        _renderer = renderer;
        _emailClient = emailClient;
        _options = options ?? new OutboundMessageSenderOptions();
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
                continue;
            }

            try
            {
                if (message.Channel != OutboundMessage.Channels.Email)
                {
                    throw new NotSupportedException($"Outbound channel '{message.Channel}' is not supported.");
                }

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
                    cancellationToken))
                {
                    sentCount++;
                }
                else
                {
                    lostLockCount++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (ShouldDeadLetter(message))
                {
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
                    }

                    continue;
                }

                if (await _queue.MarkRetryAsync(
                    message.Id,
                    lockId.Value,
                    ex.Message,
                    CalculateNextRetryUtc(nowUtc, message.AttemptCount),
                    cancellationToken))
                {
                    retryCount++;
                }
                else
                {
                    lostLockCount++;
                }
            }
        }

        return new OutboundMessageSenderResult(
            ClaimedCount: messages.Count,
            SentCount: sentCount,
            RetryCount: retryCount,
            DeadLetterCount: deadLetterCount,
            LostLockCount: lostLockCount);
    }

    private bool ShouldDeadLetter(OutboundMessage message)
    {
        return message.AttemptCount + 1 >= _options.MaxAttempts;
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
