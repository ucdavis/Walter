using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using server.core.Services;
using server.Helpers;

namespace Server.Controllers;

[ApiController]
[Route("api/admin/gl-reconciliation-inclusions")]
[Authorize(Policy = AuthorizationHelper.Policies.IsManager)]
public sealed class AdminGLReconciliationInclusionsController : ApiControllerBase
{
    private readonly IGLReconciliationInclusionsService _service;

    public AdminGLReconciliationInclusionsController(IGLReconciliationInclusionsService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> GetInclusions(CancellationToken ct)
    {
        var inclusions = await _service.GetInclusionsAsync(ct);
        return Ok(inclusions);
    }

    public sealed record AddInclusionRequest(string AccountingSequenceNumber, string? Note);

    [HttpPost]
    public async Task<IActionResult> AddInclusion(
        [FromBody] AddInclusionRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request?.AccountingSequenceNumber))
            return BadRequest("AccountingSequenceNumber is required.");

        var createdBy = User.GetUserId().ToString();

        try
        {
            var inclusion = await _service.AddInclusionAsync(
                request.AccountingSequenceNumber, request.Note, createdBy, ct);
            return StatusCode(StatusCodes.Status201Created, inclusion);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpDelete("{asn}")]
    public async Task<IActionResult> RemoveInclusion(string asn, CancellationToken ct)
    {
        var removed = await _service.RemoveInclusionAsync(asn, ct);
        return removed ? NoContent() : NotFound();
    }
}
