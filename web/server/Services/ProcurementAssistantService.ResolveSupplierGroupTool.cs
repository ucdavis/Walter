using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> ResolveSupplierGroupToolAsync(
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

        var hitsBySupplier = new Dictionary<string, ProcurementSupplierSearchHit>(StringComparer.OrdinalIgnoreCase);
        var queries = _queryParser.ExpandSupplierComparisonQueries(candidate);

        foreach (var query in queries)
        {
            var hits = await TrySearchSupplierSummaryAsync(
                new ProcurementSupplierSearchSpec
                {
                    ExpandedQueries = _queryParser.ExpandAliases(query),
                    Filters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                    QueryText = query,
                    Size = _options.DefaultSearchSize,
                },
                "Agent-selected supplier-group resolution independently resolved a comparison candidate.",
                traceCalls,
                cancellationToken);

            if (hits is null)
            {
                continue;
            }

            foreach (var hit in hits)
            {
                hitsBySupplier.TryAdd(hit.SupplierNumber, hit);
            }
        }

        var matchedSuppliers = ProcurementQueryText.MatchSupplierComparisonGroup(candidate, queries, hitsBySupplier.Values)
            .Select(ToResolvedSupplier)
            .OrderByDescending(supplier => supplier.TotalAmount ?? 0m)
            .ThenByDescending(supplier => supplier.LineCount ?? 0)
            .ToArray();
        var candidateSetId = hitsBySupplier.Count == 0
            ? null
            : evidenceCatalog.RegisterCandidateSet(
                "supplier_summary",
                candidate,
                "alias_expanded",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                hitsBySupplier.Values.ToArray());

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidate,
            candidateSetId,
            displayLabel = ProcurementQueryText.FormatComparisonGroupLabel(candidate),
            evidenceState = matchedSuppliers.Length == 0 ? "candidate_matches" : "validated_evidence",
            supplierGroup = matchedSuppliers.Length == 0
                ? null
                : new ProcurementSupplierComparisonGroup(
                    CandidateLabel: candidate,
                    DisplayLabel: ProcurementQueryText.FormatComparisonGroupLabel(candidate),
                    TotalAmount: matchedSuppliers.Sum(supplier => supplier.TotalAmount ?? 0m),
                    TotalLineCount: matchedSuppliers.Sum(supplier => supplier.LineCount ?? 0),
                    Suppliers: matchedSuppliers),
            validationRecommendation = matchedSuppliers.Length == 0
                ? "rerank_or_refine_comparison_candidates_before_answering"
                : "comparison_group_is_ready_for_anchored_aggregation_or_answering",
        });
    }
}
