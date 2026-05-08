using server.core.Models;

namespace server.core.Services;

public interface IAccrualNotificationGenerator
{
    /// <summary>
    /// Generates the monthly accrual outbound message drafts and optionally enqueues them.
    /// </summary>
    Task<AccrualNotificationGenerationResult> GenerateMonthlyAsync(
        DateTime nowUtc,
        AccrualNotificationGenerationOptions? options = null,
        CancellationToken cancellationToken = default);
}

public sealed record AccrualNotificationGenerationOptions
{
    public bool DryRun { get; init; }
    public Guid? RunId { get; init; }
}

public sealed record AccrualNotificationGenerationResult
{
    public Guid RunId { get; init; }
    public AccrualNotificationGenerationStatus Status { get; init; }
    public DateTime? SnapshotAsOfDate { get; init; }
    public int EmployeeCandidateCount { get; init; }
    public int ViewerRecipientCount { get; init; }
    public int DraftCount { get; init; }
    public int SkippedCount { get; init; }
    public int EnqueuedCount { get; init; }
    public int DuplicateCount { get; init; }
    public IReadOnlyList<AccrualMessageSkip> Skipped { get; init; } = [];
}

public enum AccrualNotificationGenerationStatus
{
    NoAccrualSnapshot,
    DryRun,
    Completed,
}

public sealed class AccrualNotificationGenerator : IAccrualNotificationGenerator
{
    private readonly IAccrualReportDataSource _accrualReportDataSource;
    private readonly IAccrualViewerRecipientProvider _viewerRecipientProvider;
    private readonly AccrualNotificationMessageBuilder _messageBuilder;
    private readonly IOutboundMessageQueue _outboundMessageQueue;

    public AccrualNotificationGenerator(
        IAccrualReportDataSource accrualReportDataSource,
        IAccrualViewerRecipientProvider viewerRecipientProvider,
        AccrualNotificationMessageBuilder messageBuilder,
        IOutboundMessageQueue outboundMessageQueue)
    {
        _accrualReportDataSource = accrualReportDataSource;
        _viewerRecipientProvider = viewerRecipientProvider;
        _messageBuilder = messageBuilder;
        _outboundMessageQueue = outboundMessageQueue;
    }

    /// <summary>
    /// Builds employee and AccrualViewer notification messages for the latest accrual snapshot.
    /// </summary>
    public async Task<AccrualNotificationGenerationResult> GenerateMonthlyAsync(
        DateTime nowUtc,
        AccrualNotificationGenerationOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        options ??= new AccrualNotificationGenerationOptions();

        var runId = options.RunId ?? Guid.NewGuid();
        if (runId == Guid.Empty)
        {
            throw new ArgumentException("Run ID is required.", nameof(options));
        }

        var records = await _accrualReportDataSource.GetEmployeeAccrualBalancesAsync(
            GetAccrualHistoryStartDate(nowUtc),
            ct: cancellationToken);

        var overview = AccrualOverviewCalculator.Build(records);
        if (overview.AsOfDate == default)
        {
            return new AccrualNotificationGenerationResult
            {
                RunId = runId,
                Status = AccrualNotificationGenerationStatus.NoAccrualSnapshot,
            };
        }

        var employeeCandidates = AccrualOverviewCalculator.BuildNotificationCandidates(records);
        var viewerRecipients = await _viewerRecipientProvider.GetActiveAccrualViewersAsync(cancellationToken);

        var employeeBuild = _messageBuilder.BuildEmployeeMessages(runId, employeeCandidates, nowUtc);
        var viewerBuild = _messageBuilder.BuildViewerReportMessages(runId, overview, viewerRecipients, nowUtc);
        var drafts = employeeBuild.Messages
            .Concat(viewerBuild.Messages)
            .ToList();
        var skipped = employeeBuild.Skipped
            .Concat(viewerBuild.Skipped)
            .ToList();

        if (options.DryRun)
        {
            return new AccrualNotificationGenerationResult
            {
                RunId = runId,
                Status = AccrualNotificationGenerationStatus.DryRun,
                SnapshotAsOfDate = overview.AsOfDate,
                EmployeeCandidateCount = employeeCandidates.Count,
                ViewerRecipientCount = viewerRecipients.Count,
                DraftCount = drafts.Count,
                SkippedCount = skipped.Count,
                Skipped = skipped,
            };
        }

        var enqueueResult = await _outboundMessageQueue.EnqueueAsync(drafts, nowUtc, cancellationToken);

        return new AccrualNotificationGenerationResult
        {
            RunId = runId,
            Status = AccrualNotificationGenerationStatus.Completed,
            SnapshotAsOfDate = overview.AsOfDate,
            EmployeeCandidateCount = employeeCandidates.Count,
            ViewerRecipientCount = viewerRecipients.Count,
            DraftCount = drafts.Count,
            SkippedCount = skipped.Count,
            EnqueuedCount = enqueueResult.EnqueuedCount,
            DuplicateCount = enqueueResult.DuplicateCount,
            Skipped = skipped,
        };
    }

    private static DateTime GetAccrualHistoryStartDate(DateTime nowUtc)
    {
        return new DateTime(nowUtc.Year, nowUtc.Month, 1).AddMonths(-15);
    }
}
