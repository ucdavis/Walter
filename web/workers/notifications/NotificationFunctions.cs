using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using server.core.Services;

namespace Walter.Workers.Notifications;

public sealed class NotificationFunctions
{
    private readonly ILogger<NotificationFunctions> _logger;
    private readonly NotificationWorkerOptions _options;
    private readonly IServiceProvider _serviceProvider;

    public NotificationFunctions(
        IServiceProvider serviceProvider,
        IOptions<NotificationWorkerOptions> options,
        ILogger<NotificationFunctions> logger)
    {
        _serviceProvider = serviceProvider;
        _options = options.Value;
        _logger = logger;
    }

    [Function(nameof(GenerateMonthlyAccrualNotificationsAsync))]
    public async Task GenerateMonthlyAccrualNotificationsAsync(
        [TimerTrigger("%NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE%")] TimerInfo timer,
        CancellationToken cancellationToken)
    {
        if (!_options.AccrualGenerationEnabled)
        {
            _logger.LogInformation("Monthly accrual notification generation timer fired but is disabled.");
            return;
        }

        await using var scope = _serviceProvider.CreateAsyncScope();
        var accrualNotificationGenerator = scope.ServiceProvider.GetRequiredService<IAccrualNotificationGenerator>();

        var result = await accrualNotificationGenerator.GenerateMonthlyAsync(
            DateTime.UtcNow,
            cancellationToken: cancellationToken);

        _logger.LogInformation(
            "Monthly accrual notification generation timer completed. Status={Status} RunId={RunId} DraftCount={DraftCount} EnqueuedCount={EnqueuedCount} DuplicateCount={DuplicateCount} SkippedCount={SkippedCount}",
            result.Status,
            result.RunId,
            result.DraftCount,
            result.EnqueuedCount,
            result.DuplicateCount,
            result.SkippedCount);
    }

    [Function(nameof(ProcessOutboundMessagesAsync))]
    public async Task ProcessOutboundMessagesAsync(
        [TimerTrigger("%NOTIFICATIONS_SENDER_SCHEDULE%")] TimerInfo timer,
        CancellationToken cancellationToken)
    {
        if (!_options.SenderEnabled)
        {
            _logger.LogInformation("Outbound message sender timer fired but is disabled.");
            return;
        }

        await using var scope = _serviceProvider.CreateAsyncScope();
        var outboundMessageSender = scope.ServiceProvider.GetRequiredService<IOutboundMessageSender>();

        var result = await outboundMessageSender.ProcessDueAsync(
            DateTime.UtcNow,
            cancellationToken);

        _logger.LogInformation(
            "Outbound message sender timer completed. ClaimedCount={ClaimedCount} SentCount={SentCount} RetryCount={RetryCount} DeadLetterCount={DeadLetterCount} LostLockCount={LostLockCount}",
            result.ClaimedCount,
            result.SentCount,
            result.RetryCount,
            result.DeadLetterCount,
            result.LostLockCount);
    }
}
