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

    [HttpGet("department/{departmentCode}")]
    public async Task<IActionResult> GetDepartmentDetailAsync(
        string departmentCode,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var startDate = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-15);
        var records = await _datamartService.GetEmployeeAccrualBalancesAsync(startDate, ct: cancellationToken);
        var detail = AccrualOverviewCalculator.BuildDepartmentDetail(records, departmentCode);

        if (detail is null)
        {
            return NotFound(new { message = $"Department '{departmentCode}' was not found in the current accrual snapshot." });
        }

        return Ok(detail);
    }

    [HttpGet("assumptions")]
    public Task<IActionResult> GetAssumptionsAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<IActionResult>(Ok(AccrualOverviewCalculator.GetAssumptions()));
    }
}
