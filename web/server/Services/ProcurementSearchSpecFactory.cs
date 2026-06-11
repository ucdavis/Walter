using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Server.Services;

internal sealed class ProcurementSearchSpecFactory
{
    private readonly ProcurementAssistantOptions _options;
    private readonly IProcurementQueryParser _queryParser;

    public ProcurementSearchSpecFactory(
        IProcurementQueryParser queryParser,
        IOptions<ProcurementAssistantOptions> options)
    {
        _queryParser = queryParser;
        _options = options.Value;
    }

    public ProcurementLineSearchSpec BuildLineSearchSpec(
        JsonElement arguments,
        bool includeSemanticSearch)
    {
        var queryText = ReadOptionalString(arguments, "queryText") ?? string.Empty;
        var filters = NormalizeFilters(ReadFilters(arguments));
        var searchMode = ReadOptionalString(arguments, "searchMode") ?? "alias_expanded";

        return new ProcurementLineSearchSpec
        {
            EnableFuzzyMatching = ResolveFuzzyMatching(searchMode),
            ExpandedQueries = BuildExpandedQueries(queryText, searchMode),
            Filters = filters,
            IncludeCategoryFields = ReadOptionalBool(arguments, "includeCategoryFields", true),
            IncludeSupplierFields = ReadOptionalBool(arguments, "includeSupplierFields", false),
            QueryText = queryText,
            SearchMode = searchMode,
            Size = ReadOptionalInt(arguments, "size", _options.DefaultSearchSize),
            SortByAmountDescending = includeSemanticSearch
                ? false
                : ReadOptionalBool(arguments, "sortByAmountDescending", false),
        };
    }

    public ProcurementSupplierSearchSpec BuildSupplierSearchSpec(JsonElement arguments)
    {
        var queryText = ReadOptionalString(arguments, "queryText") ?? string.Empty;
        var filters = NormalizeFilters(ReadFilters(arguments));
        var searchMode = ReadOptionalString(arguments, "searchMode") ?? "alias_expanded";

        return new ProcurementSupplierSearchSpec
        {
            EnableFuzzyMatching = ResolveFuzzyMatching(searchMode),
            ExpandedQueries = BuildExpandedQueries(queryText, searchMode),
            Filters = filters,
            QueryText = queryText,
            SearchMode = searchMode,
            Size = ReadOptionalInt(arguments, "size", _options.DefaultSearchSize),
        };
    }

    public ProcurementItemGroupSearchSpec BuildItemGroupSearchSpec(JsonElement arguments)
    {
        var queryText = ReadOptionalString(arguments, "queryText") ?? string.Empty;
        var filters = NormalizeFilters(ReadFilters(arguments));
        var searchMode = ReadOptionalString(arguments, "searchMode") ?? "alias_expanded";

        return new ProcurementItemGroupSearchSpec
        {
            EnableFuzzyMatching = ResolveFuzzyMatching(searchMode),
            ExpandedQueries = BuildExpandedQueries(queryText, searchMode),
            Filters = filters,
            IncludeCategoryFields = ReadOptionalBool(arguments, "includeCategoryFields", true),
            QueryText = queryText,
            SearchMode = searchMode,
            Size = ReadOptionalInt(arguments, "size", _options.DefaultSearchSize),
        };
    }

    public ProcurementAggregationRequest BuildAggregationRequest(JsonElement arguments)
    {
        var bucketType = ReadRequiredString(arguments, "bucketType");
        var queryText = ReadOptionalString(arguments, "queryText") ?? string.Empty;
        var searchMode = ReadOptionalString(arguments, "searchMode") ?? "alias_expanded";

        return new ProcurementAggregationRequest
        {
            BucketType = bucketType,
            EnableFuzzyMatching = ResolveFuzzyMatching(searchMode),
            ExpandedQueries = BuildExpandedQueries(queryText, searchMode),
            Filters = NormalizeFilters(ReadFilters(arguments)),
            IncludeCategoryFields = ReadOptionalBool(arguments, "includeCategoryFields", true),
            IncludeSupplierFields = ReadOptionalBool(arguments, "includeSupplierFields", false),
            QueryText = queryText,
            SearchMode = searchMode,
            Size = ReadOptionalInt(arguments, "size", _options.DefaultAggregationSize),
        };
    }

