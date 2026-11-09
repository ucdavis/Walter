using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.Helpers;
using Server.Services;
using Server.Demo;

namespace Server.Controllers;

public class UserController : ApiControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly IGraphService _graphService;
    private readonly DemoRequestContext? _demo;

    public UserController(AppDbContext dbContext, IGraphService graphService, DemoRequestContext? demo = null)
    {
        _dbContext = dbContext;
        _graphService = graphService;
        _demo = demo;
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        // The presentation persona exists only in memory; never provision it through IAM or the user table.
        if (_demo?.PresentationUser is { } presentationUser)
        {
            return Ok(new
            {
                presentationUser.Id,
                Name = presentationUser.DisplayName,
                presentationUser.Email,
                presentationUser.IamId,
                presentationUser.EmployeeId,
                presentationUser.Kerberos,
                Roles = DemoDataSet.GetRoles(_demo.Profile!),
                IsEmulating = false,
                IsPresentation = true,
                PresentationProfile = _demo.Profile,
                CanPresent = true,
            });
        }

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
            IamId = user.IamId,
            EmployeeId = user.EmployeeId,
            Kerberos = user.Kerberos,
            Roles = roles,
            IsEmulating = User.GetEmulatingUser() is not null,
            IsPresentation = false,
            PresentationProfile = (string?)null,
            CanPresent = _demo?.CanStart ?? false,
        };

        return Ok(userInfo);
    }

    [HttpGet("me/photo")]
    public async Task<IActionResult> MePhoto(CancellationToken cancellationToken)
    {
        if (_demo?.HasSession == true) return NotFound();

        try
        {
            var photo = await _graphService.GetMePhotoAsync(User, cancellationToken);

            // cache for 10 minutes even if not found (avoid repeated calls to graph for missing photos)
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
