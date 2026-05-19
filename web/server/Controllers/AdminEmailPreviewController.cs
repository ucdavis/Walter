using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.core.Domain;
using server.core.Services;

namespace Server.Controllers;

[ApiController]
[Route("api/admin/email-preview")]
[Authorize(Roles = Role.Names.Admin)]
public sealed class AdminEmailPreviewController : ControllerBase
{
    private const int MaxPayloadJsonLength = 256 * 1024;

    private readonly IOutboundMessageRenderer _renderer;

    public AdminEmailPreviewController(IOutboundMessageRenderer renderer)
    {
        _renderer = renderer;
    }

    public sealed record EmailPreviewRequest(
        [Required, MaxLength(100)] string NotificationType,
        [Required, MaxLength(200)] string TemplateKey,
        [Range(1, int.MaxValue)] int TemplateVersion,
        [Range(1, int.MaxValue)] int PayloadVersion,
        [MaxLength(200)] string? RecipientName,
        [Required] string PayloadJson);

    public sealed record EmailPreviewResponse(
        string Subject,
        string TextBody,
        string HtmlBody);

    public sealed record EmailPreviewErrorResponse(string Error);

    [HttpPost("render")]
    public async Task<ActionResult<EmailPreviewResponse>> Render(
        [FromBody] EmailPreviewRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new EmailPreviewErrorResponse("Body is required."));
        }

        if (request.PayloadJson.Length > MaxPayloadJsonLength)
        {
            return BadRequest(new EmailPreviewErrorResponse(
                $"PayloadJson exceeds {MaxPayloadJsonLength:N0} characters."));
        }

        var message = new OutboundMessage
        {
            Channel = OutboundMessage.Channels.Email,
            CreatedUtc = DateTime.UtcNow,
            DedupeKey = $"preview:{Guid.NewGuid():N}",
            Id = 0,
            NotBeforeUtc = DateTime.UtcNow,
            NotificationType = request.NotificationType.Trim(),
            PayloadJson = request.PayloadJson,
            PayloadVersion = request.PayloadVersion,
            RecipientEmail = "preview@example.edu",
            RecipientName = string.IsNullOrWhiteSpace(request.RecipientName)
                ? null
                : request.RecipientName.Trim(),
            RecipientType = "Preview",
            RunId = Guid.NewGuid(),
            Status = OutboundMessage.Statuses.Pending,
            TemplateKey = request.TemplateKey.Trim(),
            TemplateVersion = request.TemplateVersion,
        };

        try
        {
            var rendered = await _renderer.RenderAsync(message, cancellationToken);
            return Ok(new EmailPreviewResponse(
                rendered.Subject,
                rendered.TextBody,
                rendered.HtmlBody));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new EmailPreviewErrorResponse(ex.Message));
        }
    }
}
