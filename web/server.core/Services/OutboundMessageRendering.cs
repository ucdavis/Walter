using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using server.core.Domain;

namespace server.core.Services;

public interface IOutboundMessageRenderer
{
    /// <summary>
    /// Renders a claimed outbound message into the concrete email subject and body.
    /// </summary>
    Task<RenderedOutboundMessage> RenderAsync(
        OutboundMessage message,
        CancellationToken cancellationToken = default);
}

public sealed record RenderedOutboundMessage(
    string Subject,
    string TextBody,
    string HtmlBody);

public sealed class PlaceholderOutboundMessageRenderer : IOutboundMessageRenderer
{
    private static readonly JsonSerializerOptions IndentedJsonOptions = new()
    {
        WriteIndented = true,
    };

    /// <summary>
    /// Produces a deterministic placeholder email until the MJML template renderer is wired in.
    /// </summary>
    public Task<RenderedOutboundMessage> RenderAsync(
        OutboundMessage message,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        cancellationToken.ThrowIfCancellationRequested();

        var formattedPayload = FormatPayload(message.PayloadJson);
        var subject = BuildSubject(message, formattedPayload);
        var textBody = $"""
            This is a placeholder render for an outbound notification.

            Template: {message.TemplateKey} v{message.TemplateVersion}
            Notification Type: {message.NotificationType}
            Recipient Type: {message.RecipientType}
            Payload Version: {message.PayloadVersion}

            Payload:
            {formattedPayload}
            """;

        var htmlBody = $"""
            <!doctype html>
            <html>
            <body>
                <p>This is a placeholder render for an outbound notification.</p>
                <dl>
                    <dt>Template</dt><dd>{WebUtility.HtmlEncode($"{message.TemplateKey} v{message.TemplateVersion}")}</dd>
                    <dt>Notification Type</dt><dd>{WebUtility.HtmlEncode(message.NotificationType)}</dd>
                    <dt>Recipient Type</dt><dd>{WebUtility.HtmlEncode(message.RecipientType)}</dd>
                    <dt>Payload Version</dt><dd>{message.PayloadVersion}</dd>
                </dl>
                <pre>{WebUtility.HtmlEncode(formattedPayload)}</pre>
            </body>
            </html>
            """;

        return Task.FromResult(new RenderedOutboundMessage(subject, textBody, htmlBody));
    }

    private static string BuildSubject(OutboundMessage message, string formattedPayload)
    {
        if (message.NotificationType == AccrualNotificationMessageBuilder.EmployeeNotificationType)
        {
            var pctOfCap = TryReadDecimal(formattedPayload, "pctOfCap");
            return pctOfCap is null
                ? "Action Needed: Your Vacation Accrual Balance"
                : $"Action Needed: Your Vacation Accrual is at {AccrualEmailTemplateFormatting.Percent(pctOfCap.Value)} of Maximum";
        }

        if (message.NotificationType == AccrualNotificationMessageBuilder.ViewerReportNotificationType)
        {
            return "Monthly Vacation Accrual Report";
        }

        return $"Notification: {message.NotificationType}";
    }

    private static string FormatPayload(string payloadJson)
    {
        using var document = JsonDocument.Parse(payloadJson);
        return JsonSerializer.Serialize(document.RootElement, IndentedJsonOptions);
    }

    private static decimal? TryReadDecimal(string formattedPayload, string propertyName)
    {
        using var document = JsonDocument.Parse(formattedPayload);
        if (!document.RootElement.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.TryGetDecimal(out var value) ? value : null;
    }
}

public sealed class AccrualOutboundMessageRenderer : IOutboundMessageRenderer
{
    private const int SupportedTemplateVersion = 1;
    private const int SupportedPayloadVersion = 1;
    private const string EmployeeHtmlTemplatePath = "/Views/Emails/AccrualEmployeeNotification_mjml.cshtml";
    private const string EmployeeTextTemplatePath = "/Views/Emails/AccrualEmployeeNotification_text.cshtml";
    private const string ViewerReportHtmlTemplatePath = "/Views/Emails/AccrualViewerReport_mjml.cshtml";
    private const string ViewerReportTextTemplatePath = "/Views/Emails/AccrualViewerReport_text.cshtml";

    private static readonly JsonSerializerOptions PayloadJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly INotificationRenderer _notificationRenderer;
    private readonly AppOptions _appOptions;

    public AccrualOutboundMessageRenderer(
        INotificationRenderer notificationRenderer,
        IOptions<AppOptions> appOptions)
    {
        _notificationRenderer = notificationRenderer;
        _appOptions = appOptions.Value;
    }

    /// <summary>
    /// Renders accrual notification messages from the durable queued payload only.
    /// </summary>
    public async Task<RenderedOutboundMessage> RenderAsync(
        OutboundMessage message,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        cancellationToken.ThrowIfCancellationRequested();
        ValidateVersions(message);

        return message.TemplateKey switch
        {
            "accrual.employee.faculty-academic.v1" or
            "accrual.employee.staff.v1" or
            "accrual.employee.generic.v1" => await RenderEmployeeAsync(message, cancellationToken),
            AccrualNotificationMessageBuilder.ViewerReportTemplateKey => await RenderViewerReportAsync(
                message,
                cancellationToken),
            _ => throw new InvalidOperationException(
                $"Unsupported outbound message template key '{message.TemplateKey}'."),
        };
    }