    public static IReadOnlyDictionary<string, string> ReadFilters(JsonElement arguments)
    {
        if (!arguments.TryGetProperty("filters", out var filtersElement) ||
            filtersElement.ValueKind != JsonValueKind.Object)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        return filtersElement.EnumerateObject()
            .Where(property => property.Value.ValueKind == JsonValueKind.String)
            .ToDictionary(
                property => property.Name,
                property => property.Value.GetString() ?? string.Empty,
                StringComparer.OrdinalIgnoreCase);
    }

    public static bool ReadOptionalBool(JsonElement element, string propertyName, bool defaultValue)
    {
        return element.TryGetProperty(propertyName, out var property) && property.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? property.GetBoolean()
            : defaultValue;
    }

    public static int ReadOptionalInt(JsonElement element, string propertyName, int defaultValue)
    {
        return element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var value)
            ? value
            : defaultValue;
    }

    public static string? ReadOptionalString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
    }

    public static string ReadRequiredString(JsonElement element, string propertyName) =>
        ReadOptionalString(element, propertyName) ?? string.Empty;

    public static IReadOnlyList<string> BuildFilterSummaries(IReadOnlyDictionary<string, string> filters)
    {
        return filters
            .Where(kvp => !string.IsNullOrWhiteSpace(kvp.Value))
            .Select(kvp => $"{kvp.Key}={kvp.Value}")
            .ToArray();
    }

    private IReadOnlyDictionary<string, string> NormalizeFilters(IReadOnlyDictionary<string, string> filters)
    {
        if (filters.Count == 0)
        {
            return filters;
        }

        var normalized = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, value) in filters)
        {
            normalized[NormalizeFilterFieldName(key)] = value;
        }

        return normalized;
    }

    private IReadOnlyList<string> BuildExpandedQueries(string queryText, string searchMode)
    {
        return searchMode switch
        {
            "exact" => string.IsNullOrWhiteSpace(queryText) ? [] : [queryText.Trim()],
            "fuzzy" => string.IsNullOrWhiteSpace(queryText) ? [] : [queryText.Trim()],
            _ => _queryParser.ExpandAliases(queryText),
        };
    }

    private string NormalizeFilterFieldName(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return key;
        }

        return key.Trim() switch
        {
            "supplierNumber" or "supplier_number" => _options.SupplierNumberField,
            "supplierName" or "supplier_name" => _options.SupplierNameField,
            "supplierNameNorm" or "supplier_name_norm" => _options.SupplierNameNormField,
            "poLineId" or "po_line_id" => _options.LineItemIdField,
            "itemGroupId" or "item_group_id" => _options.ItemGroupIdField,
            "itemGroupName" or "item_group_name" => _options.ItemGroupNameField,
            "itemGroupNameNorm" or "item_group_name_norm" => _options.ItemGroupNameNormField,
            "itemGroupDescription" or "item_group_description" => _options.ItemGroupDescriptionField,
            "itemGroupDescriptionNorm" or "item_group_description_norm" => _options.ItemGroupDescriptionNormField,
            "purchaseOrderDescription" or "po_description" => _options.PurchaseOrderDescriptionField,
            "purchaseOrderDescriptionNorm" or "po_description_norm" => _options.PurchaseOrderDescriptionNormField,
            "itemDescription" or "item_description" => _options.ItemDescriptionField,
            "itemDescriptionNorm" or "item_description_norm" => _options.ItemDescriptionNormField,
            "categoryCode" or "category_code" => _options.CategoryCodeField,
            "categoryName" or "category_name" => _options.CategoryNameField,
            "categoryNameNorm" or "category_name_norm" => _options.CategoryNameNormField,
            "lineAmount" or "line_amount" => _options.LineAmountField,
            "purchaseDate" or "po_date" => _options.DateField,
            _ => key.Trim(),
        };
    }

    private static bool ResolveFuzzyMatching(string searchMode) =>
        string.Equals(searchMode, "fuzzy", StringComparison.OrdinalIgnoreCase);
}
