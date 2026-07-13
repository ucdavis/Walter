using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.core.Models;
using server.core.Services;
using server.Helpers;

namespace Server.Controllers;

[Authorize(Policy = AuthorizationHelper.Policies.CanViewDepartmentBalances)]
public sealed class DepartmentBalancesController : ApiControllerBase
{
    private readonly IDatamartService _datamartService;

    public DepartmentBalancesController(IDatamartService datamartService)
    {
        _datamartService = datamartService;
    }

    [HttpPost("query")]
    public async Task<IActionResult> QueryAsync([FromBody] DepartmentBalancesQuery query, CancellationToken cancellationToken)
    {
        if (query is null || query.Dimensions is null || query.Dimensions.Length == 0)
        {
            return BadRequest("At least one group-by dimension is required.");
        }

        var rows = await _datamartService.GetGlBalanceSummaryAsync(
            query, User.GetUserIdentifier(), User.GetEmulatingUser(), cancellationToken);
        return Ok(rows);
    }

    [HttpPost("options")]
    public async Task<IActionResult> OptionsAsync([FromBody] DepartmentBalancesOptionsQuery query, CancellationToken cancellationToken)
    {
        if (query is null || string.IsNullOrWhiteSpace(query.Segment))
        {
            return BadRequest("Segment is required.");
        }

        var options = await _datamartService.GetGlBalanceFilterOptionsAsync(
            query, User.GetUserIdentifier(), User.GetEmulatingUser(), cancellationToken);
        return Ok(options);
    }
}
