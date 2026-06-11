using System.Globalization;
using System.Text.RegularExpressions;

namespace Server.Services;

internal static class ProcurementQueryText
{
    private static readonly HashSet<string> SupplierNoiseTokens = new(StringComparer.Ordinal)
    {
        "CO",
        "COMPANY",
        "CORP",
        "CORPORATION",
        "INC",
        "INCORPORATED",
        "LLC",
        "LLP",
        "LP",
        "LTD",
        "LIMITED",
        "PC",
        "PLC",
        "THE",
    };

    public static bool ContainsAny(string normalizedText, params string[] fragments) =>
        fragments.Any(fragment => normalizedText.Contains(fragment, StringComparison.Ordinal));

    public static bool ContainsNormalizedTermOrPhrase(
        string text,
        string candidate)
    {
        return ContainsNormalizedTermOrPhrase(
            GetNormalizedTokens(text),
            candidate);
    }

    public static string? ExtractSupplierCandidate(string question)
    {
        var normalizedQuestion = NormalizeWhitespaceForParsing(question);
        var match = Regex.Match(
            normalizedQuestion,
            @"\b(?:at|from)\s+(?<entity>.+?)(?:\s+(?:each month|per month|by month|monthly|before|categories|category|top)\b|[?.!,]|$)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        return match.Success
            ? match.Groups["entity"].Value.Trim().Trim('"', '\'')
            : null;
    }

    public static string? ExtractItemCandidate(string question)
    {
        var normalizedQuestion = NormalizeWhitespaceForParsing(question);
        var patterns = new[]
        {
            @"\bwhere do we buy\s+(?<entity>.+?)(?:[?.!]|$)",
            @"\bwho do we buy\s+(?<entity>.+?)\s+from(?:[?.!]|$)",
            @"\bwho do we buy\s+(?<entity>.+?)(?:[?.!]|$)",
            @"\bwhat suppliers do we use for\s+(?<entity>.+?)(?:[?.!]|$)",
            @"\bhave we purchased\s+(?<entity>.+?)\s+before(?:[?.!]|$)",
            @"\bhave we bought\s+(?<entity>.+?)\s+before(?:[?.!]|$)",
            @"\bhave we purchased\s+(?<entity>.+?)(?:[?.!]|$)",
            @"\bgive me the top categories we buy\s+(?:from|for)\s+(?<entity>.+?)(?:[?.!]|$)",
            @"\bwhat do we buy\s+(?:at|from)\s+(?<entity>.+?)(?:[?.!]|$)",
        };

        foreach (var pattern in patterns)
        {
            var match = Regex.Match(normalizedQuestion, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (match.Success)
            {
                return CleanItemEntity(match.Groups["entity"].Value);
            }
        }

        return null;
    }

    public static bool IsSupplierRankingQuestion(string normalizedQuestion)
    {
        if (ContainsAny(normalizedQuestion, "WHO DO WE SPEND THE MOST WITH", "WHO DO WE SPEND MOST WITH"))
        {
            return true;
        }

        var mentionsSupplier = ContainsAny(normalizedQuestion, "SUPPLIER", "SUPPLIERS", "VENDOR", "VENDORS", "MERCHANT", "MERCHANTS");
        var asksForRanking = ContainsAny(normalizedQuestion, "TOP", "MOST", "HIGHEST", "LARGEST");
        var asksAboutSpend = ContainsAny(normalizedQuestion, "SPEND", "TOTAL", "AMOUNT");

        return mentionsSupplier && asksForRanking && asksAboutSpend;
    }

    public static IReadOnlyList<string> ExtractSupplierComparisonCandidates(string question)
    {
        var normalizedQuestion = NormalizeWhitespaceForParsing(question);
        var patterns = new[]
        {
            @"\b(?:spend|spent|buy|bought).+?\b(?:at|from|with)\s+(?<left>.+?)\s+(?:or|vs\.?|versus)\s+(?<right>.+?)(?:[?.!]|$)",
            @"\bcompare\s+(?<left>.+?)\s+(?:and|vs\.?|versus)\s+(?<right>.+?)(?:[?.!]|$)",
            @"\bbetween\s+(?<left>.+?)\s+and\s+(?<right>.+?)(?:[?.!]|$)",
        };

        foreach (var pattern in patterns)
        {
            var match = Regex.Match(normalizedQuestion, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (!match.Success)
            {
                continue;
            }

            var left = CleanComparisonEntity(match.Groups["left"].Value);
            var right = CleanComparisonEntity(match.Groups["right"].Value);
            if (!string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(right))
            {
                return [left, right];
            }
        }

        return [];
    }

    public static string FormatCurrency(decimal? value) =>
        value.HasValue
            ? value.Value.ToString("C", CultureInfo.GetCultureInfo("en-US"))
            : "$0.00";

    public static string FormatInteger(int? value) =>
        value.HasValue
            ? value.Value.ToString("N0", CultureInfo.InvariantCulture)
            : "0";

    public static string FormatInteger(int value) =>
        value.ToString("N0", CultureInfo.InvariantCulture);

    public static string FormatInteger(long value) =>
        value.ToString("N0", CultureInfo.InvariantCulture);

    public static string FormatMonthLabel(string key) =>
        DateTimeOffset.TryParse(
            key,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed.ToString("yyyy-MM", CultureInfo.InvariantCulture)
            : key;

    public static bool IsStrongSupplierMatch(
        string candidate,
        string supplierName,
        string supplierNameNorm,
        IReadOnlyList<string> aliases)
    {
        var normalizedCandidate = Normalize(candidate);
        if (string.Equals(normalizedCandidate, supplierNameNorm, StringComparison.Ordinal))
        {
            return true;
        }

        if (string.Equals(normalizedCandidate, Normalize(supplierName), StringComparison.Ordinal))
        {
            return true;
        }

        if (aliases.Any(alias => string.Equals(normalizedCandidate, Normalize(alias), StringComparison.Ordinal)))
        {
            return true;
        }

        var comparableCandidate = NormalizeSupplierComparable(candidate);
        if (string.IsNullOrWhiteSpace(comparableCandidate))
        {
            return false;
        }

        var comparableSupplierValues = aliases
            .Append(supplierName)
            .Append(supplierNameNorm)
            .Select(NormalizeSupplierComparable)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        if (comparableSupplierValues.Any(value => string.Equals(comparableCandidate, value, StringComparison.Ordinal)))
        {
            return true;
        }

        var candidateTokens = GetSupplierComparableTokens(candidate);
        if (candidateTokens.Length <= 1)
        {
            return false;
        }

        return comparableSupplierValues.Any(value =>
        {
            var supplierTokens = GetSupplierComparableTokens(value);
            return candidateTokens.All(token => supplierTokens.Contains(token, StringComparer.Ordinal));
        });
    }

    public static ProcurementSupplierSearchHit? ResolveSupplierCandidate(
        string candidate,
        IReadOnlyList<ProcurementSupplierSearchHit> hits)
    {
        if (hits.Count == 0)
        {
            return null;
        }

        var exactMatch = hits.FirstOrDefault(hit =>
            IsStrongSupplierMatch(candidate, hit.SupplierName, hit.SupplierNameNorm, hit.Aliases));
        if (exactMatch is not null)
        {
            return exactMatch;
        }

        var candidateTokens = GetSupplierComparableTokens(candidate);
        if (candidateTokens.Length != 1)
        {
            return null;
        }

        var candidateToken = candidateTokens[0];
        var topHit = hits[0];
        var topTokens = GetSupplierComparableTokens(topHit.SupplierNameNorm);
        if (!topTokens.Contains(candidateToken, StringComparer.Ordinal))
        {
            return null;
        }

        var competingHit = hits
            .Skip(1)
            .FirstOrDefault(hit => GetSupplierComparableTokens(hit.SupplierNameNorm).Contains(candidateToken, StringComparer.Ordinal));

        return competingHit is null ? topHit : null;
    }

    public static IReadOnlyList<ProcurementSupplierSearchHit> MatchSupplierComparisonGroup(
        string candidate,
        IReadOnlyList<string> queries,
        IEnumerable<ProcurementSupplierSearchHit> hits)
    {
        var candidateTokens = GetSupplierComparableTokens(candidate);
        var comparableQueries = queries
            .Select(NormalizeSupplierComparable)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return hits
            .Where(hit =>
            {
                if (comparableQueries.Any(query => IsStrongSupplierMatch(query, hit.SupplierName, hit.SupplierNameNorm, hit.Aliases)))
                {
                    return true;
                }

                var hitTokens = GetSupplierComparableTokens(hit.SupplierNameNorm);
                return candidateTokens.Length > 0 && candidateTokens.All(token => hitTokens.Contains(token, StringComparer.Ordinal));
            })
            .DistinctBy(hit => hit.SupplierNumber, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public static string FormatComparisonGroupLabel(string candidate) =>
        candidate.Trim();

    public static string Normalize(string value)
    {
        var upper = value.ToUpperInvariant();
        var stripped = Regex.Replace(upper, @"[^A-Z0-9]+", " ");
        return Regex.Replace(stripped, @"\s+", " ").Trim();
    }

    public static string NormalizeCompacted(string value) =>
        Normalize(value).Replace(" ", string.Empty, StringComparison.Ordinal);

    internal static bool ContainsNormalizedTermOrPhrase(
        IReadOnlyList<string> normalizedTextTokens,
        string candidate)
    {
        var candidateTokens = GetNormalizedTokens(candidate);
        if (candidateTokens.Length == 0 ||
            normalizedTextTokens.Count == 0 ||
            candidateTokens.Length > normalizedTextTokens.Count)
        {
            return false;
        }

        for (var index = 0; index <= normalizedTextTokens.Count - candidateTokens.Length; index++)
        {
            var matches = true;
            for (var candidateIndex = 0; candidateIndex < candidateTokens.Length; candidateIndex++)
            {
                if (!string.Equals(
                        normalizedTextTokens[index + candidateIndex],
                        candidateTokens[candidateIndex],
                        StringComparison.Ordinal))
                {
                    matches = false;
                    break;
                }
            }

            if (matches)
            {
                return true;
            }
        }

        return false;
    }

    internal static string NormalizeSupplierComparable(string value) =>
        string.Join(' ', GetSupplierComparableTokens(value));

    internal static string[] GetNormalizedTokens(string value)
    {
        return Normalize(value)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static string[] GetSupplierComparableTokens(string value)
    {
        return GetNormalizedTokens(value)
            .Where(token => !SupplierNoiseTokens.Contains(token))
            .ToArray();
    }

    private static string NormalizeWhitespaceForParsing(string value) =>
        Regex.Replace(value, @"\s+", " ", RegexOptions.CultureInvariant).Trim();

    private static string CleanItemEntity(string value)
    {
        var cleaned = value.Trim().Trim('"', '\'');
        cleaned = Regex.Replace(cleaned, @"\b(from|at|for|with)\b\s*$", string.Empty, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return Regex.Replace(cleaned, @"\s+", " ").Trim();
    }

    private static string CleanComparisonEntity(string value)
    {
        var cleaned = value.Trim().Trim('"', '\'');
        cleaned = Regex.Replace(cleaned, @"\b(do|we|spend|spent|buy|bought|more|less|with|at|from)\b", " ", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return Regex.Replace(cleaned, @"\s+", " ").Trim();
    }
}