    private async Task<RenderedOutboundMessage> RenderEmployeeAsync(
        OutboundMessage message,
        CancellationToken cancellationToken)
    {
        var payload = DeserializePayload<AccrualEmployeeNotificationPayload>(message);
        var model = BuildEmployeeModel(message, payload);
        var text = await _notificationRenderer.RenderRazorAsync(
            EmployeeTextTemplatePath,
            model,
            cancellationToken);
        var html = await _notificationRenderer.RenderMjmlAsync(
            EmployeeHtmlTemplatePath,
            model,
            cancellationToken);

        return new RenderedOutboundMessage(
            BuildEmployeeSubject(payload),
            text,
            html);
    }

    private async Task<RenderedOutboundMessage> RenderViewerReportAsync(
        OutboundMessage message,
        CancellationToken cancellationToken)
    {
        var payload = DeserializePayload<AccrualViewerReportPayload>(message);
        var model = BuildViewerReportModel(payload);
        var text = await _notificationRenderer.RenderRazorAsync(
            ViewerReportTextTemplatePath,
            model,
            cancellationToken);
        var html = await _notificationRenderer.RenderMjmlAsync(
            ViewerReportHtmlTemplatePath,
            model,
            cancellationToken);

        return new RenderedOutboundMessage(
            "Monthly Vacation Accrual Report",
            text,
            html);
    }

    private AccrualEmployeeNotificationTemplateModel BuildEmployeeModel(
        OutboundMessage message,
        AccrualEmployeeNotificationPayload payload)
    {
        var variant = message.TemplateKey switch
        {
            "accrual.employee.faculty-academic.v1" => AccrualEmployeeNotificationVariant.FacultyAcademic,
            "accrual.employee.staff.v1" => AccrualEmployeeNotificationVariant.Staff,
            _ => AccrualEmployeeNotificationVariant.Generic,
        };

        return new AccrualEmployeeNotificationTemplateModel
        {
            AppName = _appOptions.Name,
            GreetingName = NormalizeDisplayName(message.RecipientName) ?? payload.EmployeeName,
            Payload = payload,
            Variant = variant,
        };
    }

    private AccrualViewerReportTemplateModel BuildViewerReportModel(AccrualViewerReportPayload payload)
    {
        var appBaseUri = _appOptions.TryGetBaseUri();
        // Email delivery should not fail because the optional app URL is absent or invalid.
        var reportUrl = appBaseUri is null ? string.Empty : BuildViewerReportUrl(appBaseUri);

        return new AccrualViewerReportTemplateModel
        {
            AppName = _appOptions.Name,
            ButtonText = string.IsNullOrWhiteSpace(reportUrl) ? string.Empty : "Open Accrual Report",
            ButtonUrl = reportUrl,
            LayoutWidth = "720px",
            Payload = payload,
        };
    }

    private static string BuildViewerReportUrl(Uri appBaseUri)
    {
        var builder = new UriBuilder(appBaseUri)
        {
            Path = $"{appBaseUri.AbsolutePath.TrimEnd('/')}/accruals",
            Query = string.Empty,
            Fragment = string.Empty,
        };

        return builder.Uri.ToString();
    }

    /// <summary>
    /// Protects the queued message contract from being rendered by an incompatible template version.
    /// </summary>
    private static void ValidateVersions(OutboundMessage message)
    {
        if (message.TemplateVersion != SupportedTemplateVersion)
        {
            throw new InvalidOperationException(
                $"Unsupported template version '{message.TemplateVersion}' for template '{message.TemplateKey}'.");
        }

        if (message.PayloadVersion != SupportedPayloadVersion)
        {
            throw new InvalidOperationException(
                $"Unsupported payload version '{message.PayloadVersion}' for template '{message.TemplateKey}'.");
        }
    }

    /// <summary>
    /// Deserializes the retained payload JSON without reaching back to source systems during retries.
    /// </summary>
    private static TPayload DeserializePayload<TPayload>(OutboundMessage message)
    {
        try
        {
            return JsonSerializer.Deserialize<TPayload>(message.PayloadJson, PayloadJsonOptions)
                ?? throw new InvalidOperationException(
                    $"Payload JSON for template '{message.TemplateKey}' deserialized to null.");
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"Payload JSON for template '{message.TemplateKey}' is invalid.",
                ex);
        }
    }

    private static string? NormalizeDisplayName(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string BuildEmployeeSubject(AccrualEmployeeNotificationPayload payload)
    {
        return $"Action Needed: Your Vacation Accrual is at {AccrualEmailTemplateFormatting.Percent(payload.PctOfCap)} of Maximum";
    }
}
