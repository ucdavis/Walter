using System.Net.Mail;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;
using server.core.Services;
using server.Models;

namespace server.Services;

public interface IAccrualViewerRecipientProvider
{
    /// <summary>
    /// Returns active users explicitly assigned the AccrualViewer role.
    /// </summary>
    Task<IReadOnlyList<AccrualViewerRecipient>> GetActiveAccrualViewersAsync(
        CancellationToken cancellationToken = default);
}

public sealed record AccrualViewerRecipient(Guid UserId, string? Email, string? Name);

public sealed class AccrualViewerRecipientProvider : IAccrualViewerRecipientProvider
{
    private readonly AppDbContext _ctx;

    public AccrualViewerRecipientProvider(AppDbContext ctx)
    {
        _ctx = ctx;
    }

    /// <summary>
    /// Finds active AccrualViewer users without relying on Admin authorization bypass.
    /// </summary>
    public async Task<IReadOnlyList<AccrualViewerRecipient>> GetActiveAccrualViewersAsync(
        CancellationToken cancellationToken = default)
    {
        return await _ctx.Users
            .AsNoTracking()
            .Where(user => user.IsActive)
            .Where(user => user.Permissions.Any(permission =>
                permission.Role != null &&
                permission.Role.Name == Role.Names.AccrualViewer))
            .OrderBy(user => user.DisplayName ?? user.Kerberos)
            .Select(user => new AccrualViewerRecipient(
                user.Id,
                user.Email,
                user.DisplayName ?? user.Kerberos))
            .ToListAsync(cancellationToken);
    }
}

public sealed class AccrualNotificationMessageBuilder
{
    public const string EmployeeNotificationType = "accrual.employee";
    public const string ViewerReportNotificationType = "accrual.viewer-report";
    public const string ViewerReportTemplateKey = "accrual.viewer-report.v1";

    private const int PayloadVersion = 1;
    private const int TemplateVersion = 1;

    private static readonly JsonSerializerOptions PayloadJsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Creates employee outbound message drafts from eligible accrual notification candidates.
    /// </summary>
    public AccrualMessageBuildResult BuildEmployeeMessages(
        Guid runId,
        IReadOnlyList<AccrualNotificationCandidate> candidates,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        ValidateRunId(runId);

        var messages = new List<OutboundMessageDraft>();
        var skipped = new List<AccrualMessageSkip>();

        foreach (var candidate in candidates)
        {
            var email = NormalizeEmail(candidate.EmployeeEmail);
            if (!IsValidRecipientEmail(email))
            {
                skipped.Add(new AccrualMessageSkip(
                    OutboundMessage.RecipientTypes.Employee,
                    candidate.EmployeeId,
                    AccrualMessageSkipReasons.InvalidRecipientEmail));
                continue;
            }

            var payload = new AccrualEmployeeNotificationPayload
            {
                AccrualHoursPerMonth = candidate.AccrualHoursPerMonth,
                BalanceHours = candidate.BalanceHours,
                CapHours = candidate.CapHours,
                Classification = candidate.Classification,
                Department = candidate.Department,
                DepartmentCode = candidate.DepartmentCode,
                EmployeeAsOfDate = candidate.EmployeeAsOfDate,
                EmployeeGroup = candidate.EmployeeGroup.ToString(),
                EmployeeId = candidate.EmployeeId,
                EmployeeName = candidate.EmployeeName,
                LastVacationDate = candidate.LastVacationDate,
                MonthsToCap = candidate.MonthsToCap,
                PctOfCap = candidate.PctOfCap,
                SnapshotAsOfDate = candidate.SnapshotAsOfDate,
                Status = candidate.Status.ToString(),
            };

            messages.Add(new OutboundMessageDraft
            {
                RunId = runId,
                NotificationType = EmployeeNotificationType,
                RecipientType = OutboundMessage.RecipientTypes.Employee,
                RecipientEmail = email!,
                RecipientName = candidate.EmployeeName,
                DedupeKey = BuildEmployeeDedupeKey(candidate.EmployeeId, candidate.SnapshotAsOfDate),
                TemplateKey = GetEmployeeTemplateKey(candidate.EmployeeGroup),
                TemplateVersion = TemplateVersion,
                PayloadVersion = PayloadVersion,
                PayloadJson = JsonSerializer.Serialize(payload, PayloadJsonOptions),
                NotBeforeUtc = nowUtc,
            });
        }

        return new AccrualMessageBuildResult(messages, skipped);
    }

