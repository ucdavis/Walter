using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Utils;

namespace server.core.Services;

public enum SmtpSecureSocketMode
{
    Auto,
    None,
    StartTlsWhenAvailable,
    StartTls,
    SslOnConnect,
}

public sealed record SmtpOutboundEmailClientOptions
{
    public const string SectionName = "Notifications:Smtp";

    public string? Host { get; set; }
    public int Port { get; set; } = 25;
    public string? UserName { get; set; }
    public string? Password { get; set; }
    public string? FromAddress { get; set; }
    public string? FromDisplayName { get; set; }
    public string? ReplyToAddress { get; set; }
    public string? ReplyToDisplayName { get; set; }
    public SmtpSecureSocketMode SecureSocketMode { get; set; } = SmtpSecureSocketMode.Auto;
    public int TimeoutMilliseconds { get; set; } = 100_000;

    /// <summary>
    /// Returns startup-blocking validation errors for SMTP delivery configuration.
    /// </summary>
    public IReadOnlyList<string> ValidateForSending()
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(Host))
        {
            errors.Add($"{SectionName}:Host is required.");
        }

        if (Port is < 1 or > 65_535)
        {
            errors.Add($"{SectionName}:Port must be between 1 and 65535.");
        }

        if (string.IsNullOrWhiteSpace(FromAddress))
        {
            errors.Add($"{SectionName}:FromAddress is required.");
        }
        else if (!MailboxAddress.TryParse(FromAddress, out _))
        {
            errors.Add($"{SectionName}:FromAddress must be a valid email address.");
        }

        if (!string.IsNullOrWhiteSpace(ReplyToAddress) &&
            !MailboxAddress.TryParse(ReplyToAddress, out _))
        {
            errors.Add($"{SectionName}:ReplyToAddress must be a valid email address.");
        }

        if (!string.IsNullOrWhiteSpace(ReplyToDisplayName) &&
            string.IsNullOrWhiteSpace(ReplyToAddress))
        {
            errors.Add($"{SectionName}:ReplyToAddress is required when ReplyToDisplayName is set.");
        }

        if (string.IsNullOrWhiteSpace(UserName) != string.IsNullOrWhiteSpace(Password))
        {
            errors.Add($"{SectionName}:UserName and Password must be configured together.");
        }

        if (TimeoutMilliseconds <= 0)
        {
            errors.Add($"{SectionName}:TimeoutMilliseconds must be greater than zero.");
        }

        if (!Enum.IsDefined(typeof(SmtpSecureSocketMode), SecureSocketMode))
        {
            errors.Add($"{SectionName}:SecureSocketMode is invalid.");
        }

        return errors;
    }
}

public sealed class SmtpOutboundEmailClient : IOutboundEmailClient
{
    private readonly SmtpOutboundEmailClientOptions _options;
    private readonly Func<ISmtpEmailTransport> _transportFactory;
    private readonly ILogger<SmtpOutboundEmailClient> _logger;

    public SmtpOutboundEmailClient(
        IOptions<SmtpOutboundEmailClientOptions> options,
        ILogger<SmtpOutboundEmailClient>? logger = null)
        : this(
            options.Value,
            static () => new MailKitSmtpEmailTransport(),
            logger)
    {
    }

    internal SmtpOutboundEmailClient(
        SmtpOutboundEmailClientOptions options,
        Func<ISmtpEmailTransport> transportFactory,
        ILogger<SmtpOutboundEmailClient>? logger = null)
    {
        _options = options;
        _transportFactory = transportFactory;
        _logger = logger ?? NullLogger<SmtpOutboundEmailClient>.Instance;

        var validationErrors = _options.ValidateForSending();
        if (validationErrors.Count > 0)
        {
            throw new InvalidOperationException(
                "SMTP outbound email delivery is not fully configured: " +
                string.Join(" ", validationErrors));
        }
    }

    /// <summary>
    /// Sends one rendered outbound email through the configured SMTP relay.
    /// </summary>
    public async Task<OutboundEmailSendResult> SendAsync(
        OutboundEmailMessage message,
        CancellationToken cancellationToken = default)
    {
        var mimeMessage = BuildMimeMessage(message);
        await using var transport = _transportFactory();

        await transport.ConnectAsync(
            _options.Host!.Trim(),
            _options.Port,
            MapSecureSocketOptions(_options.SecureSocketMode),
            _options.TimeoutMilliseconds,
            cancellationToken);

        await AuthenticateIfConfiguredAsync(transport, cancellationToken);

        string providerResponse;
        try
        {
            providerResponse = await transport.SendAsync(mimeMessage, cancellationToken);
        }
        finally
        {
            await DisconnectAfterSendAttemptAsync(transport);
        }

        _logger.LogDebug(
            "SMTP relay accepted outbound email. MessageId={MessageId} ProviderResponse={ProviderResponse}",
            mimeMessage.MessageId,
            providerResponse);

        return new OutboundEmailSendResult(mimeMessage.MessageId);
    }

