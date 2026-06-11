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

public sealed class ProcurementAssistantService : IProcurementAssistantService
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

    private Dictionary<string, ProcurementAgentToolHandler> BuildToolRegistry(
        string question,
        IReadOnlyList<string> expansions,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        bool includeTrace)
    {
        var aggregateArtifacts = new List<ProcurementAggregateArtifact>();
        var tools = new Dictionary<string, ProcurementAgentToolHandler>(StringComparer.Ordinal)
        {
            ["get_procurement_schema_context"] = new(
                new ProcurementAgentToolDefinition(
                    "get_procurement_schema_context",
                    "Return the index schema summary, filter aliases, and planning cues for the current procurement question before deciding a retrieval strategy.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new { },
                    }),
                (_, _) => GetProcurementSchemaContextToolAsync(question, traceCalls)),
            ["resolve_supplier_candidate"] = new(
                new ProcurementAgentToolDefinition(
                    "resolve_supplier_candidate",
                    "Resolve a supplier phrase to the strongest supplier summary record when you need supplier identity before filtering line or aggregation queries.",
                    new
                    {
                        type = "object",
                        required = new[] { "candidate" },
                        additionalProperties = false,
                        properties = new
                        {
                            candidate = new
                            {
                                type = "string",
                                description = "The supplier phrase from the user question.",
                            },
                        },
                    }),
                (arguments, cancellationToken) => ResolveSupplierCandidateToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["resolve_supplier_group"] = new(
                new ProcurementAgentToolDefinition(
                    "resolve_supplier_group",
                    "Resolve a supplier comparison candidate into one or more supplier summary records and total them as a group.",
                    new
                    {
                        type = "object",
                        required = new[] { "candidate" },
                        additionalProperties = false,
                        properties = new
                        {
                            candidate = new
                            {
                                type = "string",
                                description = "A supplier group candidate like `amazon` or `fisher scientific`.",
                            },
                        },
                }),
                (arguments, cancellationToken) => ResolveSupplierGroupToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["validate_evidence"] = new(
                new ProcurementAgentToolDefinition(
                    "validate_evidence",
                    "Validate candidate matches before treating them as evidence. Use this after broad, fuzzy, alias-expanded, semantic, or otherwise noisy retrieval.",
                    new
                    {
                        type = "object",
                        required = new[] { "candidateSetIds" },
                        additionalProperties = false,
                        properties = new
                        {
                            candidateSetIds = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            expectedEntityType = new { type = "string" },
                            focus = new { type = "string" },
                        },
                    }),
                (arguments, _) => ValidateEvidenceToolAsync(arguments, traceCalls, evidenceCatalog)),
            ["search_supplier_summary"] = new(
                new ProcurementAgentToolDefinition(
                    "search_supplier_summary",
                    "Search the supplier summary index for supplier candidates or supplier-side context. These are retrieval candidates until identity is validated.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            queryText = new
                            {
                                type = "string",
                                description = "Supplier-oriented search text. Use an empty string for filter-only lookups.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                        },
                    }),
                (arguments, cancellationToken) => SearchSupplierSummaryToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["search_line_items"] = new(
                new ProcurementAgentToolDefinition(
                    "search_line_items",
                    "Fetch concrete example PO rows from the full line-item index after rollup evidence is anchored. Use this to populate example-item tables, not as the default non-supplier discovery path.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            includeSupplierFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Line-item query text. Use an empty string for supplier drill-down evidence.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                            sortByAmountDescending = new { type = "boolean" },
                        },
                    }),
                (arguments, cancellationToken) => SearchLineItemsToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken)),
            ["aggregate_spend"] = new(
                new ProcurementAgentToolDefinition(
                    "aggregate_spend",
                    "Aggregate spend by supplier, category, or month. Prefer validated filters or entities before treating aggregates as authoritative.",
                    new
                    {
                        type = "object",
                        required = new[] { "bucketType" },
                        additionalProperties = false,
                        properties = new
                        {
                            bucketType = new
                            {
                                type = "string",
                                @enum = new[] { "supplier", "category", "month" },
                            },
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            includeSupplierFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Concept to aggregate. Use an empty string for whole-index or filter-only totals.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                            validationId = new { type = "string" },
                        },
                    }),
                (arguments, cancellationToken) => AggregateSpendToolAsync(arguments, traceCalls, evidenceCatalog, aggregateArtifacts, cancellationToken)),
            ["finalize_response"] = new(
                new ProcurementAgentToolDefinition(
                    "finalize_response",
                    "Return the final structured procurement answer for the UI after you have enough tool evidence.",
                    new
                    {
                        type = "object",
                        required = new[] { "answerText", "finalAnswerSource", "intent" },
                        additionalProperties = false,
                        properties = new
                        {
                            answerText = new { type = "string" },
                            auditSummaryNotes = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            charts = BuildChartsSchema(),
                            confidence = new { type = "string" },
                            confirmedFindings = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            entity = new
                            {
                                type = "object",
                                additionalProperties = false,
                                properties = new
                                {
                                    supplierNumber = new { type = "string" },
                                    type = new { type = "string" },
                                    value = new { type = "string" },
                                },
                            },
                            entityType = new { type = "string" },
                            exploratoryFindings = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            finalAnswerSource = new { type = "string" },
                            intent = new { type = "string" },
                            summaryCards = BuildSummaryCardsSchema(),
                            supportingFindings = new
                            {
                                type = "array",
                                items = new { type = "string" },
                            },
                            supportingTable = BuildTableSchema(),
                        },
                    }),
                (arguments, _) => FinalizeResponseToolAsync(arguments, question, expansions, traceCalls, evidenceCatalog, aggregateArtifacts, includeTrace)),
        };

        if (_options.HasItemGroupIndexConfigured())
        {
            tools["search_item_groups"] = new ProcurementAgentToolHandler(
                new ProcurementAgentToolDefinition(
                    "search_item_groups",
                    "Search the rollup item-group index for primary non-supplier evidence, including grouped item descriptions, supplier rollups, and category context.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Concept, item phrase, or grouped purchasing pattern to search in the rollup index.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                        },
                    }),
                (arguments, cancellationToken) => SearchItemGroupsToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken));
        }

        if (_options.EnableHybridSearch && _options.HasItemGroupIndexConfigured())
        {
            tools["hybrid_search_item_groups"] = new ProcurementAgentToolHandler(
                new ProcurementAgentToolDefinition(
                    "hybrid_search_item_groups",
                    "Run lexical plus semantic search over the rollup item-group index for item, category, or concept questions when synonyms or broad descriptions may matter.",
                    new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            filters = BuildFilterSchema(),
                            includeCategoryFields = new { type = "boolean" },
                            includeSupplierFields = new { type = "boolean" },
                            queryText = new
                            {
                                type = "string",
                                description = "Concept to search for in rollup item-group evidence.",
                            },
                            searchMode = BuildSearchModeSchema(),
                            size = new { type = "integer", minimum = 1, maximum = 25 },
                        },
                    }),
                (arguments, cancellationToken) => HybridSearchItemGroupsToolAsync(arguments, traceCalls, evidenceCatalog, cancellationToken));
        }

        return tools;
    }

    private Task<ProcurementAgentToolExecutionOutcome> GetProcurementSchemaContextToolAsync(
        string question,
        IList<ProcurementToolCallTrace> traceCalls)
    {
        var payload = ProcurementSchemaContextFactory.BuildToolPayload(
            question,
            _queryParser,
            _options,
            _options.EnableHybridSearch && _options.HasItemGroupIndexConfigured(),
            _options.HasItemGroupIndexConfigured());
        var payloadJson = SerializeToolResult(payload);

        traceCalls.Add(ProcurementTraceFactory.BuildSyntheticToolTrace(
            "get_procurement_schema_context",
            question,
            [],
            "Walter surfaced schema context and planning cues before or during retrieval planning.",
            payloadJson));

        return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(payload));
    }

    private async Task<ProcurementAgentToolExecutionOutcome> ResolveSupplierCandidateToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var candidate = ProcurementSearchSpecFactory.ReadRequiredString(arguments, "candidate");
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = "candidate is required.",
            });
        }

        var hits = await TrySearchSupplierSummaryAsync(
            new ProcurementSupplierSearchSpec
            {
                ExpandedQueries = _queryParser.ExpandAliases(candidate),
                Filters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                QueryText = candidate,
                Size = _options.DefaultSearchSize,
            },
            "Agent-selected supplier resolution mapped the question onto supplier summary records.",
            traceCalls,
            cancellationToken);

        var resolved = hits is null
            ? null
            : ProcurementQueryText.ResolveSupplierCandidate(candidate, hits);
        var candidateSetId = hits is null
            ? null
            : evidenceCatalog.RegisterCandidateSet(
                "supplier_summary",
                candidate,
                "alias_expanded",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                hits);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidate,
            candidates = hits ?? [],
            candidateSetId,
            confidence = resolved is null ? "low" : "high",
            evidenceState = resolved is null ? "candidate_matches" : "validated_evidence",
            resolvedSupplier = resolved is null ? null : ToResolvedSupplier(resolved),
            validationRecommendation = resolved is null ? "validate_or_refine_supplier_identity" : "supplier_identity_is_anchored",
        });
    }

    private Task<ProcurementAgentToolExecutionOutcome> ValidateEvidenceToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog)
    {
        var candidateSetIds = ReadStringArray(arguments, "candidateSetIds");
        if (candidateSetIds.Count == 0)
        {
            return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = "candidateSetIds must contain at least one candidate set.",
            }));
        }

        var candidateSets = new List<ProcurementCandidateSet>();
        foreach (var candidateSetId in candidateSetIds)
        {
            if (!evidenceCatalog.TryGetCandidateSet(candidateSetId, out var candidateSet))
            {
                return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
                {
                    error = $"Unknown candidate set `{candidateSetId}`.",
                }));
            }

            candidateSets.Add(candidateSet);
        }

        var assessment = ProcurementEvidenceValidator.Validate(
            evidenceCatalog.CreateAssessmentId(),
            candidateSets,
            ProcurementSearchSpecFactory.ReadOptionalString(arguments, "focus"),
            ProcurementSearchSpecFactory.ReadOptionalString(arguments, "expectedEntityType") ?? "unknown");
        evidenceCatalog.StoreAssessment(assessment);

        var payloadJson = SerializeToolResult(assessment);
        traceCalls.Add(ProcurementTraceFactory.BuildSyntheticToolTrace(
            "validate_evidence",
            assessment.Focus,
            candidateSetIds,
            "Walter validated whether the retrieved candidates were strong enough to treat as evidence.",
            payloadJson));

        return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(assessment));
    }

    private async Task<ProcurementAgentToolExecutionOutcome> ResolveSupplierGroupToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var candidate = ProcurementSearchSpecFactory.ReadRequiredString(arguments, "candidate");
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = "candidate is required.",
            });
        }

        var hitsBySupplier = new Dictionary<string, ProcurementSupplierSearchHit>(StringComparer.OrdinalIgnoreCase);
        var queries = _queryParser.ExpandSupplierComparisonQueries(candidate);

        foreach (var query in queries)
        {
            var hits = await TrySearchSupplierSummaryAsync(
                new ProcurementSupplierSearchSpec
                {
                    ExpandedQueries = _queryParser.ExpandAliases(query),
                    Filters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                    QueryText = query,
                    Size = _options.DefaultSearchSize,
                },
                "Agent-selected supplier-group resolution independently resolved a comparison candidate.",
                traceCalls,
                cancellationToken);

            if (hits is null)
            {
                continue;
            }

            foreach (var hit in hits)
            {
                hitsBySupplier.TryAdd(hit.SupplierNumber, hit);
            }
        }

        var matchedSuppliers = ProcurementQueryText.MatchSupplierComparisonGroup(candidate, queries, hitsBySupplier.Values)
            .Select(ToResolvedSupplier)
            .OrderByDescending(supplier => supplier.TotalAmount ?? 0m)
            .ThenByDescending(supplier => supplier.LineCount ?? 0)
            .ToArray();
        var candidateSetId = hitsBySupplier.Count == 0
            ? null
            : evidenceCatalog.RegisterCandidateSet(
                "supplier_summary",
                candidate,
                "alias_expanded",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                hitsBySupplier.Values.ToArray());

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidate,
            candidateSetId,
            displayLabel = ProcurementQueryText.FormatComparisonGroupLabel(candidate),
            evidenceState = matchedSuppliers.Length == 0 ? "candidate_matches" : "validated_evidence",
            supplierGroup = matchedSuppliers.Length == 0
                ? null
                : new ProcurementSupplierComparisonGroup(
                    CandidateLabel: candidate,
                    DisplayLabel: ProcurementQueryText.FormatComparisonGroupLabel(candidate),
                    TotalAmount: matchedSuppliers.Sum(supplier => supplier.TotalAmount ?? 0m),
                    TotalLineCount: matchedSuppliers.Sum(supplier => supplier.LineCount ?? 0),
                    Suppliers: matchedSuppliers),
            validationRecommendation = matchedSuppliers.Length == 0
                ? "refine_comparison_candidates_before_answering"
                : "comparison_group_is_ready_for_anchored_aggregation_or_answering",
        });
    }

    private async Task<ProcurementAgentToolExecutionOutcome> SearchSupplierSummaryToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildSupplierSearchSpec(arguments);
        var hits = await TrySearchSupplierSummaryAsync(
            spec,
            "Agent-selected supplier summary search gathered supplier-level candidates or evidence.",
            traceCalls,
            cancellationToken);
        var candidateSetId = hits is null
            ? null
            : evidenceCatalog.RegisterCandidateSet("supplier_summary", spec.QueryText, spec.SearchMode, spec.Filters, hits);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows = hits ?? [],
            validationRecommendation = "validate_before_using_as_proof",
            table = hits is null ? null : ProcurementResponseFormatter.BuildSupplierTable("Supplier candidates", hits),
        });
    }

    private async Task<ProcurementAgentToolExecutionOutcome> SearchItemGroupsToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildItemGroupSearchSpec(arguments);
        var rows = await TrySearchItemGroupsAsync(
            spec,
            "Agent-selected rollup search pulled grouped non-supplier evidence from the item-group index.",
            traceCalls,
            cancellationToken);
        var candidateSetId = rows is null
            ? null
            : evidenceCatalog.RegisterCandidateSet("item_groups", spec.QueryText, spec.SearchMode, spec.Filters, rows);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows = rows ?? [],
            validationRecommendation = "rollup_results_anchor_non_supplier_analysis_but_still_need_validation_when_broad",
            table = rows is null ? null : ProcurementResponseFormatter.BuildItemGroupTable("Rollup matches", rows),
        });
    }

    private async Task<ProcurementAgentToolExecutionOutcome> SearchLineItemsToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildLineSearchSpec(arguments, includeSemanticSearch: false);
        var rows = await TrySearchLineItemsAsync(
            spec,
            "Agent-selected lexical line-item search fetched concrete example rows from the full item index.",
            traceCalls,
            cancellationToken);
        var candidateSetId = rows is null
            ? null
            : evidenceCatalog.RegisterCandidateSet("line_items", spec.QueryText, spec.SearchMode, spec.Filters, rows);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows = rows ?? [],
            validationRecommendation = string.IsNullOrWhiteSpace(spec.QueryText) && spec.Filters.Count > 0
                ? "already_filter_anchored_but_still_review_rows"
                : "validate_or_refine_before_treating_as_evidence",
            table = rows is null ? null : ProcurementResponseFormatter.BuildLineItemTable("Example items", rows),
        });
    }

    private async Task<ProcurementAgentToolExecutionOutcome> HybridSearchItemGroupsToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        CancellationToken cancellationToken)
    {
        var spec = _searchSpecFactory.BuildItemGroupSearchSpec(arguments);
        var embedding = await TryCreateEmbeddingAsync(spec.QueryText, cancellationToken);
        var rows = await SearchHybridItemGroupsWithFallbackAsync(spec, embedding, traceCalls, cancellationToken);
        var candidateSetId = evidenceCatalog.RegisterCandidateSet(
            "hybrid_item_groups",
            spec.QueryText,
            spec.SearchMode,
            spec.Filters,
            rows);

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            candidateSetId,
            evidenceState = "candidate_matches",
            filters = spec.Filters,
            queryText = spec.QueryText,
            rows,
            validationRecommendation = "semantic_rollup_matches_should_be_validated_before_proof",
            table = ProcurementResponseFormatter.BuildHybridItemGroupTable("Rollup matches", rows),
        });
    }

    private async Task<ProcurementAgentToolExecutionOutcome> AggregateSpendToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        IList<ProcurementAggregateArtifact> aggregateArtifacts,
        CancellationToken cancellationToken)
    {
        var request = _searchSpecFactory.BuildAggregationRequest(arguments);
        var validationId = ProcurementSearchSpecFactory.ReadOptionalString(arguments, "validationId");
        ProcurementEvidenceAssessmentPayload? assessment = null;
        if (!string.IsNullOrWhiteSpace(validationId))
        {
            if (!evidenceCatalog.TryGetAssessment(validationId, out assessment))
            {
                return ProcurementAgentToolExecutionOutcome.ToolResult(new
                {
                    error = $"Unknown validationId `{validationId}`.",
                });
            }

            if (request.Filters.Count == 0 && assessment.SuggestedFilters.Count > 0)
            {
                request = new ProcurementAggregationRequest
                {
                    BucketType = request.BucketType,
                    EnableFuzzyMatching = request.EnableFuzzyMatching,
                    ExpandedQueries = request.ExpandedQueries,
                    Filters = NormalizeValidationFilters(assessment.SuggestedFilters),
                    IncludeCategoryFields = request.IncludeCategoryFields,
                    IncludeSupplierFields = request.IncludeSupplierFields,
                    QueryText = request.QueryText,
                    SearchMode = request.SearchMode,
                    Size = request.Size,
                };
            }
        }

        var result = await TryAggregateSpendAsync(
            request,
            BuildAggregationReason(request, assessment),
            traceCalls,
            cancellationToken);

        var defaultChart = result is null || result.Buckets.Count == 0
            ? null
            : ProcurementResponseFormatter.BuildAggregateChart(
                ProcurementResponseFormatter.GetDefaultChartKind(request.BucketType),
                ProcurementResponseFormatter.BuildAggregateTitle(request.BucketType),
                result.Buckets);
        var table = result is null
            ? null
            : ProcurementResponseFormatter.BuildAggregateTable(
                ProcurementResponseFormatter.BuildAggregateTitle(request.BucketType),
                result.Buckets);

        if (result is not null)
        {
            aggregateArtifacts.Add(new ProcurementAggregateArtifact(
                request.BucketType,
                defaultChart,
                table,
                assessment is not null,
                assessment?.Confidence ?? InferAggregateConfidence(request),
                assessment?.EvidenceState ?? "exploratory_findings"));
        }

        return ProcurementAgentToolExecutionOutcome.ToolResult(new
        {
            anchoredValidation = assessment is null
                ? null
                : new
                {
                    assessment.AssessmentId,
                    assessment.Confidence,
                    assessment.EvidenceState,
                    assessment.SuggestedFilters,
                    assessment.Summary,
                },
            confidence = assessment?.Confidence ?? InferAggregateConfidence(request),
            evidenceState = assessment is null ? "exploratory_findings" : assessment.EvidenceState,
            request.BucketType,
            defaultChart,
            queryText = request.QueryText,
            result,
            table,
            validationRecommendation = assessment is null && !string.IsNullOrWhiteSpace(request.QueryText)
                ? "confirm_evidence_before_treating_broad_aggregate_as_proof"
                : null,
        });
    }

    private Task<ProcurementAgentToolExecutionOutcome> FinalizeResponseToolAsync(
        JsonElement arguments,
        string question,
        IReadOnlyList<string> expansions,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        IReadOnlyList<ProcurementAggregateArtifact> aggregateArtifacts,
        bool includeTrace)
    {
        try
        {
            var finalArgs = JsonSerializer.Deserialize<ProcurementFinalResponseArguments>(
                arguments.GetRawText(),
                JsonOptions);

            if (finalArgs is null ||
                string.IsNullOrWhiteSpace(finalArgs.AnswerText) ||
                string.IsNullOrWhiteSpace(finalArgs.Intent) ||
                string.IsNullOrWhiteSpace(finalArgs.FinalAnswerSource))
            {
                return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
                {
                    error = "answerText, intent, and finalAnswerSource are required.",
                }));
            }

            var inferredFindings = ProcurementEvidenceValidator.BuildDefaultFindings(evidenceCatalog.EvidenceAssessments);
            var confidence = string.IsNullOrWhiteSpace(finalArgs.Confidence)
                ? inferredFindings.OverallConfidence
                : finalArgs.Confidence.Trim();
            var fallbackCharts = SelectFallbackCharts(finalArgs.Charts, aggregateArtifacts);
            var auditSummaryNotes = fallbackCharts.Count == finalArgs.Charts.Count
                ? finalArgs.AuditSummaryNotes
                : finalArgs.AuditSummaryNotes
                    .Append("Walter auto-included anchored aggregate chart output because the final response omitted charts.")
                    .ToArray();
            var response = new ProcurementAssistantResponse
            {
                AnswerText = finalArgs.AnswerText.Trim(),
                AuditSummary = ProcurementTraceFactory.BuildAuditSummary(
                    question,
                    confidence,
                    finalArgs.Intent.Trim(),
                    finalArgs.Entity?.Type ?? finalArgs.EntityType ?? "unknown",
                    finalArgs.Entity?.Value,
                    traceCalls,
                    finalArgs.FinalAnswerSource.Trim(),
                    auditSummaryNotes),
                Charts = fallbackCharts,
                Confidence = confidence,
                ConfirmedFindings = finalArgs.ConfirmedFindings.Count == 0
                    ? inferredFindings.ConfirmedFindings
                    : finalArgs.ConfirmedFindings,
                Entity = finalArgs.Entity,
                ExploratoryFindings = finalArgs.ExploratoryFindings.Count == 0
                    ? inferredFindings.ExploratoryFindings
                    : finalArgs.ExploratoryFindings,
                Intent = finalArgs.Intent.Trim(),
                IsConfigured = true,
                Question = question,
                SummaryCards = finalArgs.SummaryCards ?? [],
                SupportingFindings = finalArgs.SupportingFindings.Count == 0
                    ? inferredFindings.SupportingFindings
                    : finalArgs.SupportingFindings,
                SupportingTable = finalArgs.SupportingTable,
                Trace = includeTrace
                    ? ProcurementTraceFactory.BuildTracePayload(
                        question,
                        finalArgs.Intent.Trim(),
                        finalArgs.Entity?.Type ?? finalArgs.EntityType ?? "unknown",
                        finalArgs.Entity?.Value,
                        expansions,
                        evidenceCatalog.EvidenceAssessments,
                        traceCalls,
                        finalArgs.FinalAnswerSource.Trim())
                    : null,
            };

            return Task.FromResult(ProcurementAgentToolExecutionOutcome.Final(response));
        }
        catch (JsonException ex)
        {
            return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = $"Could not parse finalize_response arguments: {ex.Message}",
            }));
        }
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
            $"Agent-selected {request.BucketType} aggregation rolled up validated evidence from {assessment.AssessmentId} using confirmed filters or corroborated entities.";
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
          - Use `get_procurement_schema_context` if you need a compact schema reminder or planning cues.
          - Treat raw search results as candidate matches unless they are already tightly anchored by an exact supplier resolution or a very specific filter.
          - Use supplier resolution when you need a reliable supplier identity before filtering by supplier number.
          - Use `validate_evidence` whenever retrieval is broad, fuzzy, alias-expanded, semantic, aggregated, or otherwise not obviously exact.
          - Use rollup item-group or hybrid rollup evidence first when the question asks what we buy, where we buy something, category patterns, or whether a concept appears in purchasing data.
          - Use line-item search mainly to fetch example rows for the UI after rollup or supplier evidence is already anchored.
          - Use rollup aggregations for totals, rankings, and category breakdowns; use line-item aggregations for monthly trends or when date filters are required.
          - Alias expansions are retrieval hints only. They are not the plan and they are not proof.
          - If the first pass looks semantically adjacent or too broad, refine the query, add filters, or explain the ambiguity.
          - Distinguish candidate matches, validated evidence, and exploratory findings in both your reasoning and your final answer.
          - Preserve uncertainty when the evidence is incomplete, weak, or noisy.
          - When you have enough evidence, call `finalize_response` exactly once.

          Response-shaping rules for `finalize_response`:
          - Keep the existing UI contract stable.
          - intent should usually be one of: supplier_lookup, item_lookup, supplier_ranking, supplier_comparison, time_series_spend, category_lookup, broad_exploration, unknown.
          - confidence should be high, medium, low, or unknown based on the validated evidence set.
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