    /// <summary>
    /// Creates AccrualViewer report drafts for active viewer recipients.
    /// </summary>
    public AccrualMessageBuildResult BuildViewerReportMessages(
        Guid runId,
        AccrualOverviewResponse overview,
        IReadOnlyList<AccrualViewerRecipient> recipients,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(overview);
        ArgumentNullException.ThrowIfNull(recipients);
        ValidateRunId(runId);

        var messages = new List<OutboundMessageDraft>();
        var skipped = new List<AccrualMessageSkip>();

        foreach (var recipient in recipients)
        {
            var email = NormalizeEmail(recipient.Email);
            if (!IsValidRecipientEmail(email))
            {
                skipped.Add(new AccrualMessageSkip(
                    OutboundMessage.RecipientTypes.AccrualViewer,
                    recipient.UserId.ToString(),
                    AccrualMessageSkipReasons.InvalidRecipientEmail));
                continue;
            }

            var payload = new AccrualViewerReportPayload
            {
                ApproachingCapCount = overview.ApproachingCapCount,
                AtCapCount = overview.AtCapCount,
                DepartmentBreakdown = overview.DepartmentBreakdown
                    .Select(row => new AccrualViewerReportDepartmentPayload
                    {
                        ApproachingCapCount = row.ApproachingCapCount,
                        AtCapCount = row.AtCapCount,
                        Department = row.Department,
                        DepartmentCode = row.DepartmentCode,
                        Headcount = row.Headcount,
                        LostCostMonth = row.LostCostMonth,
                        LostCostYtd = row.LostCostYtd,
                    })
                    .ToList(),
                LostCostMonth = overview.LostCostMonth,
                LostCostYtd = overview.LostCostYtd,
                SnapshotAsOfDate = overview.AsOfDate,
                TotalDepartments = overview.TotalDepartments,
                TotalEmployees = overview.TotalEmployees,
                WasteRate = overview.WasteRate,
                YtdMonthCount = overview.YtdMonthCount,
            };

            messages.Add(new OutboundMessageDraft
            {
                RunId = runId,
                NotificationType = ViewerReportNotificationType,
                RecipientType = OutboundMessage.RecipientTypes.AccrualViewer,
                RecipientEmail = email!,
                RecipientName = recipient.Name,
                DedupeKey = BuildViewerReportDedupeKey(recipient.UserId, overview.AsOfDate),
                TemplateKey = ViewerReportTemplateKey,
                TemplateVersion = TemplateVersion,
                PayloadVersion = PayloadVersion,
                PayloadJson = JsonSerializer.Serialize(payload, PayloadJsonOptions),
                NotBeforeUtc = nowUtc,
            });
        }

        return new AccrualMessageBuildResult(messages, skipped);
    }

    private static string BuildEmployeeDedupeKey(string employeeId, DateTime snapshotAsOfDate)
    {
        return $"accrual:employee:{employeeId}:{snapshotAsOfDate:yyyy-MM-dd}";
    }

    private static string BuildViewerReportDedupeKey(Guid userId, DateTime snapshotAsOfDate)
    {
        return $"accrual:viewer-report:{userId}:{snapshotAsOfDate:yyyy-MM-dd}";
    }

    private static string GetEmployeeTemplateKey(AccrualEmployeeGroup employeeGroup)
    {
        return employeeGroup switch
        {
            AccrualEmployeeGroup.FacultyAcademic => "accrual.employee.faculty-academic.v1",
            AccrualEmployeeGroup.Staff => "accrual.employee.staff.v1",
            _ => "accrual.employee.generic.v1",
        };
    }

    private static string? NormalizeEmail(string? email)
    {
        return string.IsNullOrWhiteSpace(email) ? null : email.Trim();
    }

    private static bool IsValidRecipientEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        try
        {
            var parsed = new MailAddress(email);
            return string.Equals(parsed.Address, email, StringComparison.OrdinalIgnoreCase) &&
                   parsed.Host.Contains('.', StringComparison.Ordinal);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static void ValidateRunId(Guid runId)
    {
        if (runId == Guid.Empty)
        {
            throw new ArgumentException("Run ID is required.", nameof(runId));
        }
    }
}

public sealed record AccrualMessageBuildResult(
    IReadOnlyList<OutboundMessageDraft> Messages,
    IReadOnlyList<AccrualMessageSkip> Skipped);

public sealed record AccrualMessageSkip(
    string RecipientType,
    string RecipientKey,
    string Reason);

public static class AccrualMessageSkipReasons
{
    public const string InvalidRecipientEmail = "InvalidRecipientEmail";
}

public sealed class AccrualEmployeeNotificationPayload
{
    public DateTime SnapshotAsOfDate { get; init; }
    public DateTime EmployeeAsOfDate { get; init; }
    public string EmployeeId { get; init; } = string.Empty;
    public string EmployeeName { get; init; } = string.Empty;
    public string DepartmentCode { get; init; } = string.Empty;
    public string Department { get; init; } = string.Empty;
    public string Classification { get; init; } = string.Empty;
    public string EmployeeGroup { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public decimal BalanceHours { get; init; }
    public decimal CapHours { get; init; }
    public decimal PctOfCap { get; init; }
    public decimal AccrualHoursPerMonth { get; init; }
    public int? MonthsToCap { get; init; }
    public DateTime? LastVacationDate { get; init; }
}

public sealed class AccrualViewerReportPayload
{
    public DateTime SnapshotAsOfDate { get; init; }
    public int ApproachingCapCount { get; init; }
    public int AtCapCount { get; init; }
    public int TotalDepartments { get; init; }
    public int TotalEmployees { get; init; }
    public decimal LostCostMonth { get; init; }
    public decimal LostCostYtd { get; init; }
    public decimal WasteRate { get; init; }
    public int YtdMonthCount { get; init; }
    public IReadOnlyList<AccrualViewerReportDepartmentPayload> DepartmentBreakdown { get; init; } = [];
}

public sealed class AccrualViewerReportDepartmentPayload
{
    public string DepartmentCode { get; init; } = string.Empty;
    public string Department { get; init; } = string.Empty;
    public int Headcount { get; init; }
    public int ApproachingCapCount { get; init; }
    public int AtCapCount { get; init; }
    public decimal LostCostMonth { get; init; }
    public decimal LostCostYtd { get; init; }
}
