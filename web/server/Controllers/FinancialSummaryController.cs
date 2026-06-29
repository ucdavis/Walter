using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.core.Models;
using server.core.Services;
using server.Helpers;

namespace Server.Controllers;

[Authorize(Policy = AuthorizationHelper.Policies.CanViewFinancialSummary)]
public sealed class FinancialSummaryController : ApiControllerBase
{
    private readonly IDatamartService _datamartService;

    public FinancialSummaryController(IDatamartService datamartService)
    {
        _datamartService = datamartService;
    }

    [HttpPost("query")]
    public async Task<IActionResult> QueryAsync([FromBody] FinancialSummaryQuery query, CancellationToken cancellationToken)
    {
        if (query is null || query.Dimensions is null || query.Dimensions.Length == 0)
        {
            return BadRequest("At least one group-by dimension is required.");
        }

        var rows = await _datamartService.GetGlSegmentSummaryAsync(
            query, User.GetUserIdentifier(), User.GetEmulatingUser(), cancellationToken);
        return Ok(rows);
    }

    [HttpPost("options")]
    public async Task<IActionResult> OptionsAsync([FromBody] FinancialSummaryOptionsQuery query, CancellationToken cancellationToken)
    {
        if (query is null || string.IsNullOrWhiteSpace(query.Segment))
        {
            return BadRequest("Segment is required.");
        }

        var options = await _datamartService.GetGlSegmentFilterOptionsAsync(
            query, User.GetUserIdentifier(), User.GetEmulatingUser(), cancellationToken);
        return Ok(options);
    }
}
