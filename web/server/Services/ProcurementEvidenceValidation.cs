using System.Globalization;

namespace Server.Services;

internal sealed class ProcurementEvidenceCatalog
{
    private readonly Dictionary<string, ProcurementEvidenceAssessmentPayload> _assessments =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, ProcurementCandidateSet> _candidateSets =
        new(StringComparer.OrdinalIgnoreCase);
    private int _nextAssessmentId;
    private int _nextCandidateSetId;

    public IReadOnlyList<ProcurementEvidenceAssessmentPayload> EvidenceAssessments =>
        _assessments.Values
            .OrderBy(assessment => assessment.AssessmentId, StringComparer.OrdinalIgnoreCase)
            .ToArray();

    public string CreateAssessmentId() =>
        $"evidence-{(++_nextAssessmentId).ToString(CultureInfo.InvariantCulture)}";

    public string RegisterCandidateSet(
        string kind,
        string queryText,
        string searchMode,
        IReadOnlyDictionary<string, string> filters,
        object data)
    {
        var id = $"candidate-set-{(++_nextCandidateSetId).ToString(CultureInfo.InvariantCulture)}";
        _candidateSets[id] = new ProcurementCandidateSet
        {
            CandidateSetId = id,
            Data = data,
            Filters = filters,
            Kind = kind,
            QueryText = queryText,
            SearchMode = searchMode,
        };

        return id;
    }

    public ProcurementEvidenceAssessmentPayload StoreAssessment(ProcurementEvidenceAssessmentPayload assessment)
    {
        _assessments[assessment.AssessmentId] = assessment;
        return assessment;
    }

    public bool TryGetAssessment(
        string assessmentId,
        out ProcurementEvidenceAssessmentPayload assessment) =>
        _assessments.TryGetValue(assessmentId, out assessment!);

    public bool TryGetCandidateSet(
        string candidateSetId,
        out ProcurementCandidateSet candidateSet) =>
        _candidateSets.TryGetValue(candidateSetId, out candidateSet!);
}

internal sealed class ProcurementCandidateSet
{
    public string CandidateSetId { get; init; } = string.Empty;

    public object Data { get; init; } = Array.Empty<object>();

    public IReadOnlyDictionary<string, string> Filters { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    public string Kind { get; init; } = string.Empty;

    public string QueryText { get; init; } = string.Empty;

    public string SearchMode { get; init; } = "alias_expanded";
}

internal sealed class ProcurementInferredFindingSummary
{
    public IReadOnlyList<string> ConfirmedFindings { get; init; } = [];

    public IReadOnlyList<string> ExploratoryFindings { get; init; } = [];

    public string OverallConfidence { get; init; } = "unknown";

    public IReadOnlyList<string> SupportingFindings { get; init; } = [];
}

internal static class ProcurementEvidenceValidator
{
    public static ProcurementInferredFindingSummary BuildDefaultFindings(
        IReadOnlyList<ProcurementEvidenceAssessmentPayload> assessments)
    {
        if (assessments.Count == 0)
        {
            return new ProcurementInferredFindingSummary();
        }

        return new ProcurementInferredFindingSummary
        {
            ConfirmedFindings = assessments
                .Where(assessment => string.Equals(assessment.EvidenceState, "validated_evidence", StringComparison.OrdinalIgnoreCase))
                .Select(assessment => assessment.Summary)
                .Where(summary => !string.IsNullOrWhiteSpace(summary))
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
            ExploratoryFindings = assessments
                .Where(assessment => string.Equals(assessment.EvidenceState, "exploratory_findings", StringComparison.OrdinalIgnoreCase))
                .Select(assessment => assessment.Summary)
                .Where(summary => !string.IsNullOrWhiteSpace(summary))
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
            OverallConfidence = DetermineOverallConfidence(assessments),
            SupportingFindings = assessments
                .Where(assessment => string.Equals(assessment.EvidenceState, "supporting_findings", StringComparison.OrdinalIgnoreCase))
                .Select(assessment => assessment.Summary)
                .Where(summary => !string.IsNullOrWhiteSpace(summary))
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
        };
    }

