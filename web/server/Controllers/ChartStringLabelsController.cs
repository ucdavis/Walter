using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;
using server.Helpers;

namespace Server.Controllers;

// Shared chart-string label layer: user-authored explanations of segment combinations,
// keyed exactly (empty string = segment not in key). Department balances is the first
// consumer; the layer is report-agnostic so future chart-string reports can reuse it.
// When a second consumer arrives, introduce a broader policy than CanViewDepartmentBalances.
[Authorize(Policy = AuthorizationHelper.Policies.CanViewDepartmentBalances)]
public sealed class ChartStringLabelsController : ApiControllerBase
{
    private readonly AppDbContext _ctx;

    public ChartStringLabelsController(AppDbContext ctx)
    {
        _ctx = ctx;
    }

    public sealed record LabelResponse(
        string Dept, string Fund, string Account, string Purpose, string Project, string Activity,
        string Text, string? UpdatedBy, DateTime UpdatedAt);

    public sealed record UpsertLabelRequest(
        string? Dept, string? Fund, string? Account, string? Purpose, string? Project, string? Activity,
        string? Text);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LabelResponse>>> GetAsync(CancellationToken cancellationToken)
    {
        var labels = await _ctx.ChartStringLabels
            .AsNoTracking()
            .Select(l => new LabelResponse(
                l.Dept, l.Fund, l.Account, l.Purpose, l.Project, l.Activity, l.Text, l.UpdatedBy, l.UpdatedAt))
            .ToListAsync(cancellationToken);
        return Ok(labels);
    }

    // Upsert by segment key: non-empty text creates or updates the label for that exact
    // combination; empty text deletes it. Last write wins.
    [HttpPut]
    public async Task<IActionResult> UpsertAsync([FromBody] UpsertLabelRequest request, CancellationToken cancellationToken)
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
        if (text.Length > ChartStringLabel.TextMaxLength)
        {
            return BadRequest($"Label exceeds {ChartStringLabel.TextMaxLength} characters.");
        }

        var label = await _ctx.ChartStringLabels.FirstOrDefaultAsync(
            l => l.Dept == dept && l.Fund == fund && l.Account == account
                 && l.Purpose == purpose && l.Project == project && l.Activity == activity,
            cancellationToken);

        if (text.Length == 0)
        {
            if (label is not null)
            {
                _ctx.ChartStringLabels.Remove(label);
                try
                {
                    await _ctx.SaveChangesAsync(cancellationToken);
                }
                catch (DbUpdateConcurrencyException)
                {
                    // Already deleted by a concurrent request; the outcome the caller wanted.
                }
            }
            return NoContent();
        }

        if (label is null)
        {
            label = new ChartStringLabel
            {
                Dept = dept,
                Fund = fund,
                Account = account,
                Purpose = purpose,
                Project = project,
                Activity = activity,
            };
            _ctx.ChartStringLabels.Add(label);
        }

        label.Text = text;
        label.UpdatedBy = User.GetUserIdentifier();
        label.UpdatedAt = DateTime.UtcNow;
        try
        {
            await _ctx.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException) when (_ctx.Entry(label).State == EntityState.Added)
        {
            // A concurrent request inserted the same key first (unique index). Last write
            // wins: re-read the winner's row and apply this request's text to it.
            _ctx.Entry(label).State = EntityState.Detached;
            var existing = await _ctx.ChartStringLabels.FirstOrDefaultAsync(
                l => l.Dept == dept && l.Fund == fund && l.Account == account
                     && l.Purpose == purpose && l.Project == project && l.Activity == activity,
                cancellationToken);
            if (existing is null)
            {
                throw;
            }
            existing.Text = text;
            existing.UpdatedBy = User.GetUserIdentifier();
            existing.UpdatedAt = DateTime.UtcNow;
            await _ctx.SaveChangesAsync(cancellationToken);
            label = existing;
        }

        return Ok(new LabelResponse(
            label.Dept, label.Fund, label.Account, label.Purpose, label.Project, label.Activity,
            label.Text, label.UpdatedBy, label.UpdatedAt));
    }
}
