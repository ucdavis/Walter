using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Server.Controllers;
using server.core.Domain;
using server.core.Services;

namespace server.tests.Controllers;

public sealed class AdminEmailPreviewControllerTests
{
    [Fact]
    public async Task Render_builds_unsaved_outbound_message_and_returns_preview()
    {
        var renderer = new CapturingRenderer(new RenderedOutboundMessage(
            "Action Needed: Your Vacation Accrual is at 100% of Maximum",
            "Plain text body",
            "<html><body>Email</body></html>"));
        var controller = new AdminEmailPreviewController(renderer);

        var result = await controller.Render(
            new AdminEmailPreviewController.EmailPreviewRequest(
                "accrual.employee",
                "accrual.employee.staff.v1",
                1,
                1,
                "Staff Member",
                """{"pctOfCap":100}"""),
            CancellationToken.None);

        var payload = result.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<AdminEmailPreviewController.EmailPreviewResponse>().Which;

        payload.Subject.Should().Be("Action Needed: Your Vacation Accrual is at 100% of Maximum");
        payload.TextBody.Should().Be("Plain text body");
        payload.HtmlBody.Should().Be("<html><body>Email</body></html>");

        renderer.Message.Should().NotBeNull();
        renderer.Message!.Id.Should().Be(0);
        renderer.Message.NotificationType.Should().Be("accrual.employee");
        renderer.Message.TemplateKey.Should().Be("accrual.employee.staff.v1");
        renderer.Message.TemplateVersion.Should().Be(1);
        renderer.Message.PayloadVersion.Should().Be(1);
        renderer.Message.RecipientName.Should().Be("Staff Member");
        renderer.Message.RecipientEmail.Should().Be("preview@example.edu");
        renderer.Message.RecipientType.Should().Be("Preview");
        renderer.Message.Channel.Should().Be(OutboundMessage.Channels.Email);
        renderer.Message.Status.Should().Be(OutboundMessage.Statuses.Pending);
        renderer.Message.PayloadJson.Should().Be("""{"pctOfCap":100}""");
    }

    [Fact]
    public async Task Render_returns_bad_request_when_renderer_rejects_input()
    {
        var controller = new AdminEmailPreviewController(new ThrowingRenderer());

        var result = await controller.Render(
            new AdminEmailPreviewController.EmailPreviewRequest(
                "accrual.employee",
                "unknown.template",
                1,
                1,
                null,
                "{}"),
            CancellationToken.None);

        var payload = result.Result.Should().BeOfType<BadRequestObjectResult>().Which.Value
            .Should().BeOfType<AdminEmailPreviewController.EmailPreviewErrorResponse>().Which;

        payload.Error.Should().Be("Unsupported outbound message template key 'unknown.template'.");
    }

    private sealed class CapturingRenderer : IOutboundMessageRenderer
    {
        private readonly RenderedOutboundMessage _response;

        public CapturingRenderer(RenderedOutboundMessage response)
        {
            _response = response;
        }

        public OutboundMessage? Message { get; private set; }

        public Task<RenderedOutboundMessage> RenderAsync(
            OutboundMessage message,
            CancellationToken cancellationToken = default)
        {
            Message = message;
            return Task.FromResult(_response);
        }
    }

    private sealed class ThrowingRenderer : IOutboundMessageRenderer
    {
        public Task<RenderedOutboundMessage> RenderAsync(
            OutboundMessage message,
            CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException(
                $"Unsupported outbound message template key '{message.TemplateKey}'.");
        }
    }
}
