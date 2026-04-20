using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Helpers;
using server.Services;

namespace Server.Controllers;

[Authorize(Policy = AuthorizationHelper.Policies.CanViewAccruals)]
public sealed class AccrualController : ApiControllerBase
{
    private readonly IDatamartService _datamartService;

    public AccrualController(IDatamartService datamartService)
    {
        _datamartService = datamartService;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverviewAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var startDate = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-15);
        var records = await _datamartService.GetEmployeeAccrualBalancesAsync(startDate, ct: cancellationToken);
        var overview = AccrualOverviewCalculator.Build(records);

        return Ok(overview);
    }
}
