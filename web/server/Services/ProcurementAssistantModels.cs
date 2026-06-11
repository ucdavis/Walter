using System.Text.Json;
using System.Text.Json.Serialization;

namespace Server.Services;

public sealed record ProcurementAssistantRequest(
    [property: JsonPropertyName("question")] string Question,
    [property: JsonPropertyName("includeTrace")] bool IncludeTrace = true);

public sealed class ProcurementAssistantResponse
{
    [JsonPropertyName("answerText")]
    public string AnswerText { get; init; } = string.Empty;

    [JsonPropertyName("auditSummary")]
    public IReadOnlyList<string> AuditSummary { get; init; } = [];

    [JsonPropertyName("charts")]
    public IReadOnlyList<ProcurementChartPayload> Charts { get; init; } = [];

    [JsonPropertyName("confidence")]
    public string Confidence { get; init; } = "unknown";

    [JsonPropertyName("confirmedFindings")]
    public IReadOnlyList<string> ConfirmedFindings { get; init; } = [];

    [JsonPropertyName("entity")]
    public ProcurementResolvedEntity? Entity { get; init; }

    [JsonPropertyName("exploratoryFindings")]
    public IReadOnlyList<string> ExploratoryFindings { get; init; } = [];

    [JsonPropertyName("intent")]
    public string Intent { get; init; } = "unknown";

    [JsonPropertyName("isConfigured")]
    public bool IsConfigured { get; init; }

    [JsonPropertyName("question")]
    public string Question { get; init; } = string.Empty;

    [JsonPropertyName("summaryCards")]
    public IReadOnlyList<ProcurementSummaryCard> SummaryCards { get; init; } = [];

    [JsonPropertyName("supportingFindings")]
    public IReadOnlyList<string> SupportingFindings { get; init; } = [];

    [JsonPropertyName("supportingTable")]
    public ProcurementTablePayload? SupportingTable { get; init; }

    [JsonPropertyName("trace")]
    public ProcurementTracePayload? Trace { get; init; }
}

internal sealed record ProcurementAgentCompletionRequest(
    string Model,
    IReadOnlyList<ProcurementAgentMessage> Messages,
    IReadOnlyList<ProcurementAgentToolDefinition> Tools,
    string? ReasoningEffort = null,
    string? ResponseFormatName = null,
    object? ResponseFormatJsonSchema = null);

internal sealed class ProcurementAgentCompletionResult
{
    public string? Content { get; init; }

    public IReadOnlyList<ProcurementAgentToolCall> ToolCalls { get; init; } = [];
}

internal sealed class ProcurementAgentMessage
{
    public string Role { get; init; } = string.Empty;

    public string? Content { get; init; }

    public string? ToolCallId { get; init; }

    public string? ToolName { get; init; }

    public IReadOnlyList<ProcurementAgentToolCall> ToolCalls { get; init; } = [];

    public static ProcurementAgentMessage Assistant(
        string? content,
        IReadOnlyList<ProcurementAgentToolCall> toolCalls) =>
        new()
        {
            Content = content,
            Role = "assistant",
            ToolCalls = toolCalls,
        };

    public static ProcurementAgentMessage System(string content) =>
        new()
        {
            Content = content,
            Role = "system",
        };

    public static ProcurementAgentMessage Tool(
        string toolCallId,
        string toolName,
        string content) =>
        new()
        {
            Content = content,
            Role = "tool",
            ToolCallId = toolCallId,
            ToolName = toolName,
        };

    public static ProcurementAgentMessage User(string content) =>
        new()
        {
            Content = content,
            Role = "user",
        };
}

internal sealed record ProcurementAgentToolCall(
    string Id,
    string Name,
    string ArgumentsJson);

internal sealed record ProcurementAgentToolDefinition(
    string Name,
    string Description,
    object ParametersJsonSchema);

internal sealed class ProcurementAgentToolExecutionOutcome
{
    public ProcurementAssistantResponse? FinalResponse { get; init; }

    public string ToolResultJson { get; init; } = "{}";

    public static ProcurementAgentToolExecutionOutcome Final(ProcurementAssistantResponse response) =>
        new()
        {
            FinalResponse = response,
        };

    public static ProcurementAgentToolExecutionOutcome ToolResult(object payload) =>
        new()
        {
            ToolResultJson = JsonSerializer.Serialize(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web)
            {
                WriteIndented = true,
            }),
        };
}

