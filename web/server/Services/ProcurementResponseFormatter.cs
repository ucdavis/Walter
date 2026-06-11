using System.Globalization;

namespace Server.Services;

internal static class ProcurementResponseFormatter
{
    public static ProcurementChartPayload BuildAggregateChart(
        string kind,
        string title,
        IReadOnlyList<ProcurementAggregationBucket> buckets)
    {
        return new ProcurementChartPayload
        {
            Data = buckets
                .Select(bucket => (IReadOnlyDictionary<string, object?>)new Dictionary<string, object?>
                {
                    ["amount"] = bucket.Amount,
                    ["count"] = bucket.Count,
                    ["label"] = bucket.Label,
                })
                .ToArray(),
            Kind = kind,
            Title = title,
            XKey = "label",
            YKeys = ["amount", "count"],
        };
    }

    public static ProcurementTablePayload BuildAggregateTable(
        string title,
        IReadOnlyList<ProcurementAggregationBucket> buckets)
    {
        return new ProcurementTablePayload
        {
            Columns = ["label", "amount", "count"],
            Rows = buckets
                .Select(bucket => (IReadOnlyDictionary<string, string>)new Dictionary<string, string>
                {
                    ["label"] = bucket.Label,
                    ["amount"] = ProcurementQueryText.FormatCurrency(bucket.Amount),
                    ["count"] = ProcurementQueryText.FormatInteger(bucket.Count),
                })
                .ToArray(),
            Title = title,
        };
    }

    public static ProcurementTablePayload BuildLineItemTable(
        string title,
        IReadOnlyList<ProcurementLineItemHit> rows)
    {
        return new ProcurementTablePayload
        {
            Columns = ["po_line_id", "supplier_name", "item_description", "category_name", "line_amount"],
            Rows = rows
                .Select(row => (IReadOnlyDictionary<string, string>)new Dictionary<string, string>
                {
                    ["po_line_id"] = row.PoLineId,
                    ["supplier_name"] = row.SupplierName,
                    ["item_description"] = row.ItemDescription ?? row.PurchaseOrderDescription ?? string.Empty,
                    ["category_name"] = row.CategoryName ?? string.Empty,
                    ["line_amount"] = ProcurementQueryText.FormatCurrency(row.LineAmount),
                })
                .ToArray(),
            Title = title,
        };
    }

    public static ProcurementTablePayload BuildHybridEvidenceTable(
        string title,
        IReadOnlyList<ProcurementHybridLineHit> rows)
    {
        return new ProcurementTablePayload
        {
            Columns = ["po_line_id", "supplier_name", "item_description", "category_name", "line_amount", "combined_score"],
            Rows = rows
                .Select(row => (IReadOnlyDictionary<string, string>)new Dictionary<string, string>
                {
                    ["po_line_id"] = row.LineItem.PoLineId,
                    ["supplier_name"] = row.LineItem.SupplierName,
                    ["item_description"] = row.LineItem.ItemDescription ?? row.LineItem.PurchaseOrderDescription ?? string.Empty,
                    ["category_name"] = row.LineItem.CategoryName ?? string.Empty,
                    ["line_amount"] = ProcurementQueryText.FormatCurrency(row.LineItem.LineAmount),
                    ["combined_score"] = row.CombinedScore.ToString("0.###", CultureInfo.InvariantCulture),
                })
                .ToArray(),
            Title = title,
        };
    }

    public static ProcurementTablePayload BuildItemGroupTable(
        string title,
        IReadOnlyList<ProcurementItemGroupHit> rows)
    {
        return new ProcurementTablePayload
        {
            Columns = ["supplier_name", "item_description", "category_name", "total_amount", "line_count"],
            Rows = rows
                .Select(row => (IReadOnlyDictionary<string, string>)new Dictionary<string, string>
                {
                    ["supplier_name"] = row.SupplierName,
                    ["item_description"] = row.ItemGroupName ?? string.Empty,
                    ["category_name"] = row.CategoryName ?? string.Empty,
                    ["total_amount"] = ProcurementQueryText.FormatCurrency(row.TotalAmount),
                    ["line_count"] = ProcurementQueryText.FormatInteger(row.LineCount),
                })
                .ToArray(),
            Title = title,
        };
    }

    public static ProcurementTablePayload BuildHybridItemGroupTable(
        string title,
        IReadOnlyList<ProcurementHybridItemGroupHit> rows)
    {
        return new ProcurementTablePayload
        {
            Columns = ["supplier_name", "item_description", "category_name", "total_amount", "line_count", "combined_score"],
            Rows = rows
                .Select(row => (IReadOnlyDictionary<string, string>)new Dictionary<string, string>
                {
                    ["supplier_name"] = row.ItemGroup.SupplierName,
                    ["item_description"] = row.ItemGroup.ItemGroupName ?? string.Empty,
                    ["category_name"] = row.ItemGroup.CategoryName ?? string.Empty,
                    ["total_amount"] = ProcurementQueryText.FormatCurrency(row.ItemGroup.TotalAmount),
                    ["line_count"] = ProcurementQueryText.FormatInteger(row.ItemGroup.LineCount),
                    ["combined_score"] = row.CombinedScore.ToString("0.###", CultureInfo.InvariantCulture),
                })
                .ToArray(),
            Title = title,
        };
    }

    public static ProcurementTablePayload BuildSupplierTable(
        string title,
        IReadOnlyList<ProcurementSupplierSearchHit> rows)
    {
        return new ProcurementTablePayload
        {
            Columns = ["supplier_number", "supplier_name", "total_amount", "line_count"],
            Rows = rows
                .Select(row => (IReadOnlyDictionary<string, string>)new Dictionary<string, string>
                {
                    ["supplier_number"] = row.SupplierNumber,
                    ["supplier_name"] = row.SupplierName,
                    ["total_amount"] = ProcurementQueryText.FormatCurrency(row.TotalAmount),
                    ["line_count"] = ProcurementQueryText.FormatInteger(row.LineCount),
                })
                .ToArray(),
            Title = title,
        };
    }

    public static string GetDefaultChartKind(string bucketType) =>
        string.Equals(bucketType, "month", StringComparison.OrdinalIgnoreCase) ? "line" : "bar";

    public static string BuildAggregateTitle(string bucketType) =>
        bucketType switch
        {
            "month" => "Monthly spend",
            "supplier" => "Top suppliers",
            _ => "Top categories",
        };
}
