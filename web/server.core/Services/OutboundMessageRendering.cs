using System.Net;
using System.Text.Json;
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
                : $"Action Needed: Your Vacation Accrual is at {pctOfCap.Value:0}% of Maximum";
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