public sealed record ProcurementResolvedEntity(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("value")] string Value,
    [property: JsonPropertyName("supplierNumber")] string? SupplierNumber = null);

public sealed record ProcurementSummaryCard(
    [property: JsonPropertyName("label")] string Label,
    [property: JsonPropertyName("value")] string Value,
    [property: JsonPropertyName("rawValue")] decimal? RawValue = null,
    [property: JsonPropertyName("description")] string? Description = null);

public sealed class ProcurementTablePayload
{
    [JsonPropertyName("columns")]
    public IReadOnlyList<string> Columns { get; init; } = [];

    [JsonPropertyName("rows")]
    public IReadOnlyList<IReadOnlyDictionary<string, string>> Rows { get; init; } = [];

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;
}

public sealed class ProcurementChartPayload
{
    [JsonPropertyName("data")]
    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Data { get; init; } = [];

    [JsonPropertyName("kind")]
    public string Kind { get; init; } = "bar";

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("xKey")]
    public string XKey { get; init; } = "label";

    [JsonPropertyName("yKeys")]
    public IReadOnlyList<string> YKeys { get; init; } = [];
}

public sealed class ProcurementTracePayload
{
    [JsonPropertyName("evidenceAssessments")]
    public IReadOnlyList<ProcurementEvidenceAssessmentPayload> EvidenceAssessments { get; init; } = [];

    [JsonPropertyName("entityType")]
    public string EntityType { get; init; } = string.Empty;

    [JsonPropertyName("finalAnswerSource")]
    public string FinalAnswerSource { get; init; } = string.Empty;

    [JsonPropertyName("inferredIntent")]
    public string InferredIntent { get; init; } = string.Empty;

    [JsonPropertyName("originalQuery")]
    public string OriginalQuery { get; init; } = string.Empty;

    [JsonPropertyName("queryExpansions")]
    public IReadOnlyList<string> QueryExpansions { get; init; } = [];

    [JsonPropertyName("resolvedEntity")]
    public string? ResolvedEntity { get; init; }

    [JsonPropertyName("toolCalls")]
    public IReadOnlyList<ProcurementToolCallTrace> ToolCalls { get; init; } = [];
}

public sealed class ProcurementEvidenceAssessmentPayload
{
    [JsonPropertyName("assessmentId")]
    public string AssessmentId { get; init; } = string.Empty;

    [JsonPropertyName("candidateSetIds")]
    public IReadOnlyList<string> CandidateSetIds { get; init; } = [];

    [JsonPropertyName("confidence")]
    public string Confidence { get; init; } = "low";

    [JsonPropertyName("confirmedEntities")]
    public IReadOnlyList<ProcurementEvidenceEntity> ConfirmedEntities { get; init; } = [];

    [JsonPropertyName("confirmedRows")]
    public IReadOnlyList<ProcurementEvidenceRow> ConfirmedRows { get; init; } = [];

    [JsonPropertyName("evidenceState")]
    public string EvidenceState { get; init; } = "candidate_matches";

    [JsonPropertyName("expectedEntityType")]
    public string ExpectedEntityType { get; init; } = "unknown";

    [JsonPropertyName("exploratoryRows")]
    public IReadOnlyList<ProcurementEvidenceRow> ExploratoryRows { get; init; } = [];

    [JsonPropertyName("focus")]
    public string Focus { get; init; } = string.Empty;

    [JsonPropertyName("signals")]
    public IReadOnlyList<string> Signals { get; init; } = [];

    [JsonPropertyName("suggestedFilters")]
    public IReadOnlyDictionary<string, string> SuggestedFilters { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    [JsonPropertyName("summary")]
    public string Summary { get; init; } = string.Empty;

    [JsonPropertyName("supportingEntities")]
    public IReadOnlyList<ProcurementEvidenceEntity> SupportingEntities { get; init; } = [];

    [JsonPropertyName("supportingRows")]
    public IReadOnlyList<ProcurementEvidenceRow> SupportingRows { get; init; } = [];
}

public sealed record ProcurementEvidenceEntity(
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("value")] string Value,
    [property: JsonPropertyName("confidence")] string Confidence,
    [property: JsonPropertyName("reason")] string Reason,
    [property: JsonPropertyName("id")] string? Id = null);

public sealed class ProcurementEvidenceRow
{
    [JsonPropertyName("categoryName")]
    public string? CategoryName { get; init; }