    public static string DetermineOverallConfidence(IReadOnlyList<ProcurementEvidenceAssessmentPayload> assessments)
    {
        if (assessments.Count == 0)
        {
            return "unknown";
        }

        if (assessments.Any(assessment => string.Equals(assessment.Confidence, "high", StringComparison.OrdinalIgnoreCase)))
        {
            return "high";
        }

        if (assessments.Any(assessment => string.Equals(assessment.Confidence, "medium", StringComparison.OrdinalIgnoreCase)))
        {
            return "medium";
        }

        return "low";
    }

    public static ProcurementEvidenceAssessmentPayload Validate(
        string assessmentId,
        IReadOnlyList<ProcurementCandidateSet> candidateSets,
        string? focus,
        string expectedEntityType)
    {
        var effectiveFocus = string.IsNullOrWhiteSpace(focus)
            ? candidateSets.Select(set => set.QueryText).FirstOrDefault(text => !string.IsNullOrWhiteSpace(text)) ?? string.Empty
            : focus.Trim();
        var normalizedFocusTokens = ProcurementQueryText.GetNormalizedTokens(effectiveFocus);
        var signals = new List<string>();
        var confirmedEntities = new List<ProcurementEvidenceEntity>();
        var supportingEntities = new List<ProcurementEvidenceEntity>();
        var confirmedRows = new List<ProcurementEvidenceRow>();
        var supportingRows = new List<ProcurementEvidenceRow>();
        var exploratoryRows = new List<ProcurementEvidenceRow>();

        foreach (var candidateSet in candidateSets)
        {
            switch (candidateSet.Data)
            {
                case IReadOnlyList<ProcurementSupplierSearchHit> supplierHits:
                    EvaluateSupplierCandidates(
                        supplierHits,
                        candidateSet,
                        effectiveFocus,
                        normalizedFocusTokens,
                        signals,
                        confirmedEntities,
                        supportingEntities);
                    break;
                case IReadOnlyList<ProcurementLineItemHit> lineHits:
                    EvaluateLineItemCandidates(
                        lineHits,
                        candidateSet,
                        effectiveFocus,
                        normalizedFocusTokens,
                        signals,
                        confirmedEntities,
                        supportingEntities,
                        confirmedRows,
                        supportingRows,
                        exploratoryRows);
                    break;
                case IReadOnlyList<ProcurementHybridLineHit> hybridHits:
                    EvaluateHybridCandidates(
                        hybridHits,
                        candidateSet,
                        effectiveFocus,
                        normalizedFocusTokens,
                        signals,
                        confirmedEntities,
                        supportingEntities,
                        confirmedRows,
                        supportingRows,
                        exploratoryRows);
                    break;
                case IReadOnlyList<ProcurementHybridItemGroupHit> hybridItemGroupHits:
                    EvaluateHybridItemGroupCandidates(
                        hybridItemGroupHits,
                        candidateSet,
                        effectiveFocus,
                        normalizedFocusTokens,
                        signals,
                        supportingEntities);
                    break;
                case IReadOnlyList<ProcurementItemGroupHit> itemGroupHits:
                    EvaluateItemGroupCandidates(
                        itemGroupHits,
                        candidateSet,
                        effectiveFocus,
                        normalizedFocusTokens,
                        signals,
                        supportingEntities);
                    break;
            }
        }

        AddCrossSourceSignals(confirmedEntities, supportingEntities, candidateSets, signals);
        var suggestedFilters = BuildSuggestedFilters(confirmedEntities, confirmedRows, candidateSets);
        var (confidence, evidenceState) = DetermineEvidenceDisposition(
            confirmedEntities,
            supportingEntities,
            confirmedRows,
            supportingRows,
            candidateSets,
            signals);

        if (signals.Count == 0)
        {
            signals.Add("No retrieval path produced direct corroboration yet.");
        }

        var summary = BuildSummary(
            effectiveFocus,
            evidenceState,
            confirmedEntities,
            supportingEntities,
            confirmedRows,
            supportingRows,
            exploratoryRows);

        return new ProcurementEvidenceAssessmentPayload
        {
            AssessmentId = assessmentId,
            CandidateSetIds = candidateSets.Select(set => set.CandidateSetId).ToArray(),
            Confidence = confidence,
            ConfirmedEntities = confirmedEntities
                .DistinctBy(entity => $"{entity.Kind}:{entity.Id ?? entity.Value}", StringComparer.OrdinalIgnoreCase)
                .ToArray(),
            ConfirmedRows = confirmedRows
                .DistinctBy(row => row.PoLineId, StringComparer.OrdinalIgnoreCase)
                .Take(8)
                .ToArray(),
            EvidenceState = evidenceState,
            ExpectedEntityType = string.IsNullOrWhiteSpace(expectedEntityType) ? "unknown" : expectedEntityType.Trim(),
            ExploratoryRows = exploratoryRows
                .DistinctBy(row => row.PoLineId, StringComparer.OrdinalIgnoreCase)
                .Take(8)
                .ToArray(),
            Focus = effectiveFocus,
            Signals = signals
                .Where(signal => !string.IsNullOrWhiteSpace(signal))
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
            SuggestedFilters = suggestedFilters,
            Summary = summary,
            SupportingEntities = supportingEntities
                .DistinctBy(entity => $"{entity.Kind}:{entity.Id ?? entity.Value}", StringComparer.OrdinalIgnoreCase)
                .ToArray(),
            SupportingRows = supportingRows
                .DistinctBy(row => row.PoLineId, StringComparer.OrdinalIgnoreCase)
                .Take(8)
                .ToArray(),
        };
    }

