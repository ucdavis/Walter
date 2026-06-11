using Microsoft.Extensions.Options;

namespace Server.Services;

internal interface IProcurementAliasCatalog
{
    IReadOnlyList<IReadOnlyList<string>> GetQueryAliasGroups();

    IReadOnlyDictionary<string, IReadOnlyList<string>> GetSupplierComparisonExpansionGroups();
}

internal sealed class ProcurementAliasCatalog : IProcurementAliasCatalog
{
    private static readonly IReadOnlyDictionary<string, string[]> DefaultQueryAliasGroups =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["gift_cards"] = ["giftcard", "giftcards", "gift card", "gift cards", "egift card", "egift cards", "merchant gift cards", "prepaid cards", "incentive cards"],
            ["office_furniture"] = ["office furniture", "office furnishings", "office chair", "office chairs", "filing cabinet", "filing cabinets"],
            ["horse_feed"] = ["horse feed", "hay", "grain", "livestock feed"],
            ["projectors"] = ["projectors", "presentation displays", "lcd projector"],
            ["cat_food"] = ["cat food", "feline food", "pet food"],
            ["toilet_paper"] = ["toilet paper", "bath tissue"],
            ["electrical_components"] = ["electrical components", "fuses", "connectors", "wiring"],
        };

    private static readonly IReadOnlyDictionary<string, string[]> DefaultSupplierComparisonExpansionGroups =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["amazon"] = ["amazon web services"],
        };

    private readonly ProcurementAssistantOptions _options;

    public ProcurementAliasCatalog(IOptions<ProcurementAssistantOptions> options)
    {
        _options = options.Value;
    }

    public IReadOnlyList<IReadOnlyList<string>> GetQueryAliasGroups()
    {
        var merged = MergeAliasGroups(
            DefaultQueryAliasGroups,
            _options.QueryAliasGroupsByKey,
            _options.QueryAliasGroups);

        return merged.Values
            .Where(group => group.Length > 0)
            .Select(group => (IReadOnlyList<string>)group)
            .ToArray();
    }

    public IReadOnlyDictionary<string, IReadOnlyList<string>> GetSupplierComparisonExpansionGroups()
    {
        var merged = MergeAliasGroups(
            DefaultSupplierComparisonExpansionGroups,
            _options.SupplierComparisonExpansionGroups,
            []);

        return merged.ToDictionary(
            kvp => ProcurementQueryText.NormalizeSupplierComparable(kvp.Key),
            kvp => (IReadOnlyList<string>)kvp.Value,
            StringComparer.OrdinalIgnoreCase);
    }

    private static Dictionary<string, string[]> MergeAliasGroups(
        IReadOnlyDictionary<string, string[]> defaultGroups,
        IReadOnlyDictionary<string, string[]> configuredGroups,
        IReadOnlyList<string[]> legacyGroups)
    {
        var merged = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var (key, value) in defaultGroups)
        {
            merged[key] = SanitizeTerms(value);
        }

        foreach (var (key, value) in configuredGroups)
        {
            var normalizedKey = NormalizeGroupKey(key, value);
            if (!string.IsNullOrWhiteSpace(normalizedKey))
            {
                merged[normalizedKey] = SanitizeTerms(value);
            }
        }

        foreach (var legacyGroup in legacyGroups)
        {
            var normalizedKey = NormalizeGroupKey(null, legacyGroup);
            if (!string.IsNullOrWhiteSpace(normalizedKey))
            {
                merged[normalizedKey] = SanitizeTerms(legacyGroup);
            }
        }

        return merged;
    }

    private static string NormalizeGroupKey(string? explicitKey, IReadOnlyList<string> terms)
    {
        if (!string.IsNullOrWhiteSpace(explicitKey))
        {
            return ProcurementQueryText.NormalizeCompacted(explicitKey);
        }

        var firstTerm = terms.FirstOrDefault(term => !string.IsNullOrWhiteSpace(term));
        return string.IsNullOrWhiteSpace(firstTerm)
            ? string.Empty
            : ProcurementQueryText.NormalizeCompacted(firstTerm);
    }

    private static string[] SanitizeTerms(IReadOnlyList<string> terms)
    {
        return terms
            .Where(term => !string.IsNullOrWhiteSpace(term))
            .Select(term => term.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
