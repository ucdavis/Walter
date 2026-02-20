using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using Microsoft.Kiota.Abstractions;
using server.Helpers;
using Server.Services;

namespace Server.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Policy = AuthorizationHelper.Policies.IsManager)]
public sealed class AdminUsersController : ControllerBase
{
    private readonly IGraphService _graphService;
    private readonly ILogger<AdminUsersController> _logger;

    public AdminUsersController(IGraphService graphService, ILogger<AdminUsersController> logger)
    {
        _graphService = graphService;
        _logger = logger;
    }

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<GraphUserSearchResult>>> SearchUsers(
        [FromQuery] string? query,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 3)
        {
            return Ok(Array.Empty<GraphUserSearchResult>());
        }

        try
        {
            var results = await _graphService.SearchUsersAsync(User, query, cancellationToken);
            return Ok(results);
        }
        catch (MicrosoftIdentityWebChallengeUserException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for user search.");
            return Unauthorized();
        }
        catch (MsalUiRequiredException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for user search.");
            return Unauthorized();
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Microsoft Graph user search failed.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unexpected error searching Microsoft Graph users.");
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }
}