    private static void AddCrossSourceSignals(
        IReadOnlyList<ProcurementEvidenceEntity> confirmedEntities,
        IReadOnlyList<ProcurementEvidenceEntity> supportingEntities,
        IReadOnlyList<ProcurementCandidateSet> candidateSets,
        IList<string> signals)
    {
        var supplierIds = confirmedEntities
            .Where(entity => string.Equals(entity.Kind, "supplier", StringComparison.OrdinalIgnoreCase))
            .Select(entity => entity.Id ?? entity.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (supplierIds.Length == 1 && candidateSets.Select(set => set.Kind).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1)
        {
            signals.Add($"Multiple retrieval paths converged on supplier {supplierIds[0]}.");
        }

        var categoryValues = confirmedEntities
            .Concat(supportingEntities)
            .Where(entity => string.Equals(entity.Kind, "category", StringComparison.OrdinalIgnoreCase))
            .Select(entity => entity.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .GroupBy(value => value, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToArray();

        foreach (var category in categoryValues)
        {
            signals.Add($"Category alignment repeated across retrieval paths for {category}.");
        }
    }

    private static Dictionary<string, string> BuildSuggestedFilters(
        IReadOnlyList<ProcurementEvidenceEntity> confirmedEntities,
        IReadOnlyList<ProcurementEvidenceRow> confirmedRows,
        IReadOnlyList<ProcurementCandidateSet> candidateSets)
    {
        var filters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var confirmedSupplier = confirmedEntities
            .FirstOrDefault(entity =>
                string.Equals(entity.Kind, "supplier", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(entity.Id));

        if (confirmedSupplier is not null)
        {
            filters["supplierNumber"] = confirmedSupplier.Id!;
            return filters;
        }

        var supplierNumbers = confirmedRows
            .Select(row => row.SupplierNumber)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (supplierNumbers.Length == 1)
        {
            filters["supplierNumber"] = supplierNumbers[0];
            return filters;
        }

        var categoryEntity = confirmedEntities
            .FirstOrDefault(entity =>
                string.Equals(entity.Kind, "category", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(entity.Value));
        if (categoryEntity is not null)
        {
            filters["categoryName"] = categoryEntity.Value;
            return filters;
        }

        var itemGroupEntity = confirmedEntities
            .FirstOrDefault(entity =>
                string.Equals(entity.Kind, "item_group", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(entity.Id));
        if (itemGroupEntity is not null)
        {
            filters["itemGroupId"] = itemGroupEntity.Id!;
            return filters;
        }

        foreach (var candidateSet in candidateSets)
        {
            if (candidateSet.Filters.TryGetValue("supplier_number", out var supplierNumber) ||
                candidateSet.Filters.TryGetValue("supplierNumber", out supplierNumber))
            {
                filters["supplierNumber"] = supplierNumber;
                return filters;
            }

            if (candidateSet.Filters.TryGetValue("category_name", out var categoryName) ||
                candidateSet.Filters.TryGetValue("categoryName", out categoryName))
            {
                filters["categoryName"] = categoryName;
                return filters;
            }
        }

        return filters;
    }

    private static string BuildSummary(
        string focus,
        string evidenceState,
        IReadOnlyList<ProcurementEvidenceEntity> confirmedEntities,
        IReadOnlyList<ProcurementEvidenceEntity> supportingEntities,
        IReadOnlyList<ProcurementEvidenceRow> confirmedRows,
        IReadOnlyList<ProcurementEvidenceRow> supportingRows,
        IReadOnlyList<ProcurementEvidenceRow> exploratoryRows)
    {
        var label = string.IsNullOrWhiteSpace(focus) ? "this question" : focus;
        return evidenceState switch
        {
            "validated_evidence" =>
                $"Validated evidence for {label} includes {confirmedEntities.Count} confirmed entities and {confirmedRows.Count} corroborating rows.",
            "supporting_findings" =>
                $"Supporting findings for {label} are promising but still need tighter validation before being treated as proof.",
            _ =>
                $"Current retrieval for {label} remains exploratory; {supportingEntities.Count + supportingRows.Count + exploratoryRows.Count} results are not yet confirmed evidence.",
        };
    }

    private static (string Confidence, string EvidenceState) DetermineEvidenceDisposition(
        IReadOnlyList<ProcurementEvidenceEntity> confirmedEntities,
        IReadOnlyList<ProcurementEvidenceEntity> supportingEntities,
        IReadOnlyList<ProcurementEvidenceRow> confirmedRows,
        IReadOnlyList<ProcurementEvidenceRow> supportingRows,
        IReadOnlyList<ProcurementCandidateSet> candidateSets,
        IReadOnlyList<string> signals)
    {
        var retrievalPathCount = candidateSets
            .Select(set => set.Kind)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();
        var hasCrossSourceSupport = retrievalPathCount > 1 &&
                                    (confirmedEntities.Count > 0 || confirmedRows.Count > 0) &&
                                    signals.Any(signal => signal.Contains("converged", StringComparison.OrdinalIgnoreCase) ||
                                                          signal.Contains("repeated", StringComparison.OrdinalIgnoreCase));

        if (confirmedEntities.Count > 0 &&
            (confirmedRows.Count >= 2 || supportingRows.Count >= 1 || hasCrossSourceSupport))
        {
            return ("high", "validated_evidence");
        }

        if (confirmedEntities.Count > 0 || confirmedRows.Count > 0 || supportingEntities.Count >= 2 || supportingRows.Count >= 2)
        {
            return ("medium", "supporting_findings");
        }

        return ("low", "exploratory_findings");
    }

    private static void EvaluateSupplierCandidates(
        IReadOnlyList<ProcurementSupplierSearchHit> hits,
        ProcurementCandidateSet candidateSet,
        string focus,
        IReadOnlyList<string> normalizedFocusTokens,
        IList<string> signals,
        IList<ProcurementEvidenceEntity> confirmedEntities,
        IList<ProcurementEvidenceEntity> supportingEntities)
    {
        if (hits.Count == 0)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(focus))
        {
            var filteredSupplierNumbers = hits
                .Select(hit => hit.SupplierNumber)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            if (filteredSupplierNumbers.Length == 1)
            {
                var hit = hits[0];
                confirmedEntities.Add(new ProcurementEvidenceEntity(
                    "supplier",
                    hit.SupplierName,
                    "high",
                    "All supplier-summary rows align to one supplier filter.",
                    hit.SupplierNumber));
                signals.Add($"Supplier drill-down stayed anchored to supplier {hit.SupplierNumber}.");
            }

            return;
        }

        var strongHits = hits
            .Where(hit => ProcurementQueryText.IsStrongSupplierMatch(focus, hit.SupplierName, hit.SupplierNameNorm, hit.Aliases))
            .ToArray();

        if (strongHits.Length == 1)
        {
            var hit = strongHits[0];
            confirmedEntities.Add(new ProcurementEvidenceEntity(
                "supplier",
                hit.SupplierName,
                normalizedFocusTokens.Count > 1 ? "high" : "medium",
                "Supplier summary produced a unique exact or near-exact supplier match.",
                hit.SupplierNumber));
            signals.Add($"Supplier alignment is exact or near-exact for {hit.SupplierName}.");
            return;
        }

        if (strongHits.Length > 1)
        {
            foreach (var hit in strongHits.Take(3))
            {
                supportingEntities.Add(new ProcurementEvidenceEntity(
                    "supplier",
                    hit.SupplierName,
                    "medium",
                    "Multiple supplier summary rows match the candidate and need disambiguation.",
                    hit.SupplierNumber));
            }

            signals.Add("Supplier summary search returned multiple plausible supplier matches.");
            return;
        }

        var topHit = hits[0];
        supportingEntities.Add(new ProcurementEvidenceEntity(
            "supplier",
            topHit.SupplierName,
            candidateSet.SearchMode.Equals("exact", StringComparison.OrdinalIgnoreCase) ? "medium" : "low",
            "Supplier summary returned a candidate but not a strong identity match.",
            topHit.SupplierNumber));
        signals.Add($"Supplier summary returned candidate matches under {candidateSet.SearchMode} retrieval.");
    }

    private static void EvaluateLineItemCandidates(
        IReadOnlyList<ProcurementLineItemHit> hits,
        ProcurementCandidateSet candidateSet,
        string focus,
        IReadOnlyList<string> normalizedFocusTokens,
        IList<string> signals,
        IList<ProcurementEvidenceEntity> confirmedEntities,
        IList<ProcurementEvidenceEntity> supportingEntities,
        IList<ProcurementEvidenceRow> confirmedRows,
        IList<ProcurementEvidenceRow> supportingRows,
        IList<ProcurementEvidenceRow> exploratoryRows)
    {
        foreach (var hit in hits)
        {
            var classification = ClassifyLineEvidence(
                hit,
                hit.Score,
                focus,
                normalizedFocusTokens,
                candidateSet.Filters,
                semanticScore: 0d);

            AddLineEvidence(
                classification,
                confirmedRows,
                supportingRows,
                exploratoryRows);
        }

        AddLineEntitySignals(hits, confirmedRows, supportingRows, signals, confirmedEntities, supportingEntities);
        AddRetrievalModeSignal(candidateSet, signals);
    }

    private static void EvaluateHybridCandidates(
        IReadOnlyList<ProcurementHybridLineHit> hits,
        ProcurementCandidateSet candidateSet,
        string focus,
        IReadOnlyList<string> normalizedFocusTokens,
        IList<string> signals,
        IList<ProcurementEvidenceEntity> confirmedEntities,
        IList<ProcurementEvidenceEntity> supportingEntities,
        IList<ProcurementEvidenceRow> confirmedRows,
        IList<ProcurementEvidenceRow> supportingRows,
        IList<ProcurementEvidenceRow> exploratoryRows)
    {
        foreach (var hit in hits)
        {
            var classification = ClassifyLineEvidence(
                hit.LineItem,
                hit.CombinedScore,
                focus,
                normalizedFocusTokens,
                candidateSet.Filters,
                hit.SemanticScore);

            AddLineEvidence(
                classification,
                confirmedRows,
                supportingRows,
                exploratoryRows);
        }

        AddLineEntitySignals(
            hits.Select(hit => hit.LineItem).ToArray(),
            confirmedRows,
            supportingRows,
            signals,
            confirmedEntities,
            supportingEntities);

        if (hits.Any(hit => hit.SemanticScore > hit.LexicalScore))
        {
            signals.Add("Semantic neighbors contributed to this candidate set and require corroboration from exact fields.");
        }

        AddRetrievalModeSignal(candidateSet, signals);
    }

    private static void EvaluateHybridItemGroupCandidates(
        IReadOnlyList<ProcurementHybridItemGroupHit> hits,
        ProcurementCandidateSet candidateSet,
        string focus,
        IReadOnlyList<string> normalizedFocusTokens,
        IList<string> signals,
        IList<ProcurementEvidenceEntity> supportingEntities)
    {
        EvaluateItemGroupCandidates(
            hits.Select(hit => hit.ItemGroup).ToArray(),
            candidateSet,
            focus,
            normalizedFocusTokens,
            signals,
            supportingEntities);

        if (hits.Any(hit => hit.SemanticScore > hit.LexicalScore))
        {
            signals.Add("Semantic rollup neighbors contributed to this candidate set and should be checked against example rows or exact filters.");
        }
    }

    private static void EvaluateItemGroupCandidates(
        IReadOnlyList<ProcurementItemGroupHit> hits,
        ProcurementCandidateSet candidateSet,
        string focus,
        IReadOnlyList<string> normalizedFocusTokens,
        IList<string> signals,
        IList<ProcurementEvidenceEntity> supportingEntities)
    {
        foreach (var hit in hits.Take(5))
        {
            var exactNameMatch = !string.IsNullOrWhiteSpace(focus) &&
                                 MatchesPhrase(hit.ItemGroupName, focus);
            var descriptionCoverage = ComputeTokenCoverage(
                normalizedFocusTokens,
                ProcurementQueryText.GetNormalizedTokens(hit.ItemGroupDescription ?? string.Empty));

            if (exactNameMatch || descriptionCoverage >= 0.6d)
            {
                supportingEntities.Add(new ProcurementEvidenceEntity(
                    "item_group",
                    hit.ItemGroupName ?? hit.ItemGroupDescription ?? hit.ItemGroupId,
                    "medium",
                    "Rollup item-group evidence aligns with the query concept and can anchor non-supplier analysis.",
                    hit.ItemGroupId));

                if (!string.IsNullOrWhiteSpace(hit.CategoryName))
                {
                    supportingEntities.Add(new ProcurementEvidenceEntity(
                        "category",
                        hit.CategoryName!,
                        "medium",
                        "Rollup item-group evidence points to a consistent category.",
                        hit.CategoryCode));
                }
            }
        }

        if (supportingEntities.Count > 0)
        {
            signals.Add("Rollup item-group matches provide grouped purchasing evidence but example rows may still be needed for direct proof.");
        }

        AddRetrievalModeSignal(candidateSet, signals);
    }

    private static void AddLineEntitySignals(
        IReadOnlyList<ProcurementLineItemHit> hits,
        IList<ProcurementEvidenceRow> confirmedRows,
        IList<ProcurementEvidenceRow> supportingRows,
        IList<string> signals,
        IList<ProcurementEvidenceEntity> confirmedEntities,
        IList<ProcurementEvidenceEntity> supportingEntities)
    {
        var entityRows = confirmedRows.Count > 0 ? confirmedRows : supportingRows;
        if (entityRows.Count == 0)
        {
            return;
        }

        var supplierGroup = entityRows
            .GroupBy(row => $"{row.SupplierNumber}|{row.SupplierName}", StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .FirstOrDefault();
        if (supplierGroup is not null &&
            supplierGroup.Count() >= 2)
        {
            var first = supplierGroup.First();
            var targetList = confirmedRows.Count > 0 ? confirmedEntities : supportingEntities;
            targetList.Add(new ProcurementEvidenceEntity(
                "supplier",
                first.SupplierName,
                confirmedRows.Count > 0 ? "high" : "medium",
                "Repeated supporting rows align to the same supplier.",
                first.SupplierNumber));
            signals.Add($"Repeated supporting evidence points to supplier {first.SupplierName}.");
        }

        var categoryGroup = entityRows
            .Where(row => !string.IsNullOrWhiteSpace(row.CategoryName))
            .GroupBy(row => row.CategoryName!, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .FirstOrDefault();
        if (categoryGroup is not null &&
            categoryGroup.Count() >= 2)
        {
            var targetList = confirmedRows.Count > 0 ? confirmedEntities : supportingEntities;
            targetList.Add(new ProcurementEvidenceEntity(
                "category",
                categoryGroup.Key,
                confirmedRows.Count > 0 ? "high" : "medium",
                "Multiple rows align to the same category.",
                hits.FirstOrDefault(hit => string.Equals(hit.CategoryName, categoryGroup.Key, StringComparison.OrdinalIgnoreCase))?.CategoryCode));
            signals.Add($"Category alignment repeats across multiple rows for {categoryGroup.Key}.");
        }
    }

    private static void AddLineEvidence(
        (string Bucket, ProcurementEvidenceRow Row) classification,
        IList<ProcurementEvidenceRow> confirmedRows,
        IList<ProcurementEvidenceRow> supportingRows,
        IList<ProcurementEvidenceRow> exploratoryRows)
    {
        switch (classification.Bucket)
        {
            case "confirmed":
                confirmedRows.Add(classification.Row);
                break;
            case "supporting":
                supportingRows.Add(classification.Row);
                break;
            default:
                exploratoryRows.Add(classification.Row);
                break;
        }
    }

    private static void AddRetrievalModeSignal(
        ProcurementCandidateSet candidateSet,
        IList<string> signals)
    {
        if (candidateSet.SearchMode.Equals("fuzzy", StringComparison.OrdinalIgnoreCase))
        {
            signals.Add("Fuzzy retrieval expanded recall, so exact evidence still needs confirmation.");
            return;
        }

        if (candidateSet.SearchMode.Equals("alias_expanded", StringComparison.OrdinalIgnoreCase))
        {
            signals.Add("Alias-expanded retrieval found candidates, but aliases alone do not confirm evidence.");
        }
    }

    private static (string Bucket, ProcurementEvidenceRow Row) ClassifyLineEvidence(
        ProcurementLineItemHit hit,
        double score,
        string focus,
        IReadOnlyList<string> normalizedFocusTokens,
        IReadOnlyDictionary<string, string> filters,
        double semanticScore)
    {
        var reasons = new List<string>();
        var normalizedItemTokens = ProcurementQueryText.GetNormalizedTokens(hit.ItemDescription ?? string.Empty);
        var normalizedPoTokens = ProcurementQueryText.GetNormalizedTokens(hit.PurchaseOrderDescription ?? string.Empty);
        var normalizedCategoryTokens = ProcurementQueryText.GetNormalizedTokens(hit.CategoryName ?? string.Empty);
        var normalizedSupplierTokens = ProcurementQueryText.GetNormalizedTokens(hit.SupplierName);

        var descriptionCoverage = Math.Max(
            ComputeTokenCoverage(normalizedFocusTokens, normalizedItemTokens),
            ComputeTokenCoverage(normalizedFocusTokens, normalizedPoTokens));
        var categoryCoverage = ComputeTokenCoverage(normalizedFocusTokens, normalizedCategoryTokens);
        var supplierCoverage = ComputeTokenCoverage(normalizedFocusTokens, normalizedSupplierTokens);
        var exactItemMatch = !string.IsNullOrWhiteSpace(focus) &&
                             (MatchesPhrase(hit.ItemDescription, focus) || MatchesPhrase(hit.PurchaseOrderDescription, focus));
        var exactCategoryMatch = !string.IsNullOrWhiteSpace(focus) &&
                                 MatchesPhrase(hit.CategoryName, focus);
        var filteredSupplier = TryReadFilter(filters, "supplier_number", "supplierNumber");
        var supplierFilterAligned = !string.IsNullOrWhiteSpace(filteredSupplier) &&
                                    string.Equals(filteredSupplier, hit.SupplierNumber, StringComparison.OrdinalIgnoreCase);

        if (supplierFilterAligned)
        {
            reasons.Add("Supplier filter aligned with every row.");
        }

        if (exactItemMatch)
        {
            reasons.Add("Item description is an exact or near-exact lexical match.");
        }
        else if (descriptionCoverage >= 0.75d)
        {
            reasons.Add("Most query tokens appear in the item description.");
        }

        if (exactCategoryMatch || categoryCoverage >= 0.75d)
        {
            reasons.Add("Category aligns strongly with the query concept.");
        }

        if (supplierCoverage >= 0.75d && normalizedFocusTokens.Count > 0)
        {
            reasons.Add("Supplier name aligns strongly with the query text.");
        }

        if (semanticScore > 0d && semanticScore >= score / 2d)
        {
            reasons.Add("Semantic similarity contributed to retrieval, so corroboration matters.");
        }

        var bucket = "exploratory";
        var confidence = "low";
        if (supplierFilterAligned || exactItemMatch || (descriptionCoverage >= 0.75d && (categoryCoverage >= 0.5d || supplierCoverage >= 0.5d)))
        {
            bucket = "confirmed";
            confidence = "high";
        }
        else if (descriptionCoverage >= 0.5d || exactCategoryMatch || categoryCoverage >= 0.5d || supplierCoverage >= 0.5d)
        {
            bucket = "supporting";
            confidence = "medium";
        }

        return (bucket, new ProcurementEvidenceRow
        {
            CategoryName = hit.CategoryName,
            Confidence = confidence,
            ItemDescription = hit.ItemDescription,
            LineAmount = hit.LineAmount,
            PoLineId = hit.PoLineId,
            PurchaseOrderDescription = hit.PurchaseOrderDescription,
            Reason = reasons.Count == 0 ? "Retrieved row is still exploratory." : string.Join(" ", reasons),
            Score = score,
            SupplierName = hit.SupplierName,
            SupplierNumber = hit.SupplierNumber,
        });
    }

    private static double ComputeTokenCoverage(
        IReadOnlyList<string> focusTokens,
        IReadOnlyList<string> candidateTokens)
    {
        if (focusTokens.Count == 0 || candidateTokens.Count == 0)
        {
            return 0d;
        }

        var distinctFocusTokens = focusTokens
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (distinctFocusTokens.Length == 0)
        {
            return 0d;
        }

        var matches = distinctFocusTokens.Count(token => candidateTokens.Contains(token, StringComparer.Ordinal));
        return (double)matches / distinctFocusTokens.Length;
    }

    private static bool MatchesPhrase(string? value, string focus) =>
        !string.IsNullOrWhiteSpace(value) &&
        !string.IsNullOrWhiteSpace(focus) &&
        ProcurementQueryText.ContainsNormalizedTermOrPhrase(value, focus);

    private static string? TryReadFilter(
        IReadOnlyDictionary<string, string> filters,
        params string[] keys)
    {
        foreach (var key in keys)
        {
            if (filters.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }
}
