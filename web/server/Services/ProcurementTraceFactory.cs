namespace Server.Services;

internal static class ProcurementTraceFactory
{
    public static ProcurementToolCallTrace BuildSyntheticToolTrace(
        string toolName,
        string queryText,
        IReadOnlyList<string> filtersApplied,
        string reason,
        string payloadJson,
        IReadOnlyList<string>? topResultIds = null)
    {
        return new ProcurementToolCallTrace
        {
            FiltersApplied = filtersApplied,
            PayloadJson = payloadJson,
            QueryText = queryText,
            Reason = reason,
            ToolName = toolName,
            TopResultIds = topResultIds ?? [],
        };
    }

    public static IReadOnlyList<string> BuildAuditSummary(
        string question,
        string confidence,
        string intent,
        string entityType,
        string? resolvedEntity,
        IList<ProcurementToolCallTrace> traceCalls,
        string finalAnswerSource,
        IReadOnlyList<string> notes)
    {
        var lines = new List<string>
        {
            $"Original query: {question}",
            $"Confidence: {confidence}",
            $"Intent: {intent}",
            $"Entity type: {entityType}",
            $"Resolved entity: {resolvedEntity ?? "unknown"}",
            $"Tools called: {(traceCalls.Count == 0 ? "none" : string.Join(" -> ", traceCalls.Select(call => call.ToolName)))}",
            $"Final answer source: {finalAnswerSource}",
        };

        lines.AddRange(notes.Where(note => !string.IsNullOrWhiteSpace(note)));
        return lines;
    }

    public static ProcurementTracePayload BuildTracePayload(
        string question,
        string intent,
        string entityType,
        string? resolvedEntity,
        IReadOnlyList<string> expansions,
        IReadOnlyList<ProcurementEvidenceAssessmentPayload> evidenceAssessments,
        IList<ProcurementToolCallTrace> traceCalls,
        string finalAnswerSource)
    {
        return new ProcurementTracePayload
        {
            EvidenceAssessments = evidenceAssessments,
            EntityType = entityType,
            FinalAnswerSource = finalAnswerSource,
            InferredIntent = intent,
            OriginalQuery = question,
            QueryExpansions = expansions,
            ResolvedEntity = resolvedEntity,
            ToolCalls = traceCalls.ToArray(),
        };
    }

    public static ProcurementToolCallTrace BuildSuccessfulToolTrace<T>(
        ProcurementGatewayResult<T> result,
        string reason)
    {
        return new ProcurementToolCallTrace
        {
            FiltersApplied = result.FiltersApplied,
            PayloadJson = result.PayloadJson,
            QueryText = result.QueryText,
            Reason = reason,
            ToolName = result.ToolName,
            TopResultIds = result.TopResultIds,
        };
    }

    public static ProcurementToolCallTrace BuildFailedToolTrace(
        string toolName,
        string queryText,
        IReadOnlyList<string> filtersApplied,
        string reason,
        Exception ex)
    {
        return new ProcurementToolCallTrace
        {
            FiltersApplied = filtersApplied,
            PayloadJson = $"Tool failed: {ex.Message}",
            QueryText = queryText,
            Reason = $"{reason} Walter continued with a fallback path because this tool failed.",
            ToolName = toolName,
            TopResultIds = [],
        };
    }
}
