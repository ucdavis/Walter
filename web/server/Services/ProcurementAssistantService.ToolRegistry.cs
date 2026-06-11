namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private Dictionary<string, ProcurementAgentToolHandler> BuildToolRegistry(
        string question,
        IReadOnlyList<string> expansions,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        bool includeTrace)
    {
        var aggregateArtifacts = new List<ProcurementAggregateArtifact>();
        var tools = new Dictionary<string, ProcurementAgentToolHandler>(StringComparer.Ordinal)
        {
            ["get_procurement_schema_context"] = new(
                new ProcurementAgentToolDefinition(
                    "get_procurement_schema_context",
                    "Return the index schema summary, filter aliases, and planning cues for the current procurement question. Use this sparingly because the normal system prompt already includes the standard schema summary.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new { },
                    }),
                (_, _) => GetProcurementSchemaContextToolAsync(question, traceCalls)),
            ["resolve_supplier_candidate"] = new(
                new ProcurementAgentToolDefinition(
                    "resolve_supplier_candidate",
                    "Resolve a supplier phrase to the strongest supplier summary record when you need supplier identity before filtering line or aggregation queries.",
                    new
                    {
                        type = "object",
                        required = new[] { "candidate" },
                        additionalProperties = false,
                        properties = new
                        {
                            candidate = new
                            {
                                type = "string",
                                description = "The supplier phrase from the user question.",
                            },
                        },
                    }),
                (arguments, cancellationToken) => ResolveSupplierCandidateToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["resolve_supplier_group"] = new(
                new ProcurementAgentToolDefinition(
                    "resolve_supplier_group",
                    "Resolve a supplier comparison candidate into one or more supplier summary records and total them as a group.",
                    new
                    {
                        type = "object",
                        required = new[] { "candidate" },
                        additionalProperties = false,
                        properties = new
                        {
                            candidate = new
                            {
                                type = "string",
                                description = "A supplier group candidate like `amazon` or `fisher scientific`.",
                            },
                        },
                    }),
                (arguments, cancellationToken) => ResolveSupplierGroupToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["rerank_candidates"] = new(
                new ProcurementAgentToolDefinition(
                    "rerank_candidates",
                    "Re-rank candidate matches before treating them as evidence. Use this after broad, fuzzy, alias-expanded, semantic, aggregated, or otherwise noisy retrieval.",
                    new
                    {
                        type = "object",
                        required = new[] { "candidateSetIds" },
                        additionalProperties = false,
                        properties = new
                        {
                            candidateSetIds = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            expectedEntityType = new { type = "string" },
                            focus = new { type = "string" },
                        },
                    }),
                (arguments, cancellationToken) => RerankCandidatesToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["search_supplier_summary"] = new(
                new ProcurementAgentToolDefinition(
                    "search_supplier_summary",
                    "Search the supplier summary index for supplier candidates or supplier-side context. These are retrieval candidates until identity is validated.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            queryText = new
                            {
                                type = "string",
                                description = "Supplier-oriented search text. Use an empty string for filter-only lookups.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                        },
                    }),
                (arguments, cancellationToken) => SearchSupplierSummaryToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["search_line_items"] = new(
                new ProcurementAgentToolDefinition(
                    "search_line_items",
                    "Fetch concrete example PO rows from the full line-item index after rollup evidence is anchored. Use this to populate example-item tables, not as the default non-supplier discovery path or as a broad noise-probing step.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            includeSupplierFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Line-item query text. Use an empty string for supplier drill-down evidence.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                            sortByAmountDescending = new { type = "boolean" },
                        },
                    }),
                (arguments, cancellationToken) => SearchLineItemsToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["aggregate_spend"] = new(
                new ProcurementAgentToolDefinition(
                    "aggregate_spend",
                    "Aggregate spend by supplier, category, or month. Prefer reranked filters or entities before treating aggregates as authoritative.",
                    new
                    {
                        type = "object",
                        required = new[] { "bucketType" },
                        additionalProperties = false,
                        properties = new
                        {
                            bucketType = new
                            {
                                type = "string",
                                @enum = new[] { "supplier", "category", "month" },
                            },
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            includeSupplierFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Concept to aggregate. Use an empty string for whole-index or filter-only totals.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            assessmentId = new { type = "string" },
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                            validationId = new { type = "string" },
                        },
                    }),
                (arguments, cancellationToken) => AggregateSpendToolAsync(arguments, traceCalls, evidenceCatalog, aggregateArtifacts, cancellationToken)),
            ["finalize_response"] = new(
                new ProcurementAgentToolDefinition(
                    "finalize_response",
                    "Return the final structured procurement answer for the UI after you have enough tool evidence.",
                    new
                    {
                        type = "object",
                        required = new[] { "answerText", "finalAnswerSource", "intent" },
                        additionalProperties = false,
                        properties = new
                        {
                            answerText = new { type = "string" },
                            auditSummaryNotes = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            charts = BuildChartsSchema(),
                            confidence = new { type = "string" },
                            confirmedFindings = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            entity = new
                            {
                                type = "object",
                                additionalProperties = false,
                                properties = new
                                {
                                    supplierNumber = new { type = "string" },
                                    type = new { type = "string" },
                                    value = new { type = "string" },
                                },
                            },
                            entityType = new { type = "string" },
                            exploratoryFindings = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            finalAnswerSource = new { type = "string" },
                            intent = new { type = "string" },
                            summaryCards = BuildSummaryCardsSchema(),
                            supportingFindings = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            supportingTable = BuildTableSchema(),
                        },
                    }),
                (arguments, _) => FinalizeResponseToolAsync(arguments, question, expansions, traceCalls, evidenceCatalog, aggregateArtifacts, includeTrace)),
        };

        if (_options.HasItemGroupIndexConfigured())
        {
            tools["search_item_groups"] = new ProcurementAgentToolHandler(
                new ProcurementAgentToolDefinition(
                    "search_item_groups",
                    "Search the rollup item-group index for primary non-supplier evidence, including grouped item descriptions, supplier rollups, and category context. This is the normal first lexical step for broad item questions when hybrid rollup search is unavailable or unnecessary.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Concept, item phrase, or grouped purchasing pattern to search in the rollup index.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                        },
                    }),
                (arguments, cancellationToken) => SearchItemGroupsToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken));
        }

        if (_options.EnableHybridSearch && _options.HasItemGroupIndexConfigured())
        {
            tools["hybrid_search_item_groups"] = new ProcurementAgentToolHandler(
                new ProcurementAgentToolDefinition(
                    "hybrid_search_item_groups",
                    "Run lexical plus semantic search over the rollup item-group index for item, category, or concept questions when synonyms or broad descriptions may matter. Prefer this as the first pass for broad item or concept questions when available.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            includeSupplierFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Concept to search for in rollup item-group evidence.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                        },
                    }),
                (arguments, cancellationToken) => HybridSearchItemGroupsToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken));
        }

        return tools;
    }
}
