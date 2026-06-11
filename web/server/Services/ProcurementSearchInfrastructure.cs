using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Server.Services;

internal interface IProcurementSearchGateway
{
    Task<ProcurementGatewayResult<IReadOnlyList<ProcurementSupplierSearchHit>>> SearchSupplierSummaryAsync(
        ProcurementSupplierSearchSpec spec,
        CancellationToken cancellationToken);

    Task<ProcurementGatewayResult<IReadOnlyList<ProcurementLineItemHit>>> SearchLineItemsAsync(
        ProcurementLineSearchSpec spec,
        CancellationToken cancellationToken);

    Task<ProcurementGatewayResult<IReadOnlyList<ProcurementItemGroupHit>>> SearchItemGroupsAsync(
        ProcurementItemGroupSearchSpec spec,
        CancellationToken cancellationToken);

    Task<ProcurementGatewayResult<IReadOnlyList<ProcurementHybridItemGroupHit>>> HybridSearchItemGroupsAsync(
        ProcurementItemGroupSearchSpec spec,
        IReadOnlyList<float>? embeddingVector,
        CancellationToken cancellationToken);

    Task<ProcurementGatewayResult<ProcurementAggregationResult>> AggregateSpendAsync(
        ProcurementAggregationRequest request,
        CancellationToken cancellationToken);
}

internal interface IProcurementEmbeddingService
{
    Task<IReadOnlyList<float>?> CreateEmbeddingAsync(string text, CancellationToken cancellationToken);
}

