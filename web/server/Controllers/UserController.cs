using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using server.core.Data;

namespace Server.Controllers;

public class UserController : ApiControllerBase
{
    private readonly AppDbContext _dbContext;

    public UserController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var userId = User.FindFirst(ClaimConstants.ObjectId)?.Value;

        if (!Guid.TryParse(userId, out var parsedUserId))
        {
            return Unauthorized();
        }

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.Permissions)
                .ThenInclude(p => p.Role)
            .SingleOrDefaultAsync(u => u.Id == parsedUserId, cancellationToken);

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
}
