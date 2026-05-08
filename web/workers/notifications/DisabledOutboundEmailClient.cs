using server.core.Services;

namespace Walter.Workers.Notifications;

public sealed class DisabledOutboundEmailClient : IOutboundEmailClient
{
    public Task<OutboundEmailSendResult> SendAsync(
        OutboundEmailMessage message,
        CancellationToken cancellationToken = default)
    {
        throw new InvalidOperationException(
            "Outbound email delivery is not configured for the notifications worker.");
    }
}
