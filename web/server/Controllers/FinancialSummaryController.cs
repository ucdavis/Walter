using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using server.Helpers;

namespace Server.Controllers;

[Authorize(Policy = AuthorizationHelper.Policies.CanViewFinancialSummary)]
public sealed class FinancialSummaryController : ApiControllerBase
{
    private readonly IDatamartService _datamartService;
    private readonly AppDbContext _ctx;

    public FinancialSummaryController(IDatamartService datamartService, AppDbContext ctx)
    {
        _datamartService = datamartService;
        _ctx = ctx;
    }

    [HttpPost("query")]
    public async Task<IActionResult> QueryAsync([FromBody] FinancialSummaryQuery query, CancellationToken cancellationToken)
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
    public async Task<IActionResult> OptionsAsync([FromBody] FinancialSummaryOptionsQuery query, CancellationToken cancellationToken)
    {
        if (query is null || string.IsNullOrWhiteSpace(query.Segment))
        {
            return BadRequest("Segment is required.");
        }

        var options = await _datamartService.GetGlBalanceFilterOptionsAsync(
            query, User.GetUserIdentifier(), User.GetEmulatingUser(), cancellationToken);
        return Ok(options);
    }

    public sealed record LabelResponse(
        string Dept, string Fund, string Account, string Purpose, string Project, string Activity,
        string Text, string? UpdatedBy, DateTime UpdatedAt);

    public sealed record UpsertLabelRequest(
        string? Dept, string? Fund, string? Account, string? Purpose, string? Project, string? Activity,
        string? Text);

    [HttpGet("labels")]
    public async Task<ActionResult<IReadOnlyList<LabelResponse>>> GetLabelsAsync(CancellationToken cancellationToken)
    {
        var labels = await _ctx.FinancialSummaryLabels
            .AsNoTracking()
            .Select(l => new LabelResponse(
                l.Dept, l.Fund, l.Account, l.Purpose, l.Project, l.Activity, l.Text, l.UpdatedBy, l.UpdatedAt))
            .ToListAsync(cancellationToken);
        return Ok(labels);
    }

    // Upsert by segment key: non-empty text creates or updates the label for that exact
    // combination; empty text deletes it. Last write wins.
    [HttpPut("labels")]
    public async Task<IActionResult> UpsertLabelAsync([FromBody] UpsertLabelRequest request, CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest("Body is required.");
        }

        var dept = (request.Dept ?? "").Trim();
        var fund = (request.Fund ?? "").Trim();
        var account = (request.Account ?? "").Trim();
        var purpose = (request.Purpose ?? "").Trim();
        var project = (request.Project ?? "").Trim();
        var activity = (request.Activity ?? "").Trim();

        if (new[] { dept, fund, account, purpose, project, activity }.All(s => s.Length == 0))
        {
            return BadRequest("At least one segment is required.");
        }

        var text = (request.Text ?? "").Trim();
        if (text.Length > FinancialSummaryLabel.TextMaxLength)
        {
            return BadRequest($"Label exceeds {FinancialSummaryLabel.TextMaxLength} characters.");
        }

        var label = await _ctx.FinancialSummaryLabels.FirstOrDefaultAsync(
            l => l.Dept == dept && l.Fund == fund && l.Account == account
                 && l.Purpose == purpose && l.Project == project && l.Activity == activity,
            cancellationToken);

        if (text.Length == 0)
        {
            if (label is not null)
            {
                _ctx.FinancialSummaryLabels.Remove(label);
                await _ctx.SaveChangesAsync(cancellationToken);
            }
            return NoContent();
        }

        if (label is null)
        {
            label = new FinancialSummaryLabel
            {
                Dept = dept,
                Fund = fund,
                Account = account,
                Purpose = purpose,
                Project = project,
                Activity = activity,
            };
            _ctx.FinancialSummaryLabels.Add(label);
        }

        label.Text = text;
        label.UpdatedBy = User.GetUserIdentifier();
        label.UpdatedAt = DateTime.UtcNow;
        await _ctx.SaveChangesAsync(cancellationToken);

        return Ok(new LabelResponse(
            label.Dept, label.Fund, label.Account, label.Purpose, label.Project, label.Activity,
            label.Text, label.UpdatedBy, label.UpdatedAt));
    }
}