    [JsonPropertyName("confidence")]
    public string Confidence { get; init; } = "low";

    [JsonPropertyName("itemDescription")]
    public string? ItemDescription { get; init; }

    [JsonPropertyName("lineAmount")]
    public decimal? LineAmount { get; init; }

    [JsonPropertyName("poLineId")]
    public string PoLineId { get; init; } = string.Empty;

    [JsonPropertyName("purchaseOrderDescription")]
    public string? PurchaseOrderDescription { get; init; }

    [JsonPropertyName("reason")]
    public string Reason { get; init; } = string.Empty;

    [JsonPropertyName("score")]
    public double Score { get; init; }

    [JsonPropertyName("supplierName")]
    public string SupplierName { get; init; } = string.Empty;

    [JsonPropertyName("supplierNumber")]
    public string SupplierNumber { get; init; } = string.Empty;
}

public sealed class ProcurementToolCallTrace
{
    [JsonPropertyName("filtersApplied")]
    public IReadOnlyList<string> FiltersApplied { get; init; } = [];

    [JsonPropertyName("payloadJson")]
    public string PayloadJson { get; init; } = string.Empty;

    [JsonPropertyName("queryText")]
    public string QueryText { get; init; } = string.Empty;

    [JsonPropertyName("reason")]
    public string Reason { get; init; } = string.Empty;

    [JsonPropertyName("toolName")]
    public string ToolName { get; init; } = string.Empty;

    [JsonPropertyName("topResultIds")]
    public IReadOnlyList<string> TopResultIds { get; init; } = [];
}

internal sealed class ProcurementRerankResponse
{
    [JsonPropertyName("rankings")]
    public IReadOnlyList<ProcurementRerankRanking> Rankings { get; init; } = [];
}

internal sealed class ProcurementRerankRanking
{
    [JsonPropertyName("candidateNumber")]
    public int CandidateNumber { get; init; }

    [JsonPropertyName("keep")]
    public bool Keep { get; init; }

    [JsonPropertyName("reason")]
    public string Reason { get; init; } = string.Empty;

    [JsonPropertyName("score")]
    public int Score { get; init; }
}

internal sealed record ProcurementRerankCandidate(
    int CandidateNumber,
    string CandidateSetId,
    string CandidateKind,
    string ResultId,
    string SearchMode,
    string SourceQuery,
    string Title,
    string Body,
    string? SupplierNumber,
    string? SupplierName,
    string? CategoryName,
    decimal? Amount,
    double SearchScore,
    object SourceData);

internal sealed record ProcurementResolvedSupplier(
    string SupplierNumber,
    string SupplierName,
    string SupplierNameNorm,
    IReadOnlyList<string> Aliases,
    decimal? TotalAmount,
    int? LineCount,
    IReadOnlyList<string> TopCategories,
    IReadOnlyList<string> TopItemTerms);

internal sealed record ProcurementSupplierComparisonGroup(
    string CandidateLabel,
    string DisplayLabel,
    decimal TotalAmount,
    int TotalLineCount,
    IReadOnlyList<ProcurementResolvedSupplier> Suppliers);

internal sealed record ProcurementSupplierSearchHit(
    string SupplierNumber,
    string SupplierName,
    string SupplierNameNorm,
    IReadOnlyList<string> Aliases,
    decimal? TotalAmount,
    int? LineCount,
    IReadOnlyList<string> TopCategories,
    IReadOnlyList<string> TopItemTerms,
    double Score);

internal sealed record ProcurementItemGroupHit(
    string ItemGroupId,
    string SupplierNumber,
    string SupplierName,
    string? ItemGroupName,
    string? ItemGroupDescription,
    string? CategoryCode,
    string? CategoryName,
    decimal? TotalAmount,
    int? LineCount,
    decimal? AverageAmount,
    decimal? MinimumAmount,
    decimal? MaximumAmount,
    IReadOnlyList<string> SampleLineIds,
    double Score);

internal sealed record ProcurementLineItemHit(
    string PoLineId,
    string? ItemGroupId,
    string? PurchaseOrderDescription,
    string SupplierNumber,
    string SupplierName,
    string? ItemDescription,
    decimal? LineAmount,
    string? CategoryCode,
    string? CategoryName,
    string? PurchaseDate,
    double Score);

internal sealed record ProcurementHybridLineHit(
    ProcurementLineItemHit LineItem,
    double CombinedScore,
    double LexicalScore,
    double SemanticScore);

