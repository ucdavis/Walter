using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Server.Services;
using server.Helpers;

namespace Server.Controllers;

[Authorize(Policy = AuthorizationHelper.Policies.CanViewAccruals)]
public sealed class SpendAnalysisController : ApiControllerBase
{
    private readonly IProcurementAssistantService _procurementAssistantService;

    public SpendAnalysisController(IProcurementAssistantService procurementAssistantService)
    {
        _procurementAssistantService = procurementAssistantService;
    }

    [HttpPost("query")]
    public async Task<ActionResult<ProcurementAssistantResponse>> QueryAsync(
        [FromBody] ProcurementAssistantRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
        {
            return BadRequest(new { message = "question is required." });
        }

        try
        {
            var response = await _procurementAssistantService.AnswerAsync(request, cancellationToken);
            return Ok(response);
        }
        catch (ProcurementAssistantUnavailableException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
        catch (ProcurementAssistantUpstreamException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { message = ex.Message });
        }
    }
}