    /// <summary>
    /// Performs SMTP AUTH only when credentials are configured, preserving unauthenticated relay support without sending blank credentials.
    /// </summary>
    private async Task AuthenticateIfConfiguredAsync(
        ISmtpEmailTransport transport,
        CancellationToken cancellationToken)
    {
        // Some trusted relays accept unauthenticated SMTP; authenticate only when a complete credential pair is configured.
        if (!string.IsNullOrWhiteSpace(_options.UserName))
        {
            await transport.AuthenticateAsync(
                _options.UserName.Trim(),
                _options.Password!,
                cancellationToken);
        }
    }

    /// <summary>
    /// Releases the SMTP connection after a send attempt without surfacing post-send cancellation as delivery failure.
    /// </summary>
    private async Task DisconnectAfterSendAttemptAsync(ISmtpEmailTransport transport)
    {
        try
        {
            await transport.DisconnectAsync(quit: true, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SMTP disconnect failed after send attempt.");
        }
    }

    private MimeMessage BuildMimeMessage(OutboundEmailMessage message)
    {
        var mimeMessage = new MimeMessage
        {
            MessageId = MimeUtils.GenerateMessageId(),
            Subject = message.Subject,
        };

        mimeMessage.From.Add(CreateMailboxAddress(
            _options.FromDisplayName,
            _options.FromAddress!,
            $"{SmtpOutboundEmailClientOptions.SectionName}:FromAddress"));
        mimeMessage.To.Add(CreateMailboxAddress(
            message.ToName,
            message.ToEmail,
            nameof(message.ToEmail)));

        var replyToAddress = string.IsNullOrWhiteSpace(message.ReplyToEmail)
            ? _options.ReplyToAddress
            : message.ReplyToEmail;
        var replyToDisplayName = string.IsNullOrWhiteSpace(message.ReplyToEmail)
            ? _options.ReplyToDisplayName
            : message.ReplyToName;

        if (!string.IsNullOrWhiteSpace(replyToAddress))
        {
            mimeMessage.ReplyTo.Add(CreateMailboxAddress(
                replyToDisplayName,
                replyToAddress,
                nameof(message.ReplyToEmail)));
        }

        mimeMessage.Body = new BodyBuilder
        {
            TextBody = message.TextBody,
            HtmlBody = message.HtmlBody,
        }.ToMessageBody();

        return mimeMessage;
    }

    private static MailboxAddress CreateMailboxAddress(
        string? displayName,
        string emailAddress,
        string settingName)
    {
        if (!MailboxAddress.TryParse(emailAddress, out var mailboxAddress))
        {
            throw new InvalidOperationException($"{settingName} must be a valid email address.");
        }

        if (!string.IsNullOrWhiteSpace(displayName))
        {
            mailboxAddress.Name = displayName.Trim();
        }

        return mailboxAddress;
    }

    /// <summary>
    /// Maps configured TLS mode to MailKit, rejecting undefined values so configuration cannot silently downgrade TLS behavior.
    /// </summary>
    private static SecureSocketOptions MapSecureSocketOptions(SmtpSecureSocketMode mode)
    {
        return mode switch
        {
            SmtpSecureSocketMode.Auto => SecureSocketOptions.Auto,
            SmtpSecureSocketMode.None => SecureSocketOptions.None,
            SmtpSecureSocketMode.StartTlsWhenAvailable => SecureSocketOptions.StartTlsWhenAvailable,
            SmtpSecureSocketMode.StartTls => SecureSocketOptions.StartTls,
            SmtpSecureSocketMode.SslOnConnect => SecureSocketOptions.SslOnConnect,
            _ => throw new InvalidOperationException("Unsupported SMTP secure socket mode."),
        };
    }
}

internal interface ISmtpEmailTransport : IAsyncDisposable
{
    Task ConnectAsync(
        string host,
        int port,
        SecureSocketOptions secureSocketOptions,
        int timeoutMilliseconds,
        CancellationToken cancellationToken);

    Task AuthenticateAsync(
        string userName,
        string password,
        CancellationToken cancellationToken);

    Task<string> SendAsync(
        MimeMessage message,
        CancellationToken cancellationToken);

    Task DisconnectAsync(
        bool quit,
        CancellationToken cancellationToken);
}

internal sealed class MailKitSmtpEmailTransport : ISmtpEmailTransport
{
    private readonly SmtpClient _client = new();

    public Task ConnectAsync(
        string host,
        int port,
        SecureSocketOptions secureSocketOptions,
        int timeoutMilliseconds,
        CancellationToken cancellationToken)
    {
        _client.Timeout = timeoutMilliseconds;
        return _client.ConnectAsync(host, port, secureSocketOptions, cancellationToken);
    }

    public Task AuthenticateAsync(
        string userName,
        string password,
        CancellationToken cancellationToken)
    {
        return _client.AuthenticateAsync(userName, password, cancellationToken);
    }

    public Task<string> SendAsync(
        MimeMessage message,
        CancellationToken cancellationToken)
    {
        return _client.SendAsync(message, cancellationToken);
    }

    public Task DisconnectAsync(
        bool quit,
        CancellationToken cancellationToken)
    {
        return _client.DisconnectAsync(quit, cancellationToken);
    }

    public ValueTask DisposeAsync()
    {
        _client.Dispose();
        return ValueTask.CompletedTask;
    }
}
