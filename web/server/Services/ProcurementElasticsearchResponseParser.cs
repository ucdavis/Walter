using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Server.Services;

internal sealed class ProcurementElasticsearchResponseParser
{
    private readonly ProcurementAssistantOptions _options;

    public ProcurementElasticsearchResponseParser(IOptions<ProcurementAssistantOptions> options)
    {
        _options = options.Value;
    }

    public IReadOnlyList<ProcurementSupplierSearchHit> ParseSupplierHits(JsonElement root)
    {
        return ParseHits(root)
            .Select(ParseSupplierSearchHit)
            .ToArray();
    }

    public IReadOnlyList<ProcurementLineItemHit> ParseLineItemHits(JsonElement root)
    {
        return ParseHits(root)
            .Select(ParseLineItemHit)
            .ToArray();
    }

    public IReadOnlyList<ProcurementItemGroupHit> ParseItemGroupHits(JsonElement root)
    {
        return ParseHits(root)
            .Select(ParseItemGroupHit)
            .ToArray();
    }

    public ProcurementAggregationResult ParseAggregationResult(
        JsonElement root,
        string bucketType,
        bool useItemGroupIndex)
    {
        var totalAmount = root.TryGetProperty("aggregations", out var aggs) &&
            aggs.TryGetProperty("sum_amount", out var sumAmount) &&
            sumAmount.TryGetProperty("value", out var sumValue) &&
            sumValue.ValueKind == JsonValueKind.Number
            ? sumValue.GetDecimal()
            : 0m;

        var totalCount = useItemGroupIndex
            ? ReadAggregateCount(aggs)
            : root.TryGetProperty("hits", out var hits) &&
              hits.TryGetProperty("total", out var total) &&
              total.TryGetProperty("value", out var totalValue) &&
              totalValue.ValueKind == JsonValueKind.Number
                ? totalValue.GetInt64()
                : 0L;

        var buckets = new List<ProcurementAggregationBucket>();
        if (root.TryGetProperty("aggregations", out var aggregations) &&
            aggregations.TryGetProperty("terms_bucket", out var termsBucket) &&
            termsBucket.TryGetProperty("buckets", out var bucketArray) &&
            bucketArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var bucket in bucketArray.EnumerateArray())
            {
                var key = bucket.TryGetProperty("key_as_string", out var keyAsString)
                    ? keyAsString.GetString() ?? string.Empty
                    : bucket.TryGetProperty("key", out var keyValue)
                        ? keyValue.ToString()
                        : string.Empty;

                var amount = bucket.TryGetProperty("sum_amount", out var sum) &&
                    sum.TryGetProperty("value", out var value) &&
                    value.ValueKind == JsonValueKind.Number
                        ? value.GetDecimal()
                        : 0m;

                buckets.Add(new ProcurementAggregationBucket(
                    Key: key,
                    Label: bucketType == "month" ? ProcurementQueryText.FormatMonthLabel(key) : key,
                    Amount: amount,
                    Count: useItemGroupIndex
                        ? ReadAggregateCount(bucket)
                        : bucket.TryGetProperty("doc_count", out var docCount) && docCount.ValueKind == JsonValueKind.Number
                            ? docCount.GetInt64()
                            : 0L));
            }
        }