internal sealed class ElasticsearchProcurementSearchGateway : IProcurementSearchGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly HttpClient _httpClient;
    private readonly ProcurementAssistantOptions _options;
    private readonly ProcurementElasticsearchRequestFactory _requestFactory;
    private readonly ProcurementElasticsearchResponseParser _responseParser;

    public ElasticsearchProcurementSearchGateway(
        HttpClient httpClient,
        IOptions<ProcurementAssistantOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _requestFactory = new ProcurementElasticsearchRequestFactory(options);
        _responseParser = new ProcurementElasticsearchResponseParser(options);
    }

    public async Task<ProcurementGatewayResult<IReadOnlyList<ProcurementSupplierSearchHit>>> SearchSupplierSummaryAsync(
        ProcurementSupplierSearchSpec spec,
        CancellationToken cancellationToken)
    {
        var payload = _requestFactory.BuildSupplierSearchPayload(spec);

        using var root = await SendElasticsearchRequestAsync(
            _options.SupplierIndexName,
            payload,
            cancellationToken);

        var hits = _responseParser.ParseSupplierHits(root.RootElement);

        return new ProcurementGatewayResult<IReadOnlyList<ProcurementSupplierSearchHit>>(
            "search_supplier_summary",
            spec.QueryText,
            JsonSerializer.Serialize(payload, JsonOptions),
            ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
            hits.Select(hit => hit.SupplierNumber).ToArray(),
            hits);
    }

    public async Task<ProcurementGatewayResult<IReadOnlyList<ProcurementLineItemHit>>> SearchLineItemsAsync(
        ProcurementLineSearchSpec spec,
        CancellationToken cancellationToken)
    {
        var payload = _requestFactory.BuildLineSearchPayload(spec);
        using var root = await SendElasticsearchRequestAsync(
            _options.LineItemIndexName,
            payload,
            cancellationToken);

        var hits = _responseParser.ParseLineItemHits(root.RootElement);

        return new ProcurementGatewayResult<IReadOnlyList<ProcurementLineItemHit>>(
            "search_line_items",
            spec.QueryText,
            JsonSerializer.Serialize(payload, JsonOptions),
            ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
            hits.Select(hit => hit.PoLineId).ToArray(),
            hits);
    }

    public async Task<ProcurementGatewayResult<IReadOnlyList<ProcurementItemGroupHit>>> SearchItemGroupsAsync(
        ProcurementItemGroupSearchSpec spec,
        CancellationToken cancellationToken)
    {
        var payload = _requestFactory.BuildItemGroupSearchPayload(spec);
        using var root = await SendElasticsearchRequestAsync(
            _options.ItemGroupIndexName,
            payload,
            cancellationToken);

        var hits = _responseParser.ParseItemGroupHits(root.RootElement);

        return new ProcurementGatewayResult<IReadOnlyList<ProcurementItemGroupHit>>(
            "search_item_groups",
            spec.QueryText,
            JsonSerializer.Serialize(payload, JsonOptions),
            ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
            hits.Select(hit => hit.ItemGroupId).ToArray(),
            hits);
    }

    public async Task<ProcurementGatewayResult<IReadOnlyList<ProcurementHybridItemGroupHit>>> HybridSearchItemGroupsAsync(
        ProcurementItemGroupSearchSpec spec,
        IReadOnlyList<float>? embeddingVector,
        CancellationToken cancellationToken)
    {
        var lexicalPayload = _requestFactory.BuildItemGroupSearchPayload(spec);
        using var lexicalRoot = await SendElasticsearchRequestAsync(
            _options.ItemGroupIndexName,
            lexicalPayload,
            cancellationToken);

        var lexicalHits = _responseParser.ParseItemGroupHits(lexicalRoot.RootElement);

        var semanticHits = Array.Empty<ProcurementItemGroupHit>();
        object? semanticPayload = null;

        if (embeddingVector is not null &&
            !string.IsNullOrWhiteSpace(_options.ItemGroupEmbeddingField))
        {
            semanticPayload = _requestFactory.BuildSemanticSearchPayload(
                spec.Size,
                _options.ItemGroupEmbeddingField,
                embeddingVector);

            using var semanticRoot = await SendElasticsearchRequestAsync(
                _options.ItemGroupIndexName,
                semanticPayload,
                cancellationToken);

            semanticHits = _responseParser.ParseItemGroupHits(semanticRoot.RootElement).ToArray();
        }

        var lexicalMap = lexicalHits
            .Select((hit, index) => new { hit, index })
            .ToDictionary(
                pair => BuildItemGroupMergeKey(pair.hit),
                pair => new
                {
                    Hit = pair.hit,
                    Score = pair.hit.Score > 0d
                        ? pair.hit.Score
                        : 1d / (pair.index + 1d),
                },
                StringComparer.OrdinalIgnoreCase);

        var semanticMap = semanticHits
            .Select((hit, index) => new { hit, index })
            .ToDictionary(
                pair => BuildItemGroupMergeKey(pair.hit),
                pair => new
                {
                    Hit = pair.hit,
                    Score = pair.hit.Score > 0d
                        ? pair.hit.Score
                        : 1d / (pair.index + 1d),
                },
                StringComparer.OrdinalIgnoreCase);

        var merged = lexicalMap.Keys
            .Union(semanticMap.Keys, StringComparer.OrdinalIgnoreCase)
            .Select(id =>
            {
                lexicalMap.TryGetValue(id, out var lexical);
                semanticMap.TryGetValue(id, out var semantic);
                var itemGroup = lexical?.Hit ?? semantic!.Hit;
                var lexicalScore = lexical?.Score ?? 0d;
                var semanticScore = semantic?.Score ?? 0d;

                return new ProcurementHybridItemGroupHit(
                    itemGroup,
                    CombinedScore: lexicalScore + semanticScore,
                    LexicalScore: lexicalScore,
                    SemanticScore: semanticScore);
            })
            .OrderByDescending(hit => hit.CombinedScore)
            .ThenByDescending(hit => hit.ItemGroup.TotalAmount ?? 0m)
            .Take(spec.Size)
            .ToArray();

        var payload = new Dictionary<string, object?>
        {
            ["lexical"] = lexicalPayload,
            ["semantic"] = semanticPayload,
        };

        return new ProcurementGatewayResult<IReadOnlyList<ProcurementHybridItemGroupHit>>(
            "hybrid_search_item_groups",
            spec.QueryText,
            JsonSerializer.Serialize(payload, JsonOptions),
            ProcurementSearchSpecFactory.BuildFilterSummaries(spec.Filters),
            merged.Select(hit => BuildItemGroupMergeKey(hit.ItemGroup)).ToArray(),
            merged);
    }

    public async Task<ProcurementGatewayResult<ProcurementAggregationResult>> AggregateSpendAsync(
        ProcurementAggregationRequest request,
        CancellationToken cancellationToken)
    {
        var useItemGroupIndex = ShouldUseItemGroupIndexForAggregation(request);
        var payload = _requestFactory.BuildSpendAggregationPayload(request, useItemGroupIndex);

        using var root = await SendElasticsearchRequestAsync(
            useItemGroupIndex ? _options.ItemGroupIndexName : _options.LineItemIndexName,
            payload,
            cancellationToken);

        var result = _responseParser.ParseAggregationResult(root.RootElement, request.BucketType, useItemGroupIndex);

        return new ProcurementGatewayResult<ProcurementAggregationResult>(
            "aggregate_spend",
            request.QueryText,
            JsonSerializer.Serialize(payload, JsonOptions),
            ProcurementSearchSpecFactory.BuildFilterSummaries(request.Filters),
            result.Buckets.Select(bucket => bucket.Key).ToArray(),
            result);
    }

    private string BuildItemGroupMergeKey(ProcurementItemGroupHit hit)
    {
        return string.Join(
            "|",
            hit.SupplierNumber,
            hit.ItemGroupId,
            hit.ItemGroupName ?? string.Empty);
    }

    private bool ShouldUseItemGroupIndexForAggregation(ProcurementAggregationRequest request)
    {
        if (!_options.HasItemGroupIndexConfigured())
        {
            return false;
        }

        if (string.Equals(request.BucketType, "month", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return !request.Filters.ContainsKey(_options.DateField);
    }

    private async Task<JsonDocument> SendElasticsearchRequestAsync(
        string indexName,
        object payload,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_options.ElasticsearchBaseUrl.TrimEnd('/')}/{indexName}/_search")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json"),
        };

        if (!string.IsNullOrWhiteSpace(_options.ElasticsearchApiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("ApiKey", _options.ElasticsearchApiKey.Trim());
        }
        else if (!string.IsNullOrWhiteSpace(_options.ElasticsearchUsername))
        {
            var raw = $"{_options.ElasticsearchUsername}:{_options.ElasticsearchPassword}";
            var encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(raw));
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", encoded);
        }

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
        {
            throw new ProcurementAssistantUnavailableException(
                "The procurement assistant could not authenticate with Elasticsearch. Provide valid ProcurementAssistant Elasticsearch credentials before running queries.");
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new ProcurementAssistantUpstreamException(
                $"Elasticsearch returned {(int)response.StatusCode} for index `{indexName}` while answering the procurement query. {ProcurementElasticsearchResponseParser.BuildElasticsearchErrorDetail(body)}");
        }

        return JsonDocument.Parse(body);
    }
}