internal sealed record ProcurementHybridItemGroupHit(
    ProcurementItemGroupHit ItemGroup,
    double CombinedScore,
    double LexicalScore,
    double SemanticScore);

internal sealed record ProcurementAggregationBucket(
    string Key,
    string Label,
    decimal Amount,
    long Count);

internal sealed class ProcurementAggregationResult
{
    public decimal TotalAmount { get; init; }

    public long TotalCount { get; init; }

    public IReadOnlyList<ProcurementAggregationBucket> Buckets { get; init; } = [];
}

internal sealed class ProcurementLineSearchSpec
{
    public bool EnableFuzzyMatching { get; init; } = true;

    public IReadOnlyList<string> ExpandedQueries { get; init; } = [];

    public IReadOnlyDictionary<string, string> Filters { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    public bool IncludeCategoryFields { get; init; } = true;

    public bool IncludeSupplierFields { get; init; } = true;

    public string QueryText { get; init; } = string.Empty;

    public string SearchMode { get; init; } = "alias_expanded";

    public int Size { get; init; }

    public bool SortByAmountDescending { get; init; }
}

internal sealed class ProcurementSupplierSearchSpec
{
    public bool EnableFuzzyMatching { get; init; } = true;

    public IReadOnlyList<string> ExpandedQueries { get; init; } = [];

    public IReadOnlyDictionary<string, string> Filters { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    public string QueryText { get; init; } = string.Empty;

    public string SearchMode { get; init; } = "alias_expanded";

    public int Size { get; init; }
}

internal sealed class ProcurementItemGroupSearchSpec
{
    public bool EnableFuzzyMatching { get; init; } = true;

    public IReadOnlyList<string> ExpandedQueries { get; init; } = [];

    public IReadOnlyDictionary<string, string> Filters { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    public bool IncludeCategoryFields { get; init; } = true;

    public string QueryText { get; init; } = string.Empty;

    public string SearchMode { get; init; } = "alias_expanded";

    public int Size { get; init; }
}

internal sealed class ProcurementAggregationRequest
{
    public required string BucketType { get; init; }

    public bool EnableFuzzyMatching { get; init; } = true;

    public IReadOnlyList<string> ExpandedQueries { get; init; } = [];

    public IReadOnlyDictionary<string, string> Filters { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    public bool IncludeCategoryFields { get; init; } = true;

    public bool IncludeSupplierFields { get; init; } = true;

    public string QueryText { get; init; } = string.Empty;

    public string SearchMode { get; init; } = "alias_expanded";

    public int Size { get; init; }
}

internal sealed record ProcurementGatewayResult<T>(
    string ToolName,
    string QueryText,
    string PayloadJson,
    IReadOnlyList<string> FiltersApplied,
    IReadOnlyList<string> TopResultIds,
    T Data);

internal sealed class ProcurementFinalResponseArguments
{
    [JsonPropertyName("answerText")]
    public string AnswerText { get; init; } = string.Empty;

    [JsonPropertyName("auditSummaryNotes")]
    public IReadOnlyList<string> AuditSummaryNotes { get; init; } = [];

    [JsonPropertyName("charts")]
    public IReadOnlyList<ProcurementChartPayload> Charts { get; init; } = [];

    [JsonPropertyName("confidence")]
    public string? Confidence { get; init; }

    [JsonPropertyName("confirmedFindings")]
    public IReadOnlyList<string> ConfirmedFindings { get; init; } = [];

    [JsonPropertyName("entity")]
    public ProcurementResolvedEntity? Entity { get; init; }

    [JsonPropertyName("entityType")]
    public string? EntityType { get; init; }

    [JsonPropertyName("exploratoryFindings")]
    public IReadOnlyList<string> ExploratoryFindings { get; init; } = [];

    [JsonPropertyName("finalAnswerSource")]
    public string FinalAnswerSource { get; init; } = string.Empty;

    [JsonPropertyName("intent")]
    public string Intent { get; init; } = string.Empty;

    [JsonPropertyName("summaryCards")]
    public IReadOnlyList<ProcurementSummaryCard> SummaryCards { get; init; } = [];

    [JsonPropertyName("supportingFindings")]
    public IReadOnlyList<string> SupportingFindings { get; init; } = [];

    [JsonPropertyName("supportingTable")]
    public ProcurementTablePayload? SupportingTable { get; init; }
}
