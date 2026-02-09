using Microsoft.AspNetCore.Mvc;
using server.Services;

namespace Server.Controllers;

public sealed class AskController : ApiControllerBase
{
    private readonly IAskService _askService;
    private readonly ILogger<AskController> _logger;

    public AskController(IAskService askService, ILogger<AskController> logger)
    {
        _askService = askService;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Ask([FromBody] AskRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return BadRequest(new { error = "Question is required." });

        try
        {
            var response = await _askService.AskAsync(request, User, cancellationToken);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing ask request");
            return StatusCode(500, new { error = "An error occurred while processing your question." });
        }
    }
}
