using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.Helpers;

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
}
