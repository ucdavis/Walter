using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> ResolveSupplierCandidateToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var candidate = ProcurementSearchSpecFactory.ReadRequiredString(arguments, "candidate");
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = "candidate is required.",
            });
        }

        var hits = await TrySearchSupplierSummaryAsync(
            new ProcurementSupplierSearchSpec
            {
                ExpandedQueries = _queryParser.ExpandAliases(candidate),
                Filters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                QueryText = candidate,
                Size = _options.DefaultSearchSize,
            },
            "Agent-selected supplier resolution mapped the question onto supplier summary records.",
            traceCalls,
            cancellationToken);

        var resolved = hits is null
            ? null
            : ProcurementQueryText.ResolveSupplierCandidate(candidate, hits);
        var candidateSetId = hits is null
            ? null
            : evidenceCatalog.RegisterCandidateSet(
                "supplier_summary",
                candidate,
                "alias_expanded",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                hits);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidate,
            candidates = hits ?? [],
            candidateSetId,
            confidence = resolved is null ? "low" : "high",
            evidenceState = resolved is null ? "candidate_matches" : "validated_evidence",
            resolvedSupplier = resolved is null ? null : ToResolvedSupplier(resolved),
            validationRecommendation = resolved is null ? "rerank_or_refine_supplier_identity" : "supplier_identity_is_anchored",
        });
    }
}
