using Microsoft.Extensions.Options;

namespace Server.Services;

internal interface IProcurementQueryParser
{
    IReadOnlyList<string> ExpandAliases(string question);

    string? ExtractSupplierCandidate(string question);

    string? ExtractItemCandidate(string question);

    IReadOnlyList<string> ExtractSupplierComparisonCandidates(string question);

    IReadOnlyList<string> ExpandSupplierComparisonQueries(string candidate);
}

internal sealed class ProcurementQueryParser : IProcurementQueryParser
{
    private readonly IProcurementAliasCatalog _aliasCatalog;

    public ProcurementQueryParser(IProcurementAliasCatalog aliasCatalog)
    {
        _aliasCatalog = aliasCatalog;
    }

    internal ProcurementQueryParser(IOptions<ProcurementAssistantOptions> options)
        : this(new ProcurementAliasCatalog(options))
    {
    }

    public IReadOnlyList<string> ExpandAliases(string question)
    {
        var normalizedQuestionTokens = ProcurementQueryText.GetNormalizedTokens(question);
        var expansions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            question.Trim(),
        };

        foreach (var group in _aliasCatalog.GetQueryAliasGroups())
        {
            if (!group.Any(alias => ProcurementQueryText.ContainsNormalizedTermOrPhrase(
                    normalizedQuestionTokens,
                    alias)))
            {
                continue;
            }

            foreach (var alias in group)
            {
                expansions.Add(alias);
            }
        }

        return expansions
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
    }

    public string? ExtractSupplierCandidate(string question) =>
        ProcurementQueryText.ExtractSupplierCandidate(question);

    public string? ExtractItemCandidate(string question) =>
        ProcurementQueryText.ExtractItemCandidate(question);

    public IReadOnlyList<string> ExtractSupplierComparisonCandidates(string question) =>
        ProcurementQueryText.ExtractSupplierComparisonCandidates(question);

    public IReadOnlyList<string> ExpandSupplierComparisonQueries(string candidate)
    {
        var expansions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            candidate.Trim(),
        };

        var comparableCandidate = ProcurementQueryText.NormalizeSupplierComparable(candidate);
        if (_aliasCatalog.GetSupplierComparisonExpansionGroups().TryGetValue(comparableCandidate, out var group))
        {
            foreach (var alias in group)
            {
                expansions.Add(alias);
            }
        }

        return expansions
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
    }
}
