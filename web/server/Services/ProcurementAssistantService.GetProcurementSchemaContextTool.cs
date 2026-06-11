namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private Task<ProcurementAgentToolExecutionOutcome> GetProcurementSchemaContextToolAsync(
        string question,
        IList<ProcurementToolCallTrace> traceCalls)
    {
        var payload = ProcurementSchemaContextFactory.BuildToolPayload(
            question,
            _queryParser,
            _options,
            _options.EnableHybridSearch && _options.HasItemGroupIndexConfigured(),
            _options.HasItemGroupIndexConfigured());
        var payloadJson = SerializeToolResult(payload);

        traceCalls.Add(ProcurementTraceFactory.BuildSyntheticToolTrace(
            "get_procurement_schema_context",
            question,
            [],
            "Walter surfaced schema context and planning cues before or during retrieval planning.",
            payloadJson));

        return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(payload));
    }
}
