namespace Server.Services;

internal static class ProcurementSchemaContextFactory
{
    public static object BuildToolPayload(
        string question,
        IProcurementQueryParser queryParser,
        ProcurementAssistantOptions options,
        bool hybridSearchAvailable,
        bool itemGroupSearchAvailable)
    {
        var supplierCandidate = queryParser.ExtractSupplierCandidate(question);
        var itemCandidate = queryParser.ExtractItemCandidate(question);
        var comparisonCandidates = queryParser.ExtractSupplierComparisonCandidates(question);

        return new
        {
            question,
            questionSignals = new
            {
                comparisonCandidates,
                possibleItemPhrase = itemCandidate,
                possibleSupplierPhrase = supplierCandidate,
            },
            indexes = BuildIndexSummaries(options, hybridSearchAvailable, itemGroupSearchAvailable),
            planningGuidance = new[]
            {
                "Treat the final intent label as a UI summary, not as the retrieval plan.",
                "Choose the starting point based on the evidence you need: supplier summary for supplier identity, rollup item groups for most non-supplier exploration and aggregation, and line items for concrete example rows.",
                "Use hybrid rollup search when the user asks about a concept, synonym, or broad item and lexical matches might be incomplete.",
                "Search tools return candidate matches. Re-rank broad or fuzzy candidate sets before treating retrieval order as evidence.",
                "Use rollup aggregations after you have a reranked evidence set or at least a tightly anchored filter set; broad aggregates alone are not proof.",
                "Prefer reranked evidence rows before naming a supplier or category as the answer to a concrete question.",
                "If the first retrieval looks broad or semantically adjacent, refine the query, add filters, or explain the ambiguity.",
            },
            filterFieldAliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["supplierNumber"] = options.SupplierNumberField,
                ["supplierName"] = options.SupplierNameField,
                ["supplierNameNorm"] = options.SupplierNameNormField,
                ["poLineId"] = options.LineItemIdField,
                ["itemGroupId"] = options.ItemGroupIdField,
                ["itemGroupName"] = options.ItemGroupNameField,
                ["itemDescription"] = options.ItemDescriptionField,
                ["purchaseOrderDescription"] = options.PurchaseOrderDescriptionField,
                ["categoryCode"] = options.CategoryCodeField,
                ["categoryName"] = options.CategoryNameField,
                ["lineAmount"] = options.LineAmountField,
                ["purchaseDate"] = options.DateField,
            },
        };
    }

    public static string BuildPromptSummary(
        ProcurementAssistantOptions options,
        bool hybridSearchAvailable,
        bool itemGroupSearchAvailable)
    {
        var itemGroupLine = itemGroupSearchAvailable
            ? $"- Primary non-supplier rollup index `{options.ItemGroupIndexName}` contains grouped item evidence keyed by `{options.ItemGroupIdField}`, with primary item text in `{options.ItemGroupNameField}`, supporting examples in `{options.ItemGroupDescriptionField}`, supplier identifiers (`{options.SupplierNumberField}`, `{options.SupplierNameField}`), totals in `{options.ItemGroupAmountField}`, line counts in `{options.ItemGroupLineCountField}`, and vectors in `{options.ItemGroupEmbeddingField}`."
            : "- The rollup item-group index is not available in this environment, so rely on line items and supplier summaries.";
        var hybridLine = hybridSearchAvailable
            ? "- Hybrid rollup search is available and is a first-class option for concept-style item questions."
            : "- Hybrid rollup search is unavailable here, so use lexical rollup search plus refinement instead.";

        return
            $"""
             Data model:
             - Line-item evidence lives in `{options.LineItemIndexName}`. Use it mainly for concrete example PO rows and monthly trend fallback. Key fields include supplier identifiers (`{options.SupplierNumberField}`, `{options.SupplierNameField}`), item text (`{options.ItemDescriptionField}`, `{options.PurchaseOrderDescriptionField}`), category (`{options.CategoryCodeField}`, `{options.CategoryNameField}`), amount (`{options.LineAmountField}`), date (`{options.DateField}`), and the optional vector field (`{options.LineItemEmbeddingField ?? "not configured"}`).
             - Supplier summary records live in `{options.SupplierIndexName}`. Key fields include supplier identifiers (`{options.SupplierNumberField}`, `{options.SupplierNameField}`, `{options.SupplierNameNormField}`), aliases (`{options.SupplierAliasField}`), top item terms (`{options.SupplierTermsField}`), top categories (`{options.SupplierCategoriesField}`), total amount (`{options.SupplierTotalAmountField}`), and line count (`{options.SupplierLineCountField}`).
             {itemGroupLine}
             {hybridLine}
             """;
    }

    private static object[] BuildIndexSummaries(
        ProcurementAssistantOptions options,
        bool hybridSearchAvailable,
        bool itemGroupSearchAvailable)
    {
        var indexes = new List<object>
        {
            new
            {
                name = options.LineItemIndexName,
                purpose = "Concrete PO line evidence for example rows, monthly trends, and direct row-level verification.",
                priority = "secondary",
                importantFields = new
                {
                    amount = options.LineAmountField,
                    categoryCode = options.CategoryCodeField,
                    categoryName = options.CategoryNameField,
                    date = options.DateField,
                    itemDescriptions = new[]
                    {
                        options.ItemDescriptionField,
                        options.PurchaseOrderDescriptionField,
                    },
                    supplierIdentifiers = new[]
                    {
                        options.SupplierNumberField,
                        options.SupplierNameField,
                    },
                    vectorField = hybridSearchAvailable ? options.LineItemEmbeddingField : null,
                },
            },
            new
            {
                name = options.SupplierIndexName,
                purpose = "Supplier-level summaries for resolving supplier identity and broad supplier totals.",
                priority = "primary",
                importantFields = new
                {
                    aliases = options.SupplierAliasField,
                    categories = options.SupplierCategoriesField,
                    lineCount = options.SupplierLineCountField,
                    supplierIdentifiers = new[]
                    {
                        options.SupplierNumberField,
                        options.SupplierNameField,
                        options.SupplierNameNormField,
                    },
                    topItemTerms = options.SupplierTermsField,
                    totalAmount = options.SupplierTotalAmountField,
                },
            },
        };

        if (itemGroupSearchAvailable)
        {
            indexes.Add(new
            {
                name = options.ItemGroupIndexName,
                purpose = "Primary non-supplier rollup evidence for grouped item descriptions, supplier-item combinations, and spend rollups.",
                priority = "primary",
                importantFields = new
                {
                    amount = options.ItemGroupAmountField,
                    categoryCode = options.CategoryCodeField,
                    categoryName = options.CategoryNameField,
                    itemGroupDescriptions = new[]
                    {
                        options.ItemGroupNameField,
                        options.ItemGroupDescriptionField,
                    },
                    itemGroupId = options.ItemGroupIdField,
                    lineCount = options.ItemGroupLineCountField,
                    supplierIdentifiers = new[]
                    {
                        options.SupplierNumberField,
                        options.SupplierNameField,
                    },
                    vectorField = hybridSearchAvailable ? options.ItemGroupEmbeddingField : null,
                },
            });
        }

        return indexes.ToArray();
    }
}
