using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> HybridSearchItemGroupsToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildItemGroupSearchSpec(arguments);
        var embedding = await TryCreateEmbeddingAsync(spec.QueryText, cancellationToken);
        var rows = await SearchHybridItemGroupsWithFallbackAsync(spec, embedding, traceCalls, cancellationToken);
        var candidateSetId = evidenceCatalog.RegisterCandidateSet(
            "hybrid_item_groups",
            spec.QueryText,
            spec.SearchMode,
            spec.Filters,
            rows);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows,
            validationRecommendation = "semantic_rollup_matches_should_be_reranked_before_proof",
            table = ProcurementResponseFormatter.BuildHybridItemGroupTable("Rollup matches", rows),
        });
    }
}
