using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Server.Services;

public interface IProcurementAssistantService
{
    /// <summary>
    /// Answers a procurement question through a model-driven tool loop and returns a traceable UI payload.
    /// </summary>
    Task<ProcurementAssistantResponse> AnswerAsync(
        ProcurementAssistantRequest request,
        CancellationToken cancellationToken);
}

public sealed class ProcurementAssistantUnavailableException : InvalidOperationException
{
    public ProcurementAssistantUnavailableException(string message)
        : base(message)
    {
    }
}

public sealed class ProcurementAssistantUpstreamException : InvalidOperationException
{
    public ProcurementAssistantUpstreamException(string message)
        : base(message)
    {
    }
}

public sealed partial class ProcurementAssistantService : IProcurementAssistantService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly IProcurementAgentModelClient _agentModelClient;
    private readonly IProcurementEmbeddingService _embeddingService;
    private readonly ILogger<ProcurementAssistantService> _logger;
    private readonly ProcurementAssistantOptions _options;
    private readonly IProcurementQueryParser _queryParser;
    private readonly IProcurementSearchGateway _searchGateway;
    private readonly ProcurementSearchSpecFactory _searchSpecFactory;

    internal ProcurementAssistantService(
        IProcurementSearchGateway searchGateway,
        IProcurementEmbeddingService embeddingService,
        IProcurementAgentModelClient agentModelClient,
        IProcurementQueryParser queryParser,
        IOptions<ProcurementAssistantOptions> options,
        ILogger<ProcurementAssistantService> logger)
    {
        _searchGateway = searchGateway;
        _embeddingService = embeddingService;
        _agentModelClient = agentModelClient;
        _queryParser = queryParser;
        _logger = logger;
        _options = options.Value;
        _searchSpecFactory = new ProcurementSearchSpecFactory(queryParser, options);
    }

    public async Task<ProcurementAssistantResponse> AnswerAsync(
        ProcurementAssistantRequest request,
        CancellationToken cancellationToken)
    {
        var question = request.Question?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(question))
        {
            return new ProcurementAssistantResponse
            {
                AnswerText = "Ask a procurement question to explore suppliers, items, categories, or spend.",
                AuditSummary =
                [
                    "No query was provided.",
                ],
                Intent = "unknown",
                IsConfigured = _options.IsElasticsearchConfigured() && _options.IsOpenAiChatConfigured(),
                Question = question,
            };
        }

        var expansions = _queryParser.ExpandAliases(question);
        var traceCalls = new List<ProcurementToolCallTrace>();

        if (!_options.IsElasticsearchConfigured())
        {
            return new ProcurementAssistantResponse
            {
                AnswerText = "The procurement assistant is not configured yet. Set the Elasticsearch base URL plus both index names to enable live answers.",
                AuditSummary =
                [
                    $"Original query: {question}",
                    "The assistant did not run any procurement tools because Elasticsearch is not configured.",
                ],
                Intent = "unknown",
                IsConfigured = false,
                Question = question,
                Trace = request.IncludeTrace
                    ? new ProcurementTracePayload
                    {
                        EntityType = "unknown",
                        FinalAnswerSource = "Configuration guard",
                        InferredIntent = "unknown",
                        OriginalQuery = question,
                        QueryExpansions = expansions,
                        ToolCalls = traceCalls,
                    }
                    : null,
            };
        }

        if (!_options.IsOpenAiChatConfigured())
        {
            return new ProcurementAssistantResponse
            {
                AnswerText = "The procurement assistant agent is not configured yet. Set the OpenAI API key and chat model to enable model-driven tool use.",
                AuditSummary =
                [
                    $"Original query: {question}",
                    "The assistant did not run the model-driven orchestration loop because OpenAI chat configuration is missing.",
                ],
                Intent = "unknown",
                IsConfigured = false,
                Question = question,
                Trace = request.IncludeTrace
                    ? new ProcurementTracePayload
                    {
                        EntityType = "unknown",
                        FinalAnswerSource = "Configuration guard",
                        InferredIntent = "unknown",
                        OriginalQuery = question,
                        QueryExpansions = expansions,
                        ToolCalls = traceCalls,
                    }
                    : null,
            };
        }

        var response = await RunAgentLoopAsync(
            question,
            expansions,
            traceCalls,
            request.IncludeTrace,
            cancellationToken);

        if (response.Trace is not null)
        {
            _logger.LogInformation(
                "Procurement assistant trace for query {Question}: {Trace}",
                question,
                JsonSerializer.Serialize(response.Trace, JsonOptions));
        }

        return response;
    }

    private async Task<ProcurementAssistantResponse> RunAgentLoopAsync(
        string question,
        IReadOnlyList<string> expansions,
        IList<ProcurementToolCallTrace> traceCalls,
        bool includeTrace,
        CancellationToken cancellationToken)
    {
        var evidenceCatalog = new ProcurementEvidenceCatalog();
        var availableTools = BuildToolRegistry(question, expansions, traceCalls, evidenceCatalog, includeTrace);
        var hybridSearchAvailable = availableTools.ContainsKey("hybrid_search_item_groups");
        var itemGroupSearchAvailable = availableTools.ContainsKey("search_item_groups");
        var conversation = new List<ProcurementAgentMessage>
        {
            ProcurementAgentMessage.System(BuildSystemPrompt(hybridSearchAvailable, itemGroupSearchAvailable)),
            ProcurementAgentMessage.User(BuildUserPrompt(question, expansions)),
        };

        for (var step = 0; step < _options.MaxAgentSteps; step++)
        {
            var completion = await _agentModelClient.CompleteAsync(
                new ProcurementAgentCompletionRequest(
                    _options.OpenAiChatModel,
                    conversation,
                    availableTools.Values.Select(tool => tool.Definition).ToArray(),
                    _options.OpenAiReasoningEffort),
                cancellationToken);

            var assistantContent = completion.Content?.Trim();
            if (completion.ToolCalls.Count == 0)
            {
                if (!string.IsNullOrWhiteSpace(assistantContent))
                {
                    return BuildFallbackResponse(
                        question,
                        expansions,
                        traceCalls,
                        evidenceCatalog,
                        includeTrace,
                        assistantContent);
                }

                break;
            }

            conversation.Add(ProcurementAgentMessage.Assistant(
                completion.Content,
                completion.ToolCalls));

            foreach (var toolCall in completion.ToolCalls)
            {
                if (!availableTools.TryGetValue(toolCall.Name, out var tool))
                {
                    conversation.Add(ProcurementAgentMessage.Tool(
                        toolCall.Id,
                        toolCall.Name,
                        SerializeToolResult(new
                        {
                            error = $"Unknown tool `{toolCall.Name}`.",
                        })));
                    continue;
                }

                ProcurementAgentToolExecutionOutcome outcome;
                try
                {
                    using var argumentsDocument = JsonDocument.Parse(
                        string.IsNullOrWhiteSpace(toolCall.ArgumentsJson) ? "{}" : toolCall.ArgumentsJson);
                    outcome = await tool.ExecuteAsync(argumentsDocument.RootElement, cancellationToken);
                }
                catch (JsonException ex)
                {
                    outcome = ProcurementAgentToolExecutionOutcome.ToolResult(new
                    {
                        error = $"Tool arguments were not valid JSON: {ex.Message}",
                    });
                }

                if (outcome.FinalResponse is not null)
                {
                    return outcome.FinalResponse;
                }

                conversation.Add(ProcurementAgentMessage.Tool(
                    toolCall.Id,
                    toolCall.Name,
                    outcome.ToolResultJson));
            }
        }

        throw new ProcurementAssistantUpstreamException(
            "Walter could not converge on a final procurement response within the configured agent step budget.");
    }

    private async Task<ProcurementAggregationResult?> TryAggregateSpendAsync(
        ProcurementAggregationRequest request,
        string reason,
        IList<ProcurementToolCallTrace> traceCalls,
        CancellationToken cancellationToken,
        bool required = false)
    {
        try
        {
            var result = await _searchGateway.AggregateSpendAsync(request, cancellationToken);
            traceCalls.Add(ProcurementTraceFactory.BuildSuccessfulToolTrace(result, reason));

            return result.Data;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(
                ex,
                "Procurement aggregate tool failed for query {QueryText} and bucket {BucketType}.",
                request.QueryText,
                request.BucketType);
            traceCalls.Add(ProcurementTraceFactory.BuildFailedToolTrace(
                "aggregate_spend",
                request.QueryText,
                ProcurementSearchSpecFactory.BuildFilterSummaries(request.Filters),
                reason,
                ex));

            if (required)
            {
                throw new ProcurementAssistantUpstreamException(
                    "Walter could not complete the required Elasticsearch aggregation for that procurement question.");
            }

            return null;
        }
    }

    private async Task<IReadOnlyList<ProcurementSupplierSearchHit>?> TrySearchSupplierSummaryAsync(
        ProcurementSupplierSearchSpec spec,
        string reason,
        IList<ProcurementToolCallTrace> traceCalls,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _searchGateway.SearchSupplierSummaryAsync(spec, cancellationToken);
            traceCalls.Add(ProcurementTraceFactory.BuildSuccessfulToolTrace(result, reason));

            return result.Data;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Procurement supplier summary search failed for query {QueryText}.", spec.QueryText);
            traceCalls.Add(ProcurementTraceFactory.BuildFailedToolTrace(
                "search_supplier_summary",
                spec.QueryText,
                ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
                reason,
                ex));
            return null;
        }
    }

    private async Task<IReadOnlyList<ProcurementItemGroupHit>?> TrySearchItemGroupsAsync(
        ProcurementItemGroupSearchSpec spec,
        string reason,
        IList<ProcurementToolCallTrace> traceCalls,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _searchGateway.SearchItemGroupsAsync(spec, cancellationToken);
            traceCalls.Add(ProcurementTraceFactory.BuildSuccessfulToolTrace(result, reason));

            return result.Data;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Procurement item-group search failed for query {QueryText}.", spec.QueryText);
            traceCalls.Add(ProcurementTraceFactory.BuildFailedToolTrace(
                "search_item_groups",
                spec.QueryText,
                ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
                reason,
                ex));
            return null;
        }
    }

    private async Task<IReadOnlyList<ProcurementLineItemHit>?> TrySearchLineItemsAsync(
        ProcurementLineSearchSpec spec,
        string reason,
        IList<ProcurementToolCallTrace> traceCalls,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _searchGateway.SearchLineItemsAsync(spec, cancellationToken);
            traceCalls.Add(ProcurementTraceFactory.BuildSuccessfulToolTrace(result, reason));

            return result.Data;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Procurement line-item search failed for query {QueryText}.", spec.QueryText);
            traceCalls.Add(ProcurementTraceFactory.BuildFailedToolTrace(
                "search_line_items",
                spec.QueryText,
                ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
                reason,
                ex));
            return null;
        }
    }

    private async Task<IReadOnlyList<ProcurementHybridItemGroupHit>> SearchHybridItemGroupsWithFallbackAsync(
        ProcurementItemGroupSearchSpec spec,
        IReadOnlyList<float>? embedding,
        IList<ProcurementToolCallTrace> traceCalls,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _searchGateway.HybridSearchItemGroupsAsync(spec, embedding, cancellationToken);
            traceCalls.Add(ProcurementTraceFactory.BuildSuccessfulToolTrace(
                result,
                "Agent-selected hybrid rollup search captured lexical matches and semantic neighbors."));

            return result.Data;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(
                ex,
                "Hybrid rollup procurement search failed for query {QueryText}. Falling back to lexical rollup search.",
                spec.QueryText);
            traceCalls.Add(ProcurementTraceFactory.BuildFailedToolTrace(
                "hybrid_search_item_groups",
                spec.QueryText,
                ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
                "Hybrid rollup search is preferred for item-centric and broad questions.",
                ex));

            var lexical = await _searchGateway.SearchItemGroupsAsync(spec, cancellationToken);
            traceCalls.Add(ProcurementTraceFactory.BuildSuccessfulToolTrace(
                lexical,
                "Hybrid rollup search failed, so Walter fell back to lexical rollup search."));

            return lexical.Data
                .Select(hit => new ProcurementHybridItemGroupHit(
                    hit,
                    CombinedScore: hit.Score > 0d ? hit.Score : 1d,
                    LexicalScore: hit.Score > 0d ? hit.Score : 1d,
                    SemanticScore: 0d))
                .ToArray();
        }
    }

    private async Task<IReadOnlyList<float>?> TryCreateEmbeddingAsync(
        string text,
        CancellationToken cancellationToken)
    {
        try
        {
            return await _embeddingService.CreateEmbeddingAsync(text, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Embedding generation failed for procurement query text {Text}.", text);
            return null;
        }
    }

    private static IReadOnlyList<ProcurementChartPayload> SelectFallbackCharts(
        IReadOnlyList<ProcurementChartPayload> charts,
        IReadOnlyList<ProcurementAggregateArtifact> aggregateArtifacts)
    {
        if (charts.Count > 0)
        {
            return charts;
        }

        return aggregateArtifacts
            .Where(artifact =>
                artifact.DefaultChart is not null &&
                artifact.IsAnchored &&
                !string.Equals(artifact.EvidenceState, "exploratory_findings", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(artifact.Confidence, "low", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(artifact.Confidence, "unknown", StringComparison.OrdinalIgnoreCase))
            .OrderBy(artifact => GetChartPreference(artifact.BucketType))
            .Select(artifact => artifact.DefaultChart!)
            .DistinctBy(chart => chart.Title, StringComparer.OrdinalIgnoreCase)
            .Take(2)
            .ToArray();
    }

    private static int GetChartPreference(string bucketType) =>
        bucketType switch
        {
            "category" => 0,
            "supplier" => 1,
            "month" => 2,
            _ => 3,
        };

    private ProcurementAssistantResponse BuildFallbackResponse(
        string question,
        IReadOnlyList<string> expansions,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        bool includeTrace,
        string assistantContent)
    {
        const string finalAnswerSource = "Model narrative without finalize_response";
        var inferredFindings = ProcurementEvidenceValidator.BuildDefaultFindings(evidenceCatalog.EvidenceAssessments);
        return new ProcurementAssistantResponse
        {
            AnswerText = assistantContent,
            AuditSummary = ProcurementTraceFactory.BuildAuditSummary(
                question,
                inferredFindings.OverallConfidence,
                "unknown",
                "unknown",
                null,
                traceCalls,
                finalAnswerSource,
                []),
            Confidence = inferredFindings.OverallConfidence,
            ConfirmedFindings = inferredFindings.ConfirmedFindings,
            ExploratoryFindings = inferredFindings.ExploratoryFindings,
            Intent = "unknown",
            IsConfigured = true,
            Question = question,
            SupportingFindings = inferredFindings.SupportingFindings,
            Trace = includeTrace
                ? ProcurementTraceFactory.BuildTracePayload(
                    question,
                    "unknown",
                    "unknown",
                    null,
                    expansions,
                    evidenceCatalog.EvidenceAssessments,
                    traceCalls,
                    finalAnswerSource)
                : null,
        };
    }

    private static ProcurementResolvedSupplier ToResolvedSupplier(ProcurementSupplierSearchHit supplierHit)
    {
        return new ProcurementResolvedSupplier(
            supplierHit.SupplierNumber,
            supplierHit.SupplierName,
            supplierHit.SupplierNameNorm,
            supplierHit.Aliases,
            supplierHit.TotalAmount,
            supplierHit.LineCount,
            supplierHit.TopCategories,
            supplierHit.TopItemTerms);
    }

    private static string SerializeToolResult(object payload) =>
        JsonSerializer.Serialize(payload, JsonOptions);

    private static string BuildAggregationReason(
        ProcurementAggregationRequest request,
        ProcurementEvidenceAssessmentPayload? assessment)
    {
        if (assessment is null)
        {
            return $"Agent-selected {request.BucketType} aggregation generated chart-ready spend totals from the current candidate set.";
        }

        return
            $"Agent-selected {request.BucketType} aggregation rolled up reranked evidence from {assessment.AssessmentId} using confirmed filters or corroborated entities.";
    }

    private static string InferAggregateConfidence(ProcurementAggregationRequest request) =>
        string.IsNullOrWhiteSpace(request.QueryText) && request.Filters.Count > 0
            ? "medium"
            : "low";

    private static IReadOnlyList<string> ReadStringArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return property.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? string.Empty)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
    }

    private IReadOnlyDictionary<string, string> NormalizeValidationFilters(
        IReadOnlyDictionary<string, string> filters)
    {
        if (filters.Count == 0)
        {
            return filters;
        }

        var normalized = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, value) in filters)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            normalized[key.Trim() switch
            {
                "supplierNumber" or "supplier_number" => _options.SupplierNumberField,
                "supplierName" or "supplier_name" => _options.SupplierNameField,
                "categoryCode" or "category_code" => _options.CategoryCodeField,
                "categoryName" or "category_name" => _options.CategoryNameField,
                "itemGroupId" or "item_group_id" => _options.ItemGroupIdField,
                _ => key.Trim(),
            }] = value;
        }

        return normalized;
    }

    private static object BuildChartsSchema()
    {
        return new
        {
            type = "array",
            items = new
            {
                type = "object",
                additionalProperties = false,
                required = new[] { "data", "kind", "title", "xKey", "yKeys" },
                properties = new
                {
                    data = new
                    {
                        type = "array",
                        items = new
                        {
                            type = "object",
                            additionalProperties = true,
                        },
                    },
                    kind = new { type = "string" },
                    title = new { type = "string" },
                    xKey = new { type = "string" },
                    yKeys = new
                    {
                        type = "array",
                        items = new { type = "string" },
                    },
                },
            },
        };
    }

    private static object BuildFilterSchema()
    {
        return new
        {
            type = "object",
            additionalProperties = new
            {
                type = "string",
            },
        };
    }

    private static object BuildSearchModeSchema()
    {
        return new
        {
            type = "string",
            @enum = new[] { "alias_expanded", "exact", "fuzzy" },
        };
    }

    private static object BuildSummaryCardsSchema()
    {
        return new
        {
            type = "array",
            items = new
            {
                type = "object",
                additionalProperties = false,
                required = new[] { "label", "value" },
                properties = new
                {
                    description = new { type = "string" },
                    label = new { type = "string" },
                    rawValue = new { type = "number" },
                    value = new { type = "string" },
                },
            },
        };
    }

    private static object BuildTableSchema()
    {
        return new
        {
            type = "object",
            additionalProperties = false,
            required = new[] { "columns", "rows", "title" },
            properties = new
            {
                columns = new
                {
                    type = "array",
                    items = new { type = "string" },
                },
                rows = new
                {
                    type = "array",
                    items = new
                    {
                        type = "object",
                        additionalProperties = new { type = "string" },
                    },
                },
                title = new { type = "string" },
            },
        };
    }

    private string BuildSystemPrompt(bool hybridSearchAvailable, bool itemGroupSearchAvailable) =>
        $"""
          You are Walter's procurement analysis agent.

          Your job is to plan and execute a retrieval strategy over procurement indexes, not to force the question into a canned workflow.

          {ProcurementSchemaContextFactory.BuildPromptSummary(_options, hybridSearchAvailable, itemGroupSearchAvailable)}

          Planning expectations:
          - Start from the question's meaning and evidence needs, not from a fixed intent bucket.
          - The final intent label is only a UI summary. It must not determine the retrieval path.
          - Choose among supplier-first, rollup-first, line-example-first, validation-first, aggregation-first, or mixed strategies based on the question.
          - You may call multiple tools in any order that fits the question, and you may refine after seeing noisy or broad results.
          - The system prompt already includes the usual schema summary. Do not call `get_procurement_schema_context` for ordinary questions unless filter aliases, index availability, or field names are genuinely unclear.
          - Treat raw search results as candidate matches unless they are already tightly anchored by an exact supplier resolution or a very specific filter.
          - Use supplier resolution when you need a reliable supplier identity before filtering by supplier number.
          - Use `rerank_candidates` whenever retrieval is broad, fuzzy, alias-expanded, semantic, aggregated, or otherwise not obviously exact.
          - Use rollup item-group or hybrid rollup evidence first when the question asks what we buy, where we buy something, category patterns, or whether a concept appears in purchasing data.
          - For broad item questions, prefer one rollup-first path: `hybrid_search_item_groups` when available, otherwise `search_item_groups`.
          - Use `fuzzy` search mode sparingly and mainly for likely misspellings or OCR-like variants. Clean item tokens such as `gravel` should usually stay non-fuzzy.
          - Use line-item search mainly to fetch example rows for the UI after rollup or supplier evidence is already anchored. Do not use `search_line_items` with the same broad unfiltered query just to measure lexical noise.
          - Use rollup aggregations for totals, rankings, and category breakdowns; use line-item aggregations for monthly trends or when date filters are required.
          - Alias expansions are retrieval hints only. They are not the plan and they are not proof.
          - If the first pass looks semantically adjacent or too broad, refine the query, add filters, or explain the ambiguity.
          - After a low-confidence rerank with no suggested filters, do at most one targeted refinement using the strongest exact phrase surfaced by current candidates; otherwise finalize with explicit ambiguity instead of chaining more broad searches.
          - Avoid issuing both rollup search and line-item search with the same unanchored query text in the same investigation unless you already have a concrete phrase, supplier, item group, or filter to carry forward.
          - Distinguish candidate matches, reranked evidence, and exploratory findings in both your reasoning and your final answer.
          - Preserve uncertainty when the evidence is incomplete, weak, or noisy.
          - When you have enough evidence, call `finalize_response` exactly once.

          Response-shaping rules for `finalize_response`:
          - Keep the existing UI contract stable.
          - intent should usually be one of: supplier_lookup, item_lookup, supplier_ranking, supplier_comparison, time_series_spend, category_lookup, broad_exploration, unknown.
          - confidence should be high, medium, low, or unknown based on the reranked evidence set.
          - confirmedFindings should only include directly supported conclusions.
          - supportingFindings should include findings that are plausible and corroborated but not definitive.
          - exploratoryFindings should hold candidate leads, broad aggregates, or semantically adjacent clues that are not yet validated.
          - charts must be directly renderable by the UI with kind, title, xKey, yKeys, and data.
          - supportingTable should be included when it helps users verify the answer, especially for concrete supplier or item questions.
          - summaryCards should be concise and evidence-backed.
          - finalAnswerSource should mention which tool evidence anchored the answer.
          - auditSummaryNotes should capture ambiguity, broad matches, refinements, fallbacks, or key reasoning checkpoints.
          """;

    private static string BuildUserPrompt(string question, IReadOnlyList<string> expansions)
    {
        return
            $"""
             Procurement question:
             {question}

             Alias expansions available as optional retrieval hints:
             {(expansions.Count == 0 ? "none" : string.Join(", ", expansions))}
             """;
    }

    private sealed record ProcurementAggregateArtifact(
        string BucketType,
        ProcurementChartPayload? DefaultChart,
        ProcurementTablePayload? Table,
        bool IsAnchored,
        string Confidence,
        string EvidenceState);

    private sealed record ProcurementAgentToolHandler(
        ProcurementAgentToolDefinition Definition,
        Func<JsonElement, CancellationToken, Task<ProcurementAgentToolExecutionOutcome>> ExecuteAsync);
}
