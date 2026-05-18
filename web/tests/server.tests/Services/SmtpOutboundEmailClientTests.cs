using FluentAssertions;
using MailKit.Security;
using MimeKit;
using server.core.Services;

namespace server.tests.Services;

public sealed class SmtpOutboundEmailClientTests
{
    [Fact]
    public async Task SendAsync_builds_mime_message_and_sends_through_configured_smtp_transport()
    {
        var transport = new FakeSmtpEmailTransport
        {
            SendResponse = "250 2.0.0 queued",
        };
        var client = new SmtpOutboundEmailClient(
            new SmtpOutboundEmailClientOptions
            {
                Host = "smtp.example.edu",
                Port = 587,
                UserName = "smtp-user",
                Password = "smtp-password",
                FromAddress = "walter@example.edu",
                FromDisplayName = "Walter Notifications",
                ReplyToAddress = "help@example.edu",
                ReplyToDisplayName = "Walter Support",
                SecureSocketMode = SmtpSecureSocketMode.StartTls,
                TimeoutMilliseconds = 30_000,
            },
            () => transport);

        var result = await client.SendAsync(new OutboundEmailMessage
        {
            ToEmail = "person@example.edu",
            ToName = "Person Example",
            Subject = "Action Needed: Your Vacation Accrual is at 100% of Maximum",
            TextBody = "Plain text body",
            HtmlBody = "<p>HTML body</p>",
        });

        transport.Host.Should().Be("smtp.example.edu");
        transport.Port.Should().Be(587);
        transport.SecureSocketOptions.Should().Be(SecureSocketOptions.StartTls);
        transport.TimeoutMilliseconds.Should().Be(30_000);
        transport.UserName.Should().Be("smtp-user");
        transport.Password.Should().Be("smtp-password");
        transport.DisconnectQuit.Should().BeTrue();

        transport.SentMessage.Should().NotBeNull();
        var message = transport.SentMessage!;
        message.MessageId.Should().NotBeNullOrWhiteSpace();
        result.ProviderMessageId.Should().Be(message.MessageId);
        message.Subject.Should().Be("Action Needed: Your Vacation Accrual is at 100% of Maximum");
        message.From.Mailboxes.Should().ContainSingle()
            .Which.Should().Match<MailboxAddress>(address =>
                address.Name == "Walter Notifications" &&
                address.Address == "walter@example.edu");
        message.To.Mailboxes.Should().ContainSingle()
            .Which.Should().Match<MailboxAddress>(address =>
                address.Name == "Person Example" &&
                address.Address == "person@example.edu");
        message.ReplyTo.Mailboxes.Should().ContainSingle()
            .Which.Should().Match<MailboxAddress>(address =>
                address.Name == "Walter Support" &&
                address.Address == "help@example.edu");
        message.TextBody.Should().Be("Plain text body");
        message.HtmlBody.Should().Be("<p>HTML body</p>");
    }

    [Fact]
    public async Task SendAsync_skips_authentication_when_credentials_are_absent()
    {
        var transport = new FakeSmtpEmailTransport();
        var client = new SmtpOutboundEmailClient(
            new SmtpOutboundEmailClientOptions
            {
                Host = "smtp.example.edu",
                Port = 25,
                FromAddress = "walter@example.edu",
                SecureSocketMode = SmtpSecureSocketMode.None,
            },
            () => transport);

        await client.SendAsync(new OutboundEmailMessage
        {
            ToEmail = "person@example.edu",
            Subject = "Subject",
            TextBody = "Text",
            HtmlBody = "<p>HTML</p>",
        });

        transport.AuthenticateCallCount.Should().Be(0);
        transport.SecureSocketOptions.Should().Be(SecureSocketOptions.None);
    }

    [Fact]
    public void Constructor_fails_when_smtp_configuration_is_incomplete()
    {
        var options = new SmtpOutboundEmailClientOptions
        {
            Host = "smtp.example.edu",
            UserName = "smtp-user",
            FromAddress = "not an email address",
        };

        var act = () => new SmtpOutboundEmailClient(
            options,
            () => new FakeSmtpEmailTransport());

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*FromAddress must be a valid email address*UserName and Password must be configured together*");
    }

    [Fact]
    public async Task SendAsync_fails_before_connecting_when_recipient_email_is_invalid()
    {
        var transport = new FakeSmtpEmailTransport();
        var client = new SmtpOutboundEmailClient(
            new SmtpOutboundEmailClientOptions
            {
                Host = "smtp.example.edu",
                FromAddress = "walter@example.edu",
            },
            () => transport);

        var act = () => client.SendAsync(new OutboundEmailMessage
        {
            ToEmail = "not an email address",
            Subject = "Subject",
            TextBody = "Text",
            HtmlBody = "<p>HTML</p>",
        });

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*ToEmail must be a valid email address*");
        transport.ConnectCallCount.Should().Be(0);
    }

    private sealed class FakeSmtpEmailTransport : ISmtpEmailTransport
    {
        public string? Host { get; private set; }
        public int? Port { get; private set; }
        public SecureSocketOptions? SecureSocketOptions { get; private set; }
        public int? TimeoutMilliseconds { get; private set; }
        public string? UserName { get; private set; }
        public string? Password { get; private set; }
        public MimeMessage? SentMessage { get; private set; }
        public string SendResponse { get; init; } = "250 OK";
        public bool? DisconnectQuit { get; private set; }
        public int ConnectCallCount { get; private set; }
        public int AuthenticateCallCount { get; private set; }

        public Task ConnectAsync(
            string host,
            int port,
            SecureSocketOptions secureSocketOptions,
            int timeoutMilliseconds,
            CancellationToken cancellationToken)
        {
            ConnectCallCount++;
            Host = host;
            Port = port;
            SecureSocketOptions = secureSocketOptions;
            TimeoutMilliseconds = timeoutMilliseconds;
            return Task.CompletedTask;
        }

        public Task AuthenticateAsync(
            string userName,
            string password,
            CancellationToken cancellationToken)
        {
            AuthenticateCallCount++;
            UserName = userName;
            Password = password;
            return Task.CompletedTask;
        }

        public Task<string> SendAsync(
            MimeMessage message,
            CancellationToken cancellationToken)
        {
            SentMessage = message;
            return Task.FromResult(SendResponse);
        }

        public Task DisconnectAsync(
            bool quit,
            CancellationToken cancellationToken)
        {
            DisconnectQuit = quit;
            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            return ValueTask.CompletedTask;
        }
    }
}
