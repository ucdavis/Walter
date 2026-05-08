using FluentAssertions;
using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.tests.Services;

public sealed class AccrualNotificationGeneratorTests
{
    [Fact]
    public async Task GenerateMonthlyAsync_builds_and_enqueues_employee_and_viewer_messages()
    {
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var runId = Guid.NewGuid();
        var viewerId = Guid.NewGuid();
        var datamart = new FakeDatamartService(
        [
            CreateRecord(
                employeeId: "E001",
                employeeEmail: "employee@example.com",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E002",
                employeeEmail: "missing-email",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E003",
                employeeEmail: "active@example.com",
                calculatedBal: 120m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 50m),
        ]);
        var viewerProvider = new FakeAccrualViewerRecipientProvider(
        [
            new AccrualViewerRecipient(viewerId, "viewer@example.com", "Viewer Person"),
            new AccrualViewerRecipient(Guid.NewGuid(), "", "Invalid Viewer"),
        ]);
        var queue = new FakeOutboundMessageQueue();
        var generator = CreateGenerator(datamart, viewerProvider, queue);

        var result = await generator.GenerateMonthlyAsync(
            now,
            new AccrualNotificationGenerationOptions { RunId = runId });

        datamart.StartDate.Should().Be(new DateTime(2025, 2, 1));
        result.Status.Should().Be(AccrualNotificationGenerationStatus.Completed);
        result.RunId.Should().Be(runId);
        result.SnapshotAsOfDate.Should().Be(new DateTime(2026, 4, 30));
        result.EmployeeCandidateCount.Should().Be(2);
        result.ViewerRecipientCount.Should().Be(2);
        result.DraftCount.Should().Be(2);
        result.SkippedCount.Should().Be(2);
        result.EnqueuedCount.Should().Be(2);
        result.DuplicateCount.Should().Be(0);

        queue.EnqueueCalled.Should().BeTrue();
        queue.NowUtc.Should().Be(now);
        queue.Messages.Should().HaveCount(2);
        queue.Messages.Should().Contain(message =>
            message.RunId == runId &&
            message.NotificationType == AccrualNotificationMessageBuilder.EmployeeNotificationType &&
            message.RecipientType == OutboundMessage.RecipientTypes.Employee &&
            message.DedupeKey == "accrual:employee:E001:2026-04-30");
        queue.Messages.Should().Contain(message =>
            message.RunId == runId &&
            message.NotificationType == AccrualNotificationMessageBuilder.ViewerReportNotificationType &&
            message.RecipientType == OutboundMessage.RecipientTypes.AccrualViewer &&
            message.DedupeKey == $"accrual:viewer-report:{viewerId}:2026-04-30");
        result.Skipped.Select(skip => skip.RecipientType).Should().BeEquivalentTo(
            [OutboundMessage.RecipientTypes.Employee, OutboundMessage.RecipientTypes.AccrualViewer]);
    }

    [Fact]
    public async Task GenerateMonthlyAsync_dry_run_builds_counts_without_enqueueing()
    {
        var datamart = new FakeDatamartService(
        [
            CreateRecord(
                employeeId: "E001",
                employeeEmail: "employee@example.com",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
        ]);
        var viewerProvider = new FakeAccrualViewerRecipientProvider(
        [
            new AccrualViewerRecipient(Guid.NewGuid(), "viewer@example.com", "Viewer Person"),
        ]);
        var queue = new FakeOutboundMessageQueue();
        var generator = CreateGenerator(datamart, viewerProvider, queue);

        var result = await generator.GenerateMonthlyAsync(
            new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc),
            new AccrualNotificationGenerationOptions { DryRun = true });

        result.Status.Should().Be(AccrualNotificationGenerationStatus.DryRun);
        result.DraftCount.Should().Be(2);
        result.EnqueuedCount.Should().Be(0);
        result.DuplicateCount.Should().Be(0);
        queue.EnqueueCalled.Should().BeFalse();
    }

    [Fact]
    public async Task GenerateMonthlyAsync_returns_no_snapshot_without_querying_viewers_or_queue()
    {
        var datamart = new FakeDatamartService([]);
        var viewerProvider = new FakeAccrualViewerRecipientProvider([]);
        var queue = new FakeOutboundMessageQueue();
        var generator = CreateGenerator(datamart, viewerProvider, queue);

        var result = await generator.GenerateMonthlyAsync(
            new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc));

