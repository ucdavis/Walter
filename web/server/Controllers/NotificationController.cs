using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;

namespace Server.Controllers;

[ApiController]
[Route("api/notification")]
public sealed class NotificationController : ControllerBase
{
    private const int MessageMaxLength = 2000;

    private readonly AppDbContext _ctx;

    public NotificationController(AppDbContext ctx)
    {
        _ctx = ctx;
    }

    public sealed record NotificationResponse(bool Enabled, string Message, DateTime? UpdatedOn);
    public sealed record UpdateNotificationRequest(bool Enabled, string Message);

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<NotificationResponse>> Get(CancellationToken ct)
    {
        var n = await _ctx.Notifications
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == Notification.SingletonId, ct);

        if (n is null)
        {
            return Ok(new NotificationResponse(false, "", null));
        }

        return Ok(new NotificationResponse(n.Enabled, n.Message, n.UpdatedOn));
    }

    [HttpPut]
    [Authorize(Roles = Role.Names.Admin)]
    public async Task<ActionResult<NotificationResponse>> Update(
        [FromBody] UpdateNotificationRequest request,
        CancellationToken ct)
    {
        if (request is null)
        {
            return BadRequest("Body is required.");
        }

        var message = request.Message ?? "";
        if (message.Length > MessageMaxLength)
        {
            return BadRequest($"Message exceeds {MessageMaxLength} characters.");
        }

        var n = await _ctx.Notifications.FirstOrDefaultAsync(
            x => x.Id == Notification.SingletonId, ct);

        if (n is null)
        {
            n = new Notification { Id = Notification.SingletonId };
            _ctx.Notifications.Add(n);
        }

        n.Enabled = request.Enabled;
        n.Message = message;
        n.UpdatedOn = DateTime.UtcNow;
        n.UpdatedBy = User.Identity?.Name;

        await _ctx.SaveChangesAsync(ct);

        return Ok(new NotificationResponse(n.Enabled, n.Message, n.UpdatedOn));
    }
}
