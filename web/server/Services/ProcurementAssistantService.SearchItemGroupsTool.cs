using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> SearchItemGroupsToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildItemGroupSearchSpec(arguments);
        var rows = await TrySearchItemGroupsAsync(
            spec,
            "Agent-selected rollup search pulled grouped non-supplier evidence from the item-group index.",
            traceCalls,
            cancellationToken);
        var candidateSetId = rows is null
            ? null
            : evidenceCatalog.RegisterCandidateSet("item_groups", spec.QueryText, spec.SearchMode, spec.Filters, rows);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows = rows ?? [],
            validationRecommendation = "rollup_results_anchor_non_supplier_analysis_but_still_need_reranking_when_broad",
            table = rows is null ? null : ProcurementResponseFormatter.BuildItemGroupTable("Rollup matches", rows),
        });
    }
}
