namespace Server.Services;

/// <summary>
/// Configuration for procurement-assistant Elasticsearch queries and optional embedding support.
/// </summary>
public sealed class ProcurementAssistantOptions
{
    public const string SectionName = "ProcurementAssistant";

    public string ElasticsearchBaseUrl { get; set; } = string.Empty;

    public string ElasticsearchApiKey { get; set; } = string.Empty;

    public string ElasticsearchUsername { get; set; } = string.Empty;

    public string ElasticsearchPassword { get; set; } = string.Empty;

    public string SupplierIndexName { get; set; } = "po-spike-suppliers-v20260424062617";

    public string LineItemIndexName { get; set; } = "po-spike-lines-v20260424062617";

    public string ItemGroupIndexName { get; set; } = "po-spike-item-groups-v20260424062617";

    public string SupplierNumberField { get; set; } = "supplier_number";

    public string SupplierNameField { get; set; } = "supplier_name";

    public string SupplierNameNormField { get; set; } = "supplier_name_norm";

    public string SupplierAliasField { get; set; } = "aliases";

    public string SupplierTermsField { get; set; } = "top_item_terms";

    public string SupplierCategoriesField { get; set; } = "top_categories";

    public string SupplierLineCountField { get; set; } = "line_count";

    public string SupplierTotalAmountField { get; set; } = "total_amount";

    public string LineItemIdField { get; set; } = "po_line_id";

    public string ItemGroupIdField { get; set; } = "item_group_id";

    public string ItemGroupNameField { get; set; } = "item_description";

    public string ItemGroupNameNormField { get; set; } = "item_description_norm";

    public string ItemGroupDescriptionField { get; set; } = "po_description_examples";

    public string ItemGroupDescriptionNormField { get; set; } = "item_description_norm";

    public string ItemGroupVectorTextField { get; set; } = "vector_text";

    public string ItemGroupEmbeddingField { get; set; } = "embedding";

    public string ItemGroupAmountField { get; set; } = "total_amount";

    public string ItemGroupLineCountField { get; set; } = "line_count";

    public string ItemGroupAverageAmountField { get; set; } = "avg_amount";

    public string ItemGroupMinimumAmountField { get; set; } = "min_amount";

    public string ItemGroupMaximumAmountField { get; set; } = "max_amount";

    public string ItemGroupSampleLineIdsField { get; set; } = "sample_line_ids";

    public string PurchaseOrderDescriptionField { get; set; } = "po_description";

    public string PurchaseOrderDescriptionNormField { get; set; } = "po_description_norm";

    public string ItemDescriptionField { get; set; } = "item_description";

    public string ItemDescriptionNormField { get; set; } = "item_description_norm";

    public string CategoryCodeField { get; set; } = "category_code";

    public string CategoryNameField { get; set; } = "category_name";

    public string CategoryNameNormField { get; set; } = "category_name_norm";

    public string LineAmountField { get; set; } = "line_amount";

    public string SupplierTermsAggregationField { get; set; } = "supplier_name_norm";

    public string CategoryTermsAggregationField { get; set; } = "category_name_norm";

    public string DateField { get; set; } = "po_date";

    public string? LineItemEmbeddingField { get; set; } = "embedding";

    public bool EnableHybridSearch { get; set; }

    public string OpenAiApiKey { get; set; } = string.Empty;

    public string OpenAiBaseUrl { get; set; } = "https://api.openai.com/v1";

    public string OpenAiChatModel { get; set; } = "gpt-5-mini";

    public string OpenAiEmbeddingModel { get; set; } = "text-embedding-3-small";

    public string? OpenAiReasoningEffort { get; set; } = "low";

    public int DefaultSearchSize { get; set; } = 8;

    public int DefaultAggregationSize { get; set; } = 10;

    public int MaxAgentSteps { get; set; } = 8;

    public string[][] QueryAliasGroups { get; set; } = [];

    public Dictionary<string, string[]> QueryAliasGroupsByKey { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    public Dictionary<string, string[]> SupplierComparisonExpansionGroups { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    public bool IsElasticsearchConfigured() =>
        !string.IsNullOrWhiteSpace(ElasticsearchBaseUrl) &&
        !string.IsNullOrWhiteSpace(SupplierIndexName) &&
        !string.IsNullOrWhiteSpace(LineItemIndexName);

    public bool HasItemGroupIndexConfigured() =>
        !string.IsNullOrWhiteSpace(ItemGroupIndexName);

    public bool IsOpenAiChatConfigured() =>
        !string.IsNullOrWhiteSpace(OpenAiApiKey) &&
        !string.IsNullOrWhiteSpace(OpenAiChatModel);

    public bool IsOpenAiEmbeddingConfigured() =>
        !string.IsNullOrWhiteSpace(OpenAiApiKey) &&
        !string.IsNullOrWhiteSpace(OpenAiEmbeddingModel);
}