internal sealed class OpenAiProcurementEmbeddingService : IProcurementEmbeddingService
{
    private readonly HttpClient _httpClient;
    private readonly ProcurementAssistantOptions _options;

    public OpenAiProcurementEmbeddingService(
        HttpClient httpClient,
        IOptions<ProcurementAssistantOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<IReadOnlyList<float>?> CreateEmbeddingAsync(string text, CancellationToken cancellationToken)
    {
        if (!_options.IsOpenAiEmbeddingConfigured() || string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.OpenAiBaseUrl.TrimEnd('/')}/embeddings")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    input = text,
                    model = _options.OpenAiEmbeddingModel,
                }),
                Encoding.UTF8,
                "application/json"),
        };

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.OpenAiApiKey.Trim());
        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        response.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(body);
        if (!document.RootElement.TryGetProperty("data", out var data) ||
            data.ValueKind != JsonValueKind.Array ||
            data.GetArrayLength() == 0)
        {
            return null;
        }

        var first = data[0];
        if (!first.TryGetProperty("embedding", out var embedding) ||
            embedding.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        return embedding.EnumerateArray()
            .Select(value => value.GetSingle())
            .ToArray();
    }
}

internal static class ProcurementJson
{
    public static decimal? ReadDecimal(JsonElement hit, string fieldName)
    {
        if (!TryReadSourceValue(hit, fieldName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number => value.GetDecimal(),
            JsonValueKind.String when decimal.TryParse(value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null,
        };
    }

    public static IReadOnlyList<string> ReadFlexibleTerms(JsonElement hit, string fieldName)
    {
        if (!TryReadSourceValue(hit, fieldName, out var value))
        {
            return [];
        }

        return value.ValueKind switch
        {
            JsonValueKind.Array => value.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString() ?? string.Empty)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .ToArray(),
            JsonValueKind.String => value.GetString()?
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                ?? [],
            _ => [],
        };
    }

    public static int? ReadInt(JsonElement hit, string fieldName)
    {
        if (!TryReadSourceValue(hit, fieldName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number => value.GetInt32(),
            JsonValueKind.String when int.TryParse(value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null,
        };
    }

    public static string? ReadNullableString(JsonElement hit, string fieldName) =>
        TryReadSourceValue(hit, fieldName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    public static double ReadScore(JsonElement hit) =>
        hit.TryGetProperty("_score", out var score) && score.ValueKind == JsonValueKind.Number
            ? score.GetDouble()
            : 0d;

    public static string ReadString(JsonElement hit, string fieldName) =>
        ReadNullableString(hit, fieldName) ?? string.Empty;

    public static IReadOnlyList<string> ReadStringCollection(JsonElement hit, string fieldName)
    {
        if (!TryReadSourceValue(hit, fieldName, out var value))
        {
            return [];
        }

        if (value.ValueKind == JsonValueKind.Array)
        {
            return value.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString() ?? string.Empty)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .ToArray();
        }

        if (value.ValueKind == JsonValueKind.String)
        {
            var text = value.GetString();
            return string.IsNullOrWhiteSpace(text) ? [] : [text];
        }

        return [];
    }

    private static bool TryReadSourceValue(JsonElement hit, string fieldName, out JsonElement value)
    {
        value = default;
        return hit.TryGetProperty("_source", out var source) &&
               source.TryGetProperty(fieldName, out value);
    }
}
