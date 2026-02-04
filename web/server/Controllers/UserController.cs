using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.Helpers;
using Server.Services;

namespace Server.Controllers;

public class UserController : ApiControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly IGraphService _graphService;

    public UserController(AppDbContext dbContext, IGraphService graphService)
    {
        _dbContext = dbContext;
        _graphService = graphService;
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        Guid userId;
        try
        {
            userId = User.GetUserId();
        }
        catch (InvalidOperationException)
        {
            return Unauthorized();
        }

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.Permissions)
                .ThenInclude(p => p.Role)
            .SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user is null)
        {
            return NotFound();
        }

        var roles = user.Permissions
            .Where(p => p.Role != null)
            .Select(p => p.Role!.Name)
            .Distinct()
            .ToList();

        var userInfo = new
        {
            Id = user.Id,
            Name = user.DisplayName ?? user.Kerberos,
            Email = user.Email,
            EmployeeId = user.EmployeeId,
            Kerberos = user.Kerberos,
            Roles = roles,
        };

        return Ok(userInfo);
    }

    [HttpGet("me/photo")]
    public async Task<IActionResult> MePhoto(CancellationToken cancellationToken)
    {
        try
        {
            var photo = await _graphService.GetMePhotoAsync(User, cancellationToken);
            SetAvatarCacheHeaders(seconds: 10 * 60);

            if (photo is null)
            {
                return NotFound();
            }

            return File(photo.Bytes, photo.ContentType);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            Response.Headers.CacheControl = "no-store";
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    private void SetAvatarCacheHeaders(int seconds)
    {
        Response.Headers.CacheControl = $"private, max-age={seconds}";
    }
}
