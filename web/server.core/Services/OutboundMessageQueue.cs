using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using server.core.Data;
using server.core.Domain;

namespace server.core.Services;

public interface IOutboundMessageQueue
{
    /// <summary>
    /// Adds new pending messages and treats existing dedupe keys as idempotent skips.
    /// </summary>
    Task<EnqueueOutboundMessagesResult> EnqueueAsync(
        IReadOnlyList<OutboundMessageDraft> messages,
        DateTime nowUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Claims due messages for processing and assigns a fresh lock token to each claimed row.
    /// </summary>
    Task<IReadOnlyList<OutboundMessage>> ClaimAsync(
        int batchSize,
        DateTime nowUtc,
        TimeSpan lockDuration,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Extends a processing lock if the worker still owns the lock.
    /// </summary>
    Task<bool> RenewLockAsync(
        long id,
        Guid lockId,
        DateTime lockedUntilUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Completes a locked message as sent if the worker still owns the lock.
    /// </summary>
    Task<bool> MarkSentAsync(
        long id,
        Guid lockId,
        string? providerMessageId,
        DateTime sentUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Completes a locked message as retryable if the worker still owns the lock.
    /// </summary>
    Task<bool> MarkRetryAsync(
        long id,
        Guid lockId,
        string lastError,
        DateTime notBeforeUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Completes a locked message as terminally failed if the worker still owns the lock.
    /// </summary>
    Task<bool> MarkDeadLetterAsync(
        long id,
        Guid lockId,
        string lastError,
        CancellationToken cancellationToken = default);
}

public sealed record OutboundMessageDraft
{
    public Guid RunId { get; init; }
    public required string NotificationType { get; init; }
    public required string RecipientType { get; init; }
    public string Channel { get; init; } = OutboundMessage.Channels.Email;
    public required string RecipientEmail { get; init; }
    public string? RecipientName { get; init; }
    public required string DedupeKey { get; init; }
    public required string TemplateKey { get; init; }
    public int TemplateVersion { get; init; } = 1;
    public int PayloadVersion { get; init; } = 1;
    public required string PayloadJson { get; init; }
    public DateTime? NotBeforeUtc { get; init; }
}

public sealed record EnqueueOutboundMessagesResult(
    int EnqueuedCount,
    int DuplicateCount,
    IReadOnlyList<long> EnqueuedIds);

public sealed class OutboundMessageQueue : IOutboundMessageQueue
{
    private const int LastErrorMaxLength = 2000;

    private readonly AppDbContext _ctx;
    private readonly ILogger<OutboundMessageQueue> _logger;

    public OutboundMessageQueue(AppDbContext ctx, ILogger<OutboundMessageQueue>? logger = null)
    {
        _ctx = ctx;
        _logger = logger ?? NullLogger<OutboundMessageQueue>.Instance;
    }

    /// <summary>
    /// Persists new messages while suppressing duplicates by immutable dedupe key.
    /// </summary>
    public async Task<EnqueueOutboundMessagesResult> EnqueueAsync(
        IReadOnlyList<OutboundMessageDraft> messages,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(messages);

        if (messages.Count == 0)
        {
            _logger.LogDebug("No outbound message drafts were provided for enqueue.");
            return new EnqueueOutboundMessagesResult(0, 0, []);
        }

        foreach (var message in messages)
        {
            ValidateDraft(message);
        }

        var requestedDedupeKeys = messages
            .Select(message => message.DedupeKey.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var existingDedupeKeys = await _ctx.OutboundMessages
            .Where(message => requestedDedupeKeys.Contains(message.DedupeKey))
            .Select(message => message.DedupeKey)
            .ToListAsync(cancellationToken);

        // Track both existing rows and earlier items in this batch so one duplicate path
        // handles reruns and accidental repeated drafts.
        var blockedDedupeKeys = existingDedupeKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var newMessages = new List<OutboundMessage>();

        foreach (var draft in messages)
        {
            var dedupeKey = draft.DedupeKey.Trim();
            if (!blockedDedupeKeys.Add(dedupeKey))
            {
                continue;
            }

            newMessages.Add(new OutboundMessage
            {
                RunId = draft.RunId,
                NotificationType = draft.NotificationType.Trim(),
                RecipientType = draft.RecipientType.Trim(),
                Channel = string.IsNullOrWhiteSpace(draft.Channel)
                    ? OutboundMessage.Channels.Email
                    : draft.Channel.Trim(),
                RecipientEmail = draft.RecipientEmail.Trim(),
                RecipientName = string.IsNullOrWhiteSpace(draft.RecipientName)
                    ? null
                    : draft.RecipientName.Trim(),
                Status = OutboundMessage.Statuses.Pending,
                DedupeKey = dedupeKey,
                TemplateKey = draft.TemplateKey.Trim(),
                TemplateVersion = draft.TemplateVersion,
                PayloadVersion = draft.PayloadVersion,
                PayloadJson = draft.PayloadJson,
                NotBeforeUtc = draft.NotBeforeUtc ?? nowUtc,
                CreatedUtc = nowUtc,
            });
        }

        if (newMessages.Count > 0)
        {
            _ctx.OutboundMessages.AddRange(newMessages);
            await _ctx.SaveChangesAsync(cancellationToken);
        }

        _logger.LogInformation(
            "Enqueued outbound messages. RequestedCount={RequestedCount} EnqueuedCount={EnqueuedCount} DuplicateCount={DuplicateCount}",
            messages.Count,
            newMessages.Count,
            messages.Count - newMessages.Count);

        return new EnqueueOutboundMessagesResult(
            EnqueuedCount: newMessages.Count,
            DuplicateCount: messages.Count - newMessages.Count,
            EnqueuedIds: newMessages.Select(message => message.Id).ToList());
    }

    /// <summary>
    /// Selects due or stale messages and leases them to the caller for one processing attempt.
    /// </summary>
    public async Task<IReadOnlyList<OutboundMessage>> ClaimAsync(
        int batchSize,
        DateTime nowUtc,
        TimeSpan lockDuration,
        CancellationToken cancellationToken = default)
    {
        if (batchSize <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(batchSize), "Batch size must be greater than zero.");
        }

        if (lockDuration <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(lockDuration), "Lock duration must be greater than zero.");
        }

        var lockId = Guid.NewGuid();
        var lockedUntilUtc = nowUtc.Add(lockDuration);

        if (_ctx.Database.IsSqlServer())
        {
            var sqlServerMessages = await ClaimWithSqlServerAsync(
                batchSize,
                nowUtc,
                lockedUntilUtc,
                lockId,
                cancellationToken);
            LogClaimedMessages(sqlServerMessages, batchSize, lockedUntilUtc);
            return sqlServerMessages;
        }

        var messages = await ClaimWithEfAsync(
            batchSize,
            nowUtc,
            lockedUntilUtc,
            lockId,
            cancellationToken);
        LogClaimedMessages(messages, batchSize, lockedUntilUtc);
        return messages;
    }

    /// <summary>
    /// Extends a locked processing message so long-running rendering or delivery does not
    /// let another worker reclaim the row mid-attempt.
    /// </summary>
    public async Task<bool> RenewLockAsync(
        long id,
        Guid lockId,
        DateTime lockedUntilUtc,
        CancellationToken cancellationToken = default)
    {
        if (_ctx.Database.IsRelational())
        {
            var affected = await _ctx.OutboundMessages
                .Where(message =>
                    message.Id == id &&
                    message.LockId == lockId &&
                    message.Status == OutboundMessage.Statuses.Processing)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(message => message.LockedUntilUtc, lockedUntilUtc),
                    cancellationToken);

            if (affected != 1)
            {
                _logger.LogWarning(
                    "Failed to renew outbound message lock because the processing lock was not owned. MessageId={MessageId}",
                    id);
            }

            return affected == 1;
        }

        var outboundMessage = await _ctx.OutboundMessages
            .SingleOrDefaultAsync(
                message =>
                    message.Id == id &&
                    message.LockId == lockId &&
                    message.Status == OutboundMessage.Statuses.Processing,
                cancellationToken);

        if (outboundMessage is null)
        {
            _logger.LogWarning(
                "Failed to renew outbound message lock because the processing lock was not owned. MessageId={MessageId}",
                id);
            return false;
        }

        outboundMessage.LockedUntilUtc = lockedUntilUtc;
        await _ctx.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Marks a locked message sent and records the provider message id.
    /// </summary>
    public Task<bool> MarkSentAsync(
        long id,
        Guid lockId,
        string? providerMessageId,
        DateTime sentUtc,
        CancellationToken cancellationToken = default)
    {
        return CompleteAsync(
            id,
            lockId,
            status: OutboundMessage.Statuses.Sent,
            providerMessageId: providerMessageId,
            sentUtc: sentUtc,
            notBeforeUtc: null,
            lastError: null,
            cancellationToken);
    }

    /// <summary>
    /// Releases a locked message for retry after its next eligible send time.
    /// </summary>
    public Task<bool> MarkRetryAsync(
        long id,
        Guid lockId,
        string lastError,
        DateTime notBeforeUtc,
        CancellationToken cancellationToken = default)
    {
        return CompleteAsync(
            id,
            lockId,
            status: OutboundMessage.Statuses.Retry,
            providerMessageId: null,
            sentUtc: null,
            notBeforeUtc: notBeforeUtc,
            lastError: SanitizeLastError(lastError),
            cancellationToken);
    }

    /// <summary>
    /// Releases a locked message into terminal failure.
    /// </summary>
    public Task<bool> MarkDeadLetterAsync(
        long id,
        Guid lockId,
        string lastError,
        CancellationToken cancellationToken = default)
    {
        return CompleteAsync(
            id,
            lockId,
            status: OutboundMessage.Statuses.DeadLetter,
            providerMessageId: null,
            sentUtc: null,
            notBeforeUtc: null,
            lastError: SanitizeLastError(lastError),
            cancellationToken);
    }

    private async Task<IReadOnlyList<OutboundMessage>> ClaimWithSqlServerAsync(
        int batchSize,
        DateTime nowUtc,
        DateTime lockedUntilUtc,
        Guid lockId,
        CancellationToken cancellationToken)
    {
        // The SQL Server path claims rows atomically so multiple sender workers can run
        // without double-sending. READPAST skips rows another worker has locked, and
        // UPDLOCK keeps the selected rows reserved until the update assigns our LockId.
        return await _ctx.OutboundMessages
            .FromSqlInterpolated($"""
                ;WITH Claimable AS (
                    SELECT TOP ({batchSize}) *
                    FROM [OutboundMessages] WITH (UPDLOCK, READPAST, ROWLOCK)
                    WHERE (
                        [Status] IN ({OutboundMessage.Statuses.Pending}, {OutboundMessage.Statuses.Retry})
                        AND [NotBeforeUtc] <= {nowUtc}
                    )
                    OR (
                        [Status] = {OutboundMessage.Statuses.Processing}
                        AND [LockedUntilUtc] IS NOT NULL
                        AND [LockedUntilUtc] < {nowUtc}
                    )
                    ORDER BY [NotBeforeUtc], [CreatedUtc], [Id]
                )
                UPDATE Claimable
                SET
                    [Status] = {OutboundMessage.Statuses.Processing},
                    [LockId] = {lockId},
                    [LockedUntilUtc] = {lockedUntilUtc}
                OUTPUT INSERTED.*;
                """)
            .AsNoTracking()
            .ToListAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<OutboundMessage>> ClaimWithEfAsync(
        int batchSize,
        DateTime nowUtc,
        DateTime lockedUntilUtc,
        Guid lockId,
        CancellationToken cancellationToken)
    {
        // Non-SQL providers are used by tests. They cannot model SQL Server row locks,
        // but this keeps the same eligibility and state-transition semantics covered.
        var messages = await _ctx.OutboundMessages
            .Where(message =>
                (message.Status == OutboundMessage.Statuses.Pending ||
                 message.Status == OutboundMessage.Statuses.Retry) &&
                message.NotBeforeUtc <= nowUtc ||
                message.Status == OutboundMessage.Statuses.Processing &&
                message.LockedUntilUtc != null &&
                message.LockedUntilUtc < nowUtc)
            .OrderBy(message => message.NotBeforeUtc)
            .ThenBy(message => message.CreatedUtc)
            .ThenBy(message => message.Id)
            .Take(batchSize)
            .ToListAsync(cancellationToken);

        foreach (var message in messages)
        {
            message.Status = OutboundMessage.Statuses.Processing;
            message.LockId = lockId;
            message.LockedUntilUtc = lockedUntilUtc;
        }

        await _ctx.SaveChangesAsync(cancellationToken);
        return messages;
    }

    private async Task<bool> CompleteAsync(
        long id,
        Guid lockId,
        string status,
        string? providerMessageId,
        DateTime? sentUtc,
        DateTime? notBeforeUtc,
        string? lastError,
        CancellationToken cancellationToken)
    {
        if (_ctx.Database.IsRelational())
        {
            // Completion is lock-aware so an expired worker cannot overwrite a row that
            // has already been reclaimed and leased to another worker.
            var affected = await _ctx.OutboundMessages
                .Where(message => message.Id == id && message.LockId == lockId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(message => message.Status, status)
                    .SetProperty(message => message.LockId, (Guid?)null)
                    .SetProperty(message => message.LockedUntilUtc, (DateTime?)null)
                    .SetProperty(message => message.AttemptCount, message => message.AttemptCount + 1)
                    .SetProperty(message => message.ProviderMessageId, providerMessageId)
                    .SetProperty(message => message.SentUtc, sentUtc)
                    .SetProperty(message => message.NotBeforeUtc, message => notBeforeUtc ?? message.NotBeforeUtc)
                    .SetProperty(message => message.LastError, lastError),
                    cancellationToken);

            if (affected != 1)
            {
                _logger.LogWarning(
                    "Failed to complete outbound message because the processing lock was not owned. MessageId={MessageId} TargetStatus={TargetStatus}",
                    id,
                    status);
            }

            return affected == 1;
        }

        var outboundMessage = await _ctx.OutboundMessages
            .SingleOrDefaultAsync(
                message => message.Id == id && message.LockId == lockId,
                cancellationToken);

        if (outboundMessage is null)
        {
            _logger.LogWarning(
                "Failed to complete outbound message because the processing lock was not owned. MessageId={MessageId} TargetStatus={TargetStatus}",
                id,
                status);
            return false;
        }

        outboundMessage.Status = status;
        outboundMessage.LockId = null;
        outboundMessage.LockedUntilUtc = null;
        outboundMessage.AttemptCount++;
        outboundMessage.ProviderMessageId = providerMessageId;
        outboundMessage.SentUtc = sentUtc;
        if (notBeforeUtc is not null)
        {
            outboundMessage.NotBeforeUtc = notBeforeUtc.Value;
        }
        outboundMessage.LastError = lastError;

        await _ctx.SaveChangesAsync(cancellationToken);
        return true;
    }

    private void LogClaimedMessages(
        IReadOnlyList<OutboundMessage> messages,
        int batchSize,
        DateTime lockedUntilUtc)
    {
        if (messages.Count == 0)
        {
            _logger.LogDebug(
                "No due outbound messages were claimed. BatchSize={BatchSize}",
                batchSize);
            return;
        }

        _logger.LogInformation(
            "Claimed outbound messages for processing. ClaimedCount={ClaimedCount} BatchSize={BatchSize} LockedUntilUtc={LockedUntilUtc}",
            messages.Count,
            batchSize,
            lockedUntilUtc);
    }

    private static void ValidateDraft(OutboundMessageDraft message)
    {
        ArgumentNullException.ThrowIfNull(message);

        if (message.RunId == Guid.Empty)
        {
            throw new ArgumentException("Run ID is required.", nameof(message));
        }

        if (string.IsNullOrWhiteSpace(message.NotificationType))
        {
            throw new ArgumentException("Notification type is required.", nameof(message));
        }

        if (string.IsNullOrWhiteSpace(message.RecipientType))
        {
            throw new ArgumentException("Recipient type is required.", nameof(message));
        }

        if (string.IsNullOrWhiteSpace(message.RecipientEmail))
        {
            throw new ArgumentException("Recipient email is required.", nameof(message));
        }

        if (string.IsNullOrWhiteSpace(message.DedupeKey))
        {
            throw new ArgumentException("Dedupe key is required.", nameof(message));
        }

        if (string.IsNullOrWhiteSpace(message.TemplateKey))
        {
            throw new ArgumentException("Template key is required.", nameof(message));
        }

        if (message.TemplateVersion <= 0)
        {
            throw new ArgumentException("Template version must be greater than zero.", nameof(message));
        }

        if (message.PayloadVersion <= 0)
        {
            throw new ArgumentException("Payload version must be greater than zero.", nameof(message));
        }

        if (string.IsNullOrWhiteSpace(message.PayloadJson))
        {
            throw new ArgumentException("Payload JSON is required.", nameof(message));
        }
    }

    private static string SanitizeLastError(string lastError)
    {
        var value = string.IsNullOrWhiteSpace(lastError)
            ? "Unknown delivery error."
            : lastError.Trim();

        return value.Length <= LastErrorMaxLength
            ? value
            : value[..LastErrorMaxLength];
    }
}