        return new ProcurementAggregationResult
        {
            Buckets = buckets,
            TotalAmount = totalAmount,
            TotalCount = totalCount,
        };
    }

    public static string BuildElasticsearchErrorDetail(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "No Elasticsearch error body was returned.";
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("error", out var errorElement))
            {
                var reason = TryReadNestedString(errorElement, "root_cause", "reason")
                    ?? TryReadString(errorElement, "reason");
                var type = TryReadNestedString(errorElement, "root_cause", "type")
                    ?? TryReadString(errorElement, "type");

                if (!string.IsNullOrWhiteSpace(reason) && !string.IsNullOrWhiteSpace(type))
                {
                    return $"Elasticsearch error ({type}): {reason}";
                }

                if (!string.IsNullOrWhiteSpace(reason))
                {
                    return $"Elasticsearch error: {reason}";
                }
            }
        }
        catch (JsonException)
        {
        }

        const int maxLength = 500;
        var compactBody = body.ReplaceLineEndings(" ").Trim();
        return compactBody.Length <= maxLength
            ? compactBody
            : $"{compactBody[..maxLength]}...";
    }

    private ProcurementSupplierSearchHit ParseSupplierSearchHit(JsonElement hit)
    {
        return new ProcurementSupplierSearchHit(
            SupplierNumber: ProcurementJson.ReadString(hit, _options.SupplierNumberField),
            SupplierName: ProcurementJson.ReadString(hit, _options.SupplierNameField),
            SupplierNameNorm: ProcurementJson.ReadString(hit, _options.SupplierNameNormField),
            Aliases: ProcurementJson.ReadStringCollection(hit, _options.SupplierAliasField),
            TotalAmount: ProcurementJson.ReadDecimal(hit, _options.SupplierTotalAmountField),
            LineCount: ProcurementJson.ReadInt(hit, _options.SupplierLineCountField),
            TopCategories: ProcurementJson.ReadStringCollection(hit, _options.SupplierCategoriesField),
            TopItemTerms: ProcurementJson.ReadFlexibleTerms(hit, _options.SupplierTermsField),
            Score: ProcurementJson.ReadScore(hit));
    }

    private ProcurementLineItemHit ParseLineItemHit(JsonElement hit)
    {
        return new ProcurementLineItemHit(
            PoLineId: ProcurementJson.ReadString(hit, _options.LineItemIdField),
            ItemGroupId: ProcurementJson.ReadNullableString(hit, _options.ItemGroupIdField),
            PurchaseOrderDescription: ProcurementJson.ReadNullableString(hit, _options.PurchaseOrderDescriptionField),
            SupplierNumber: ProcurementJson.ReadString(hit, _options.SupplierNumberField),
            SupplierName: ProcurementJson.ReadString(hit, _options.SupplierNameField),
            ItemDescription: ProcurementJson.ReadNullableString(hit, _options.ItemDescriptionField),
            LineAmount: ProcurementJson.ReadDecimal(hit, _options.LineAmountField),
            CategoryCode: ProcurementJson.ReadNullableString(hit, _options.CategoryCodeField),
            CategoryName: ProcurementJson.ReadNullableString(hit, _options.CategoryNameField),
            PurchaseDate: ProcurementJson.ReadNullableString(hit, _options.DateField),
            Score: ProcurementJson.ReadScore(hit));
    }

    private ProcurementItemGroupHit ParseItemGroupHit(JsonElement hit)
    {
        return new ProcurementItemGroupHit(
            ItemGroupId: ProcurementJson.ReadString(hit, _options.ItemGroupIdField),
            SupplierNumber: ProcurementJson.ReadString(hit, _options.SupplierNumberField),
            SupplierName: ProcurementJson.ReadString(hit, _options.SupplierNameField),
            ItemGroupName: ProcurementJson.ReadNullableString(hit, _options.ItemGroupNameField),
            ItemGroupDescription: ProcurementJson.ReadNullableString(hit, _options.ItemGroupDescriptionField),
            CategoryCode: ProcurementJson.ReadNullableString(hit, _options.CategoryCodeField),
            CategoryName: ProcurementJson.ReadNullableString(hit, _options.CategoryNameField),
            TotalAmount: ProcurementJson.ReadDecimal(hit, _options.ItemGroupAmountField),
            LineCount: ProcurementJson.ReadInt(hit, _options.ItemGroupLineCountField),
            AverageAmount: ProcurementJson.ReadDecimal(hit, _options.ItemGroupAverageAmountField),
            MinimumAmount: ProcurementJson.ReadDecimal(hit, _options.ItemGroupMinimumAmountField),
            MaximumAmount: ProcurementJson.ReadDecimal(hit, _options.ItemGroupMaximumAmountField),
            SampleLineIds: ProcurementJson.ReadStringCollection(hit, _options.ItemGroupSampleLineIdsField),
            Score: ProcurementJson.ReadScore(hit));
    }

    private static IReadOnlyList<JsonElement> ParseHits(JsonElement root)
    {
        if (root.TryGetProperty("hits", out var hits) &&
            hits.TryGetProperty("hits", out var innerHits) &&
            innerHits.ValueKind == JsonValueKind.Array)
        {
            return innerHits.EnumerateArray().ToArray();
        }

        return [];
    }

    private static string? TryReadNestedString(JsonElement parent, string arrayPropertyName, string nestedPropertyName)
    {
        if (!parent.TryGetProperty(arrayPropertyName, out var arrayElement) ||
            arrayElement.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (var item in arrayElement.EnumerateArray())
        {
            var value = TryReadString(item, nestedPropertyName);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string? TryReadString(JsonElement parent, string propertyName)
    {
        return parent.TryGetProperty(propertyName, out var property) &&
               property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
    }

    private static long ReadAggregateCount(JsonElement element)
    {
        return element.TryGetProperty("sum_line_count", out var countMetric) &&
               countMetric.TryGetProperty("value", out var countValue) &&
               countValue.ValueKind == JsonValueKind.Number
            ? Convert.ToInt64(Math.Round(countValue.GetDouble(), MidpointRounding.AwayFromZero))
            : 0L;
    }
}
