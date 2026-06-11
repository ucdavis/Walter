using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> SearchSupplierSummaryToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildSupplierSearchSpec(arguments);
        var hits = await TrySearchSupplierSummaryAsync(
            spec,
            "Agent-selected supplier summary search gathered supplier-level candidates or evidence.",
            traceCalls,
            cancellationToken);
        var candidateSetId = hits is null
            ? null
            : evidenceCatalog.RegisterCandidateSet("supplier_summary", spec.QueryText, spec.SearchMode, spec.Filters, hits);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows = hits ?? [],
            validationRecommendation = "rerank_before_using_as_proof",
            table = hits is null ? null : ProcurementResponseFormatter.BuildSupplierTable("Supplier candidates", hits),
        });
    }
}
