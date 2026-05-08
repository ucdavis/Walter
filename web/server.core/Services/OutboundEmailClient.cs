namespace server.core.Services;

public interface IOutboundEmailClient
{
    /// <summary>
    /// Sends one rendered outbound email and returns provider metadata for audit storage.
    /// </summary>
    Task<OutboundEmailSendResult> SendAsync(
        OutboundEmailMessage message,
        CancellationToken cancellationToken = default);
}

public sealed record OutboundEmailMessage
{
    public required string ToEmail { get; init; }
    public string? ToName { get; init; }
    public required string Subject { get; init; }
    public required string TextBody { get; init; }
    public required string HtmlBody { get; init; }
}

public sealed record OutboundEmailSendResult(string? ProviderMessageId);
