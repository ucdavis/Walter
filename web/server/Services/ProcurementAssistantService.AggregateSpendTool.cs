using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> AggregateSpendToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        IList<ProcurementAggregateArtifact> aggregateArtifacts,
        CancellationToken cancellationToken)
    {
        var request = _searchSpecFactory.BuildAggregationRequest(arguments);
        var validationId = ProcurementSearchSpecFactory.ReadOptionalString(arguments, "assessmentId") ??
                           ProcurementSearchSpecFactory.ReadOptionalString(arguments, "validationId");
        ProcurementEvidenceAssessmentPayload? assessment = null;
        if (!string.IsNullOrWhiteSpace(validationId))
        {
            if (!evidenceCatalog.TryGetAssessment(validationId, out assessment))
            {
                return ProcurementAgentToolExecutionOutcome.ToolResult(new
                {
                    error = $"Unknown validationId `{validationId}`.",
                });
            }

            var suggestedFiltersForAggregation = SelectSuggestedFiltersForAggregation(request, assessment.SuggestedFilters);
            if (request.Filters.Count == 0 && suggestedFiltersForAggregation.Count > 0)
            {
                request = new ProcurementAggregationRequest
                {
                    BucketType = request.BucketType,
                    EnableFuzzyMatching = request.EnableFuzzyMatching,
                    ExpandedQueries = request.ExpandedQueries,
                    Filters = NormalizeValidationFilters(suggestedFiltersForAggregation),
                    IncludeCategoryFields = request.IncludeCategoryFields,
                    IncludeSupplierFields = request.IncludeSupplierFields,
                    QueryText = request.QueryText,
                    SearchMode = request.SearchMode,
                    Size = request.Size,
                };
            }
        }

        var result = await TryAggregateSpendAsync(
            request,
            BuildAggregationReason(request, assessment),
            traceCalls,
            cancellationToken);

        var defaultChart = result is null || result.Buckets.Count == 0
            ? null
            : ProcurementResponseFormatter.BuildAggregateChart(
                ProcurementResponseFormatter.GetDefaultChartKind(request.BucketType),
                ProcurementResponseFormatter.BuildAggregateTitle(request.BucketType),
                result.Buckets);
        var table = result is null
            ? null
            : ProcurementResponseFormatter.BuildAggregateTable(
                ProcurementResponseFormatter.BuildAggregateTitle(request.BucketType),
                result.Buckets);

        if (result is not null)
        {
            aggregateArtifacts.Add(new ProcurementAggregateArtifact(
                request.BucketType,
                defaultChart,
                table,
                assessment is not null,
                assessment?.Confidence ?? InferAggregateConfidence(request),
                assessment?.EvidenceState ?? "exploratory_findings"));
        }

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            anchoredValidation = assessment is null
                ? null
                : new
                {
                    assessment.AssessmentId,
                    assessment.Confidence,
                    assessment.EvidenceState,
                    assessment.SuggestedFilters,
                    assessment.Summary,
                },
            confidence = assessment?.Confidence ?? InferAggregateConfidence(request),
            evidenceState = assessment is null ? "exploratory_findings" : assessment.EvidenceState,
            request.BucketType,
            defaultChart,
            queryText = request.QueryText,
            result,
            table,
            validationRecommendation = assessment is null && !string.IsNullOrWhiteSpace(request.QueryText)
                ? "rerank_or_confirm_evidence_before_treating_broad_aggregate_as_proof"
                : null,
        });
    }

    /// <summary>
    /// Prevent supplier-ranking aggregates from becoming self-fulfilling by auto-filtering to one top supplier.
    /// A single supplier filter is appropriate for drill-downs, but not for "where do we buy X" style rankings.
    /// </summary>
    private static IReadOnlyDictionary<string, string> SelectSuggestedFiltersForAggregation(
        ProcurementAggregationRequest request,
        IReadOnlyDictionary<string, string> suggestedFilters)
    {
        if (suggestedFilters.Count == 0)
        {
            return suggestedFilters;
        }

        if (!string.Equals(request.BucketType, "supplier", StringComparison.OrdinalIgnoreCase))
        {
            return suggestedFilters;
        }

        var filtered = suggestedFilters
            .Where(kvp =>
                !string.Equals(kvp.Key, "supplierNumber", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(kvp.Key, "supplier_number", StringComparison.OrdinalIgnoreCase))
            .ToDictionary(kvp => kvp.Key, kvp => kvp.Value, StringComparer.OrdinalIgnoreCase);

        return filtered;
    }
}