        result.Status.Should().Be(AccrualNotificationGenerationStatus.NoAccrualSnapshot);
        result.SnapshotAsOfDate.Should().BeNull();
        result.DraftCount.Should().Be(0);
        viewerProvider.CallCount.Should().Be(0);
        queue.EnqueueCalled.Should().BeFalse();
    }

    [Fact]
    public async Task GenerateMonthlyAsync_reports_duplicate_count_from_queue()
    {
        var datamart = new FakeDatamartService(
        [
            CreateRecord(
                employeeId: "E001",
                employeeEmail: "employee@example.com",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
        ]);
        var viewerProvider = new FakeAccrualViewerRecipientProvider([]);
        var queue = new FakeOutboundMessageQueue
        {
            EnqueuedCountOverride = 0,
            DuplicateCountOverride = 1,
        };
        var generator = CreateGenerator(datamart, viewerProvider, queue);

        var result = await generator.GenerateMonthlyAsync(
            new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc));

        result.Status.Should().Be(AccrualNotificationGenerationStatus.Completed);
        result.DraftCount.Should().Be(1);
        result.EnqueuedCount.Should().Be(0);
        result.DuplicateCount.Should().Be(1);
    }

    private static AccrualNotificationGenerator CreateGenerator(
        IAccrualReportDataSource accrualReportDataSource,
        IAccrualViewerRecipientProvider viewerRecipientProvider,
        IOutboundMessageQueue outboundMessageQueue)
    {
        return new AccrualNotificationGenerator(
            accrualReportDataSource,
            viewerRecipientProvider,
            new AccrualNotificationMessageBuilder(),
            outboundMessageQueue);
    }

    private static EmployeeAccrualBalanceRecord CreateRecord(
        string employeeId,
        string? employeeEmail,
        decimal calculatedBal,
        decimal accrualLimit,
        decimal accrualHours,
        decimal accrualPercentage)
    {
        return new EmployeeAccrualBalanceRecord
        {
            AccrualHours = accrualHours,
            AccrualLimit = accrualLimit,
            AccrualPercentage = accrualPercentage,
            AsOfDate = new DateTime(2026, 4, 30),
            CalculatedBal = calculatedBal,
            EmployeeClassDescription = "Staff: Career",
            EmployeeEmail = employeeEmail,
            EmployeeId = employeeId,
            EmployeeName = $"Employee {employeeId}",
            Level5Dept = "030003",
            Level5DeptDesc = "PLANT SCIENCES",
            TypeLabel = "Vacation",
        };
    }

    private sealed class FakeDatamartService : IAccrualReportDataSource
    {
        private readonly IReadOnlyList<EmployeeAccrualBalanceRecord> _records;

        public FakeDatamartService(IReadOnlyList<EmployeeAccrualBalanceRecord> records)
        {
            _records = records;
        }

        public DateTime? StartDate { get; private set; }

        public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
            DateTime startDate,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            StartDate = startDate;
            return Task.FromResult(_records);
        }

    }

    private sealed class FakeAccrualViewerRecipientProvider : IAccrualViewerRecipientProvider
    {
        private readonly IReadOnlyList<AccrualViewerRecipient> _recipients;

        public FakeAccrualViewerRecipientProvider(IReadOnlyList<AccrualViewerRecipient> recipients)
        {
            _recipients = recipients;
        }

        public int CallCount { get; private set; }

        public Task<IReadOnlyList<AccrualViewerRecipient>> GetActiveAccrualViewersAsync(
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(_recipients);
        }
    }

    private sealed class FakeOutboundMessageQueue : IOutboundMessageQueue
    {
        public bool EnqueueCalled { get; private set; }
        public DateTime? NowUtc { get; private set; }
        public IReadOnlyList<OutboundMessageDraft> Messages { get; private set; } = [];
        public int? EnqueuedCountOverride { get; init; }
        public int? DuplicateCountOverride { get; init; }

        public Task<EnqueueOutboundMessagesResult> EnqueueAsync(
            IReadOnlyList<OutboundMessageDraft> messages,
            DateTime nowUtc,
            CancellationToken cancellationToken = default)
        {
            EnqueueCalled = true;
            NowUtc = nowUtc;
            Messages = messages;

            return Task.FromResult(new EnqueueOutboundMessagesResult(
                EnqueuedCountOverride ?? messages.Count,
                DuplicateCountOverride ?? 0,
                []));
        }

        public Task<IReadOnlyList<OutboundMessage>> ClaimAsync(
            int batchSize,
            DateTime nowUtc,
            TimeSpan lockDuration,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<bool> MarkSentAsync(
            long id,
            Guid lockId,
            string? providerMessageId,
            DateTime sentUtc,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
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
