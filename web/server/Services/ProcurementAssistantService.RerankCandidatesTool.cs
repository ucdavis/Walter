using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private async Task<ProcurementAgentToolExecutionOutcome> RerankCandidatesToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var candidateSetIds = ReadStringArray(arguments, "candidateSetIds");
        if (candidateSetIds.Count == 0)
        {
            return ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = "candidateSetIds must contain at least one candidate set.",
            });
        }

        var candidateSets = new List<ProcurementCandidateSet>();
        foreach (var candidateSetId in candidateSetIds)
        {
            if (!evidenceCatalog.TryGetCandidateSet(candidateSetId, out var candidateSet))
            {
                return ProcurementAgentToolExecutionOutcome.ToolResult(new
                {
                    error = $"Unknown candidate set `{candidateSetId}`.",
                });
            }

            candidateSets.Add(candidateSet);
        }

        var focus = ProcurementSearchSpecFactory.ReadOptionalString(arguments, "focus")?.Trim();
        if (string.IsNullOrWhiteSpace(focus))
        {
            focus = candidateSets
                .Select(set => set.QueryText)
                .FirstOrDefault(query => !string.IsNullOrWhiteSpace(query))
                ?? string.Empty;
        }

        var expectedEntityType = ProcurementSearchSpecFactory.ReadOptionalString(arguments, "expectedEntityType") ?? "unknown";
        var rerankCandidates = BuildRerankCandidates(candidateSets)
            .Take(12)
            .ToArray();

        var rerankResponse = rerankCandidates.Length == 0
            ? new ProcurementRerankResponse()
            : await TryRerankCandidatesAsync(focus, expectedEntityType, rerankCandidates, cancellationToken)
              ?? new ProcurementRerankResponse
              {
                  Rankings = rerankCandidates
                      .Select(candidate => new ProcurementRerankRanking
                      {
                          CandidateNumber = candidate.CandidateNumber,
                          Keep = false,
                          Reason = "Reranker did not return a usable score for this candidate.",
                          Score = 0,
                      })
                      .ToArray(),
              };

        var assessment = BuildRerankedAssessment(
            evidenceCatalog.CreateAssessmentId(),
            candidateSets,
            rerankCandidates,
            rerankResponse,
            focus,
            expectedEntityType);
        evidenceCatalog.StoreAssessment(assessment);

        var rankingsByCandidateNumber = rerankResponse.Rankings
            .GroupBy(ranking => ranking.CandidateNumber)
            .ToDictionary(
                group => group.Key,
                group => group.OrderByDescending(ranking => ranking.Score).First());
        var rankingPreview = rerankCandidates
            .Select(candidate =>
            {
                rankingsByCandidateNumber.TryGetValue(candidate.CandidateNumber, out var ranking);
                return new
                {
                    candidate.CandidateKind,
                    candidate.CandidateNumber,
                    candidate.CategoryName,
                    keep = ranking?.Keep ?? false,
                    reason = ranking?.Reason ?? "No rerank score returned.",
                    resultId = candidate.ResultId,
                    score = ranking?.Score ?? 0,
                    candidate.SupplierName,
                    title = candidate.Title,
                };
            })
            .OrderByDescending(item => item.score)
            .ThenBy(item => item.CandidateNumber)
            .Take(10)
            .ToArray();

        traceCalls.Add(ProcurementTraceFactory.BuildSyntheticToolTrace(
            "rerank_candidates",
            focus,
            candidateSetIds,
            "Walter re-ranked retrieved candidates before treating them as evidence.",
            SerializeToolResult(new
            {
                assessment.AssessmentId,
                assessment.CandidateSetIds,
                assessment.Confidence,
                assessment.EvidenceState,
                assessment.ExpectedEntityType,
                assessment.Focus,
                rankings = rankingPreview,
                assessment.Signals,
                assessment.SuggestedFilters,
                assessment.Summary,
            }),
            rankingPreview
                .Where(item => item.keep || item.score >= 75)
                .Select(item => item.resultId)
                .Take(5)
                .ToArray()));

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            assessmentId = assessment.AssessmentId,
            assessment.CandidateSetIds,
            assessment.Confidence,
            assessment.ConfirmedEntities,
            assessment.ConfirmedRows,
            assessment.EvidenceState,
            assessment.ExpectedEntityType,
            assessment.ExploratoryRows,
            assessment.Focus,
            rankings = rankingPreview,
            assessment.Signals,
            assessment.SuggestedFilters,
            assessment.Summary,
            assessment.SupportingEntities,
            assessment.SupportingRows,
        });
    }

    private async Task<ProcurementRerankResponse?> TryRerankCandidatesAsync(
        string focus,
        string expectedEntityType,
        IReadOnlyList<ProcurementRerankCandidate> candidates,
        CancellationToken cancellationToken)
    {
        try
        {
            var candidatePayload = candidates
                .Select(candidate => new
                {
                    body = candidate.Body,
                    candidate.CandidateKind,
                    candidate.CandidateNumber,
                    candidate.CategoryName,
                    candidate.ResultId,
                    candidate.SearchMode,
                    candidate.SourceQuery,
                    candidate.SupplierName,
                    candidate.SupplierNumber,
                    title = candidate.Title,
                })
                .ToArray();

            var request = new ProcurementAgentCompletionRequest(
                Model: _options.OpenAiChatModel,
                Messages:
                [
                    ProcurementAgentMessage.System(
                        """
                        You are Walter's procurement retrieval reranker.

                        Score each candidate from 0 to 100 for how directly it helps answer the procurement focus question.

                        Scoring guidance:
                        - Prefer exact or near-exact item, supplier, or category matches over broad adjacency.
                        - Penalize semantic neighbors, noisy category-only matches, and candidates that do not explicitly support the focus.
                        - For "where do we buy X" questions, prioritize candidates that clearly connect X to a supplier.
                        - Rollup item-group evidence is useful for supplier/item patterns, but concrete line items are stronger when they explicitly mention the focus.
                        - Keep only candidates that are genuinely useful evidence, not just plausible search noise.

                        Return valid JSON only.
                        """),
                    ProcurementAgentMessage.User(
                        $"""
                         Focus question: {focus}
                         Expected entity type: {expectedEntityType}

                         Candidates to rerank:
                         {JsonSerializer.Serialize(candidatePayload, JsonOptions)}
                         """),
                ],
                Tools: [],
                ReasoningEffort: _options.OpenAiReasoningEffort,
                ResponseFormatName: "procurement_candidate_rerank",
                ResponseFormatJsonSchema: BuildRerankResponseSchema());

            var completion = await _agentModelClient.CompleteAsync(request, cancellationToken);
            if (string.IsNullOrWhiteSpace(completion.Content))
            {
                return null;
            }

            return JsonSerializer.Deserialize<ProcurementRerankResponse>(completion.Content, JsonOptions);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Procurement reranker failed for focus {Focus}.", focus);
            return null;
        }
    }

    private ProcurementEvidenceAssessmentPayload BuildRerankedAssessment(
        string assessmentId,
        IReadOnlyList<ProcurementCandidateSet> candidateSets,
        IReadOnlyList<ProcurementRerankCandidate> candidates,
        ProcurementRerankResponse rerankResponse,
        string focus,
        string expectedEntityType)
    {
        var rankingsByCandidateNumber = rerankResponse.Rankings
            .GroupBy(ranking => ranking.CandidateNumber)
            .ToDictionary(
                group => group.Key,
                group => group.OrderByDescending(ranking => ranking.Score).First());

        var ordered = candidates
            .Select(candidate =>
            {
                rankingsByCandidateNumber.TryGetValue(candidate.CandidateNumber, out var ranking);
                return new
                {
                    Candidate = candidate,
                    Ranking = ranking ?? new ProcurementRerankRanking
                    {
                        CandidateNumber = candidate.CandidateNumber,
                        Keep = false,
                        Reason = "No rerank score returned.",
                        Score = 0,
                    },
                };
            })
            .OrderByDescending(item => item.Ranking.Score)
            .ThenByDescending(item => item.Candidate.SearchScore)
            .ThenBy(item => item.Candidate.CandidateNumber)
            .ToArray();

        var confirmedEntities = new List<ProcurementEvidenceEntity>();
        var supportingEntities = new List<ProcurementEvidenceEntity>();
        var confirmedRows = new List<ProcurementEvidenceRow>();
        var supportingRows = new List<ProcurementEvidenceRow>();
        var exploratoryRows = new List<ProcurementEvidenceRow>();
        var signals = new List<string>();

        foreach (var item in ordered)
        {
            if (item.Ranking.Score >= 90)
            {
                AppendRerankedEvidence(
                    item.Candidate,
                    item.Ranking,
                    "high",
                    confirmedEntities,
                    confirmedRows);
            }
            else if (item.Ranking.Keep || item.Ranking.Score >= 75)
            {
                AppendRerankedEvidence(
                    item.Candidate,
                    item.Ranking,
                    "medium",
                    supportingEntities,
                    supportingRows);
            }
            else if (item.Ranking.Score >= 60)
            {
                AppendExploratoryEvidence(item.Candidate, item.Ranking, exploratoryRows);
            }
        }

        var keptCount = ordered.Count(item => item.Ranking.Keep || item.Ranking.Score >= 75);
        if (ordered.Length == 0)
        {
            signals.Add("No candidates were available to rerank.");
        }
        else
        {
            signals.Add($"Reranker kept {keptCount} of {ordered.Length} candidates at score 75 or above.");
            signals.Add($"Top reranked candidate scored {ordered[0].Ranking.Score} for {ordered[0].Candidate.Title}.");
        }

        if (candidateSets.Any(set => set.SearchMode.Equals("alias_expanded", StringComparison.OrdinalIgnoreCase) ||
                                     set.SearchMode.Equals("fuzzy", StringComparison.OrdinalIgnoreCase)))
        {
            signals.Add("Reranking narrowed a broad retrieval set before answer generation.");
        }

        var suggestedFilters = BuildSuggestedFiltersFromRerankedEvidence(confirmedEntities, supportingEntities, confirmedRows, supportingRows);
        var topScore = ordered.Length > 0 ? ordered[0].Ranking.Score : 0;
        var (confidence, evidenceState) = DetermineRerankedDisposition(topScore, confirmedEntities, confirmedRows, supportingEntities, supportingRows);
        var summary = BuildRerankedSummary(focus, evidenceState, ordered.Length, keptCount);

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
            Focus = focus,
            Signals = signals.ToArray(),
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

    private static IEnumerable<ProcurementRerankCandidate> BuildRerankCandidates(
        IReadOnlyList<ProcurementCandidateSet> candidateSets)
    {
        var nextCandidateNumber = 1;

        foreach (var candidateSet in candidateSets)
        {
            switch (candidateSet.Data)
            {
                case IReadOnlyList<ProcurementSupplierSearchHit> supplierHits:
                    foreach (var hit in supplierHits.Take(6))
                    {
                        yield return new ProcurementRerankCandidate(
                            nextCandidateNumber++,
                            candidateSet.CandidateSetId,
                            "supplier_summary",
                            hit.SupplierNumber,
                            candidateSet.SearchMode,
                            candidateSet.QueryText,
                            hit.SupplierName,
                            $"Aliases: {string.Join(", ", hit.Aliases)}. Top categories: {string.Join(", ", hit.TopCategories)}. Top item terms: {string.Join(", ", hit.TopItemTerms)}. Total amount: {ProcurementQueryText.FormatCurrency(hit.TotalAmount)}. Line count: {ProcurementQueryText.FormatInteger(hit.LineCount)}.",
                            hit.SupplierNumber,
                            hit.SupplierName,
                            hit.TopCategories.FirstOrDefault(),
                            hit.TotalAmount,
                            hit.Score,
                            hit);
                    }

                    break;
                case IReadOnlyList<ProcurementItemGroupHit> itemGroupHits:
                    foreach (var hit in itemGroupHits.Take(6))
                    {
                        yield return new ProcurementRerankCandidate(
                            nextCandidateNumber++,
                            candidateSet.CandidateSetId,
                            "item_group",
                            hit.ItemGroupId,
                            candidateSet.SearchMode,
                            candidateSet.QueryText,
                            $"{hit.ItemGroupName ?? hit.ItemGroupDescription ?? hit.ItemGroupId} / {hit.SupplierName}",
                            $"PO examples: {hit.ItemGroupDescription ?? "none"}. Category: {hit.CategoryName ?? "unknown"}. Total amount: {ProcurementQueryText.FormatCurrency(hit.TotalAmount)}. Line count: {ProcurementQueryText.FormatInteger(hit.LineCount)}. Supplier: {hit.SupplierName} ({hit.SupplierNumber}).",
                            hit.SupplierNumber,
                            hit.SupplierName,
                            hit.CategoryName,
                            hit.TotalAmount,
                            hit.Score,
                            hit);
                    }

                    break;
                case IReadOnlyList<ProcurementLineItemHit> lineItemHits:
                    foreach (var hit in lineItemHits.Take(6))
                    {
                        yield return new ProcurementRerankCandidate(
                            nextCandidateNumber++,
                            candidateSet.CandidateSetId,
                            "line_item",
                            hit.PoLineId,
                            candidateSet.SearchMode,
                            candidateSet.QueryText,
                            $"{hit.ItemDescription ?? hit.PurchaseOrderDescription ?? hit.PoLineId} / {hit.SupplierName}",
                            $"Item description: {hit.ItemDescription ?? "none"}. PO description: {hit.PurchaseOrderDescription ?? "none"}. Category: {hit.CategoryName ?? "unknown"}. Amount: {ProcurementQueryText.FormatCurrency(hit.LineAmount)}. Date: {hit.PurchaseDate ?? "unknown"}. Supplier: {hit.SupplierName} ({hit.SupplierNumber}).",
                            hit.SupplierNumber,
                            hit.SupplierName,
                            hit.CategoryName,
                            hit.LineAmount,
                            hit.Score,
                            hit);
                    }

                    break;
                case IReadOnlyList<ProcurementHybridItemGroupHit> hybridItemGroupHits:
                    foreach (var hit in hybridItemGroupHits.Take(6))
                    {
                        yield return new ProcurementRerankCandidate(
                            nextCandidateNumber++,
                            candidateSet.CandidateSetId,
                            "hybrid_item_group",
                            hit.ItemGroup.ItemGroupId,
                            candidateSet.SearchMode,
                            candidateSet.QueryText,
                            $"{hit.ItemGroup.ItemGroupName ?? hit.ItemGroup.ItemGroupDescription ?? hit.ItemGroup.ItemGroupId} / {hit.ItemGroup.SupplierName}",
                            $"PO examples: {hit.ItemGroup.ItemGroupDescription ?? "none"}. Category: {hit.ItemGroup.CategoryName ?? "unknown"}. Total amount: {ProcurementQueryText.FormatCurrency(hit.ItemGroup.TotalAmount)}. Line count: {ProcurementQueryText.FormatInteger(hit.ItemGroup.LineCount)}. Lexical score: {hit.LexicalScore:F2}. Semantic score: {hit.SemanticScore:F2}. Supplier: {hit.ItemGroup.SupplierName} ({hit.ItemGroup.SupplierNumber}).",
                            hit.ItemGroup.SupplierNumber,
                            hit.ItemGroup.SupplierName,
                            hit.ItemGroup.CategoryName,
                            hit.ItemGroup.TotalAmount,
                            hit.CombinedScore,
                            hit);
                    }

                    break;
            }
        }
    }

    private static void AppendRerankedEvidence(
        ProcurementRerankCandidate candidate,
        ProcurementRerankRanking ranking,
        string confidence,
        IList<ProcurementEvidenceEntity> entities,
        IList<ProcurementEvidenceRow> rows)
    {
        switch (candidate.SourceData)
        {
            case ProcurementSupplierSearchHit supplierHit:
                entities.Add(new ProcurementEvidenceEntity(
                    "supplier",
                    supplierHit.SupplierName,
                    confidence,
                    ranking.Reason,
                    supplierHit.SupplierNumber));
                break;
            case ProcurementItemGroupHit itemGroupHit:
                AppendItemGroupEvidence(itemGroupHit, ranking, confidence, entities);
                break;
            case ProcurementHybridItemGroupHit hybridItemGroupHit:
                AppendItemGroupEvidence(hybridItemGroupHit.ItemGroup, ranking, confidence, entities);
                break;
            case ProcurementLineItemHit lineItemHit:
                rows.Add(BuildEvidenceRow(lineItemHit, ranking, confidence));
                AppendLineItemEntities(lineItemHit, ranking, confidence, entities);
                break;
            case ProcurementHybridLineHit hybridLineHit:
                rows.Add(BuildEvidenceRow(hybridLineHit.LineItem, ranking, confidence));
                AppendLineItemEntities(hybridLineHit.LineItem, ranking, confidence, entities);
                break;
        }
    }

    private static void AppendExploratoryEvidence(
        ProcurementRerankCandidate candidate,
        ProcurementRerankRanking ranking,
        IList<ProcurementEvidenceRow> exploratoryRows)
    {
        switch (candidate.SourceData)
        {
            case ProcurementLineItemHit lineItemHit:
                exploratoryRows.Add(BuildEvidenceRow(lineItemHit, ranking, "low"));
                break;
            case ProcurementHybridLineHit hybridLineHit:
                exploratoryRows.Add(BuildEvidenceRow(hybridLineHit.LineItem, ranking, "low"));
                break;
        }
    }

    private static void AppendItemGroupEvidence(
        ProcurementItemGroupHit hit,
        ProcurementRerankRanking ranking,
        string confidence,
        IList<ProcurementEvidenceEntity> entities)
    {
        entities.Add(new ProcurementEvidenceEntity(
            "supplier",
            hit.SupplierName,
            confidence,
            ranking.Reason,
            hit.SupplierNumber));
        entities.Add(new ProcurementEvidenceEntity(
            "item_group",
            hit.ItemGroupName ?? hit.ItemGroupDescription ?? hit.ItemGroupId,
            confidence,
            ranking.Reason,
            hit.ItemGroupId));

        if (!string.IsNullOrWhiteSpace(hit.CategoryName))
        {
            entities.Add(new ProcurementEvidenceEntity(
                "category",
                hit.CategoryName!,
                confidence,
                ranking.Reason,
                hit.CategoryCode));
        }
    }

    private static void AppendLineItemEntities(
        ProcurementLineItemHit hit,
        ProcurementRerankRanking ranking,
        string confidence,
        IList<ProcurementEvidenceEntity> entities)
    {
        entities.Add(new ProcurementEvidenceEntity(
            "supplier",
            hit.SupplierName,
            confidence,
            ranking.Reason,
            hit.SupplierNumber));

        if (!string.IsNullOrWhiteSpace(hit.CategoryName))
        {
            entities.Add(new ProcurementEvidenceEntity(
                "category",
                hit.CategoryName!,
                confidence,
                ranking.Reason,
                hit.CategoryCode));
        }
    }

    private static ProcurementEvidenceRow BuildEvidenceRow(
        ProcurementLineItemHit hit,
        ProcurementRerankRanking ranking,
        string confidence) =>
        new()
        {
            CategoryName = hit.CategoryName,
            Confidence = confidence,
            ItemDescription = hit.ItemDescription,
            LineAmount = hit.LineAmount,
            PoLineId = hit.PoLineId,
            PurchaseOrderDescription = hit.PurchaseOrderDescription,
            Reason = ranking.Reason,
            Score = ranking.Score,
            SupplierName = hit.SupplierName,
            SupplierNumber = hit.SupplierNumber,
        };

    private static IReadOnlyDictionary<string, string> BuildSuggestedFiltersFromRerankedEvidence(
        IReadOnlyList<ProcurementEvidenceEntity> confirmedEntities,
        IReadOnlyList<ProcurementEvidenceEntity> supportingEntities,
        IReadOnlyList<ProcurementEvidenceRow> confirmedRows,
        IReadOnlyList<ProcurementEvidenceRow> supportingRows)
    {
        var filters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var supplierNumbers = confirmedEntities
            .Concat(supportingEntities)
            .Where(entity => string.Equals(entity.Kind, "supplier", StringComparison.OrdinalIgnoreCase))
            .Select(entity => entity.Id)
            .Concat(confirmedRows.Select(row => row.SupplierNumber))
            .Concat(supportingRows.Select(row => row.SupplierNumber))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (supplierNumbers.Length == 1)
        {
            filters["supplierNumber"] = supplierNumbers[0]!;
            return filters;
        }

        var itemGroupIds = confirmedEntities
            .Concat(supportingEntities)
            .Where(entity => string.Equals(entity.Kind, "item_group", StringComparison.OrdinalIgnoreCase))
            .Select(entity => entity.Id)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (itemGroupIds.Length == 1)
        {
            filters["itemGroupId"] = itemGroupIds[0]!;
            return filters;
        }

        var categoryNames = confirmedEntities
            .Concat(supportingEntities)
            .Where(entity => string.Equals(entity.Kind, "category", StringComparison.OrdinalIgnoreCase))
            .Select(entity => entity.Value)
            .Concat(confirmedRows.Select(row => row.CategoryName))
            .Concat(supportingRows.Select(row => row.CategoryName))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .GroupBy(value => value!, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .ToArray();
        if (categoryNames.Length > 0 && categoryNames[0].Count() >= 2)
        {
            filters["categoryName"] = categoryNames[0].Key;
        }

        return filters;
    }

    private static (string Confidence, string EvidenceState) DetermineRerankedDisposition(
        int topScore,
        IReadOnlyList<ProcurementEvidenceEntity> confirmedEntities,
        IReadOnlyList<ProcurementEvidenceRow> confirmedRows,
        IReadOnlyList<ProcurementEvidenceEntity> supportingEntities,
        IReadOnlyList<ProcurementEvidenceRow> supportingRows)
    {
        if ((confirmedRows.Count > 0 || confirmedEntities.Count > 0) && topScore >= 90)
        {
            return ("high", "validated_evidence");
        }

        if (supportingRows.Count > 0 || supportingEntities.Count > 0 || topScore >= 75)
        {
            return ("medium", "supporting_findings");
        }

        return ("low", "exploratory_findings");
    }

    private static string BuildRerankedSummary(
        string focus,
        string evidenceState,
        int candidateCount,
        int keptCount)
    {
        var label = string.IsNullOrWhiteSpace(focus) ? "this question" : focus;
        return evidenceState switch
        {
            "validated_evidence" =>
                $"Reranked evidence for {label} kept {keptCount} of {candidateCount} candidates and produced directly usable support.",
            "supporting_findings" =>
                $"Reranked candidates for {label} surfaced promising matches, but the answer still relies on supporting rather than definitive proof.",
            _ =>
                $"Reranked candidates for {label} remained exploratory; {keptCount} of {candidateCount} candidates cleared the usefulness threshold.",
        };
    }

    private static object BuildRerankResponseSchema()
    {
        return new
        {
            type = "object",
            additionalProperties = false,
            required = new[] { "rankings" },
            properties = new
            {
                rankings = new
                {
                    type = "array",
                    items = new
                    {
                        type = "object",
                        additionalProperties = false,
                        required = new[] { "candidateNumber", "keep", "reason", "score" },
                        properties = new
                        {
                            candidateNumber = new { type = "integer" },
                            keep = new { type = "boolean" },
                            reason = new { type = "string" },
                            score = new { type = "integer", minimum = 0, maximum = 100 },
                        },
                    },
                },
            },
        };
    }
}
