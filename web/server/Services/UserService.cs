using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;
using server.Helpers;

namespace Server.Services;

public interface IUserService
{
    Task<List<string>> GetRolesForUser(Guid userId);

    Task<ClaimsPrincipal?> UpdateUserPrincipalIfNeeded(ClaimsPrincipal principal);

    Task<User> CreateOrUpdateUserAsync(UserProfileData userInfo, CancellationToken cancellationToken = default);

    Task<User?> GetByIdAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<User?> GetByEmployeeIdAsync(string employeeId, CancellationToken cancellationToken = default);

    Task<bool> AddRoleToUserAsync(
        Guid userId,
        string roleName,
        Guid grantedByUserId,
        CancellationToken cancellationToken = default);
}

public class UserService : IUserService
{
    private readonly ILogger<UserService> _logger;
    private readonly AppDbContext _dbContext;

    public UserService(ILogger<UserService> logger, AppDbContext dbContext)
    {
        _logger = logger;
        _dbContext = dbContext;
    }

    public async Task<List<string>> GetRolesForUser(Guid userId)
    {
        return await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .SelectMany(u => u.Permissions)
            .Where(p => p.Role != null)
            .Select(p => p.Role!.Name)
            .Distinct()
            .ToListAsync();
    }

    public async Task<ClaimsPrincipal?> UpdateUserPrincipalIfNeeded(ClaimsPrincipal principal)
    {
        // Here you could check if the user's roles or other claims have changed
        // and if so, create a new ClaimsPrincipal with updated claims.
        var userId = principal.GetUserId();

        // get user's roles
        // might want to cache w/ IMemoryCache to avoid DB hits on every request, but we'll skip that for simplicity
        var currentRoles = await GetRolesForUser(userId);

        // compare roles to existing claims, only update if different
        var cookieRoles = principal.FindAll(ClaimTypes.Role).Select(c => c.Value).ToList();
        var changed = currentRoles.Count != cookieRoles.Count ||
                      currentRoles.Except(cookieRoles).Any();

        if (!changed) { return null; } // no change

        // create new identity with updated roles
        var newId = new ClaimsIdentity(principal.Claims, authenticationType: principal.Identity?.AuthenticationType);

        // remove old role claims
        foreach (var roleClaim in newId.FindAll(ClaimTypes.Role).ToList())
        {
            newId.RemoveClaim(roleClaim);
        }

        // add new role claims
        foreach (var role in currentRoles)
        {
            newId.AddClaim(new Claim(ClaimTypes.Role, role));
        }

        // create new principal and return it
        return new ClaimsPrincipal(newId);
    }

    public async Task<User> CreateOrUpdateUserAsync(UserProfileData userInfo, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(userInfo);

        if (userInfo.UserId == Guid.Empty)
        {
            throw new ArgumentException("User ID is required.", nameof(userInfo));
        }

        if (string.IsNullOrWhiteSpace(userInfo.Kerberos))
        {
            throw new ArgumentException("Kerberos ID is required.", nameof(userInfo));
        }

        if (string.IsNullOrWhiteSpace(userInfo.IamId))
        {
            throw new ArgumentException("IAM ID is required.", nameof(userInfo));
        }

        if (string.IsNullOrWhiteSpace(userInfo.EmployeeId))
        {
            throw new ArgumentException("Employee ID is required.", nameof(userInfo));
        }

        var user = await _dbContext.Users
            .SingleOrDefaultAsync(u => u.Id == userInfo.UserId, cancellationToken);

        if (user == null)
        {
            user = new User { Id = userInfo.UserId };
            await _dbContext.Users.AddAsync(user, cancellationToken);
        }

        user.Kerberos = userInfo.Kerberos;
        user.IamId = userInfo.IamId;
        user.EmployeeId = userInfo.EmployeeId;
        user.DisplayName = userInfo.DisplayName;
        user.Email = userInfo.Email;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return user;
    }

    public async Task<bool> AddRoleToUserAsync(
        Guid userId,
        string roleName,
        Guid grantedByUserId,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("User ID is required.", nameof(userId));
        }

        if (grantedByUserId == Guid.Empty)
        {
            throw new ArgumentException("Granted-by user ID is required.", nameof(grantedByUserId));
        }

        if (string.IsNullOrWhiteSpace(roleName))
        {
            throw new ArgumentException("Role name is required.", nameof(roleName));
        }

        var userExists = await _dbContext.Users.AnyAsync(u => u.Id == userId, cancellationToken);
        if (!userExists)
        {
            throw new InvalidOperationException($"User '{userId}' not found.");
        }

        var role = await _dbContext.Roles.SingleOrDefaultAsync(r => r.Name == roleName, cancellationToken);
        if (role is null)
        {
            throw new InvalidOperationException($"Role '{roleName}' not found.");
        }

        var alreadyHasRole = await _dbContext.Permissions.AnyAsync(p =>
            p.UserId == userId &&
            p.RoleId == role.Id &&
            p.DeptCode == null, cancellationToken);

        if (alreadyHasRole)
        {
            return false;
        }

        _dbContext.Permissions.Add(new Permission
        {
            UserId = userId,
            RoleId = role.Id,
            DeptCode = null,
            IncludeDescendants = true,
            GrantedByUserId = grantedByUserId,
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public Task<User?> GetByIdAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        return _dbContext.Users.SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);
    }

    public Task<User?> GetByEmployeeIdAsync(string employeeId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(employeeId))
        {
            throw new ArgumentException("Employee ID is required.", nameof(employeeId));
        }

        return _dbContext.Users.SingleOrDefaultAsync(u => u.EmployeeId == employeeId, cancellationToken);
    }
}

public sealed record UserProfileData
{
    public Guid UserId { get; init; }
    public required string Kerberos { get; init; }
    public required string IamId { get; init; }
    public required string EmployeeId { get; init; }
    public string? DisplayName { get; init; }
    public string? Email { get; init; }
}
