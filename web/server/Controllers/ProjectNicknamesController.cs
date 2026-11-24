using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;
using server.core.Services;
using server.Helpers;
using server.Services;
using Server.Services;

namespace Server.Controllers;

// Shared nickname layer for projects and their tasks. The client overlays these on the
// official names; report endpoints never read this table.
[Route("api/project/nicknames")]
public sealed class ProjectNicknamesController : ApiControllerBase
{
    private readonly AppDbContext _ctx;
    private readonly IDatamartService _datamartService;
    private readonly PortfolioAccess _portfolioAccess;
    private readonly PpmPortfolioService _portfolioService;

    public ProjectNicknamesController(
        AppDbContext ctx,
        IDatamartService datamartService,
        IAuthorizationService authorizationService,
        IUserService userService,
        PpmPortfolioService portfolioService)
    {
        _ctx = ctx;
        _datamartService = datamartService;
        _portfolioAccess = new PortfolioAccess(authorizationService, userService, portfolioService);
        _portfolioService = portfolioService;
    }

    // Everyone can read this list, so it leaves out who edited each nickname.
    public sealed record NicknameResponse(string ProjectNumber, string TaskNumber, string Nickname);

    /// <param name="IamId">Owner of the portfolio page the caller is editing from.</param>
    /// <param name="TaskNumber">Blank to nickname the project itself.</param>
    public sealed record UpsertNicknameRequest(
        string? IamId, string? ProjectNumber, string? TaskNumber, string? Nickname);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<NicknameResponse>>> GetAsync(CancellationToken cancellationToken)
    {
        var nicknames = await _ctx.ProjectNicknames
            .AsNoTracking()
            .Select(n => new NicknameResponse(n.ProjectNumber, n.TaskNumber, n.Nickname))
            .ToListAsync(cancellationToken);
        return Ok(nicknames);
    }

    // Upsert by project + task: a non-empty nickname sets it, an empty one reverts to the
    // official name. Last write wins.
    [HttpPut]
    public async Task<IActionResult> UpsertAsync(
        [FromBody] UpsertNicknameRequest request, CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest("Body is required.");
        }

        var projectNumber = (request.ProjectNumber ?? "").Trim().ToUpperInvariant();
        var taskNumber = (request.TaskNumber ?? "").Trim().ToUpperInvariant();
        var nickname = (request.Nickname ?? "").Trim();

        if (projectNumber.Length == 0)
        {
            return BadRequest("Project number is required.");
        }

        if (projectNumber.Length > ProjectNickname.NumberMaxLength || taskNumber.Length > ProjectNickname.NumberMaxLength)
        {
            return BadRequest("Project or task number is too long.");
        }

        if (nickname.Length > ProjectNickname.NicknameMaxLength)
        {
            return BadRequest($"Nickname exceeds {ProjectNickname.NicknameMaxLength} characters.");
        }

        if (!await CallerCanOpenProjectAsync(request.IamId, projectNumber, cancellationToken))
        {
            return Forbid();
        }

        var row = await _ctx.ProjectNicknames.FirstOrDefaultAsync(
            n => n.ProjectNumber == projectNumber && n.TaskNumber == taskNumber, cancellationToken);

        if (nickname.Length == 0)
        {
            if (row is not null)
            {
                _ctx.ProjectNicknames.Remove(row);
                await _ctx.SaveChangesAsync(cancellationToken);
            }
            return NoContent();
        }

        if (row is null)
        {
            row = new ProjectNickname { ProjectNumber = projectNumber, TaskNumber = taskNumber };
            _ctx.ProjectNicknames.Add(row);
        }

        row.Nickname = nickname;
        row.UpdatedBy = User.GetUserIdentifier();
        row.UpdatedAt = DateTime.UtcNow;
        await _ctx.SaveChangesAsync(cancellationToken);

        return Ok(new NicknameResponse(row.ProjectNumber, row.TaskNumber, row.Nickname));
    }

    /// <summary>
    /// True when the caller could open this project's page: financial viewers, or anyone who
    /// can open the portfolio of <paramref name="iamId"/> when the project is in that portfolio.
    /// </summary>
    private async Task<bool> CallerCanOpenProjectAsync(
        string? iamId, string projectNumber, CancellationToken cancellationToken)
    {
        if (await _portfolioAccess.CanViewFinancialsAsync(User))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(iamId))
        {
            return false;
        }

        var owner = await _datamartService.GetSearchablePersonByIamIdAsync(iamId, cancellationToken);
        if (owner is null || !await _portfolioAccess.CanOpenPortfolioAsync(User, owner.EmployeeId, cancellationToken))
        {
            return false;
        }

        var portfolio = await _portfolioService.GetPortfolioProjectsAsync(owner.EmployeeId, cancellationToken);
        return portfolio.ProjectNumbers.Contains(projectNumber, StringComparer.OrdinalIgnoreCase);
    }
}
