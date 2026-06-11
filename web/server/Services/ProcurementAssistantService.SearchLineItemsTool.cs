using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> SearchLineItemsToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildLineSearchSpec(arguments, includeSemanticSearch: false);
        var rows = await TrySearchLineItemsAsync(
            spec,
            "Agent-selected lexical line-item search fetched concrete example rows from the full item index.",
            traceCalls,
            cancellationToken);
        var candidateSetId = rows is null
            ? null
            : evidenceCatalog.RegisterCandidateSet("line_items", spec.QueryText, spec.SearchMode, spec.Filters, rows);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows = rows ?? [],
            validationRecommendation = string.IsNullOrWhiteSpace(spec.QueryText) && spec.Filters.Count > 0
                ? "already_filter_anchored_but_still_review_rows"
                : "rerank_or_refine_before_treating_as_evidence",
            table = rows is null ? null : ProcurementResponseFormatter.BuildLineItemTable("Example items", rows),
        });
    }
}
