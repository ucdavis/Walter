using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Server.Services;

internal interface IProcurementAgentModelClient
{
    Task<ProcurementAgentCompletionResult> CompleteAsync(
        ProcurementAgentCompletionRequest request,
        CancellationToken cancellationToken);
}

internal sealed class OpenAiProcurementAgentModelClient : IProcurementAgentModelClient
{
    private readonly HttpClient _httpClient;
    private readonly ProcurementAssistantOptions _options;

    public OpenAiProcurementAgentModelClient(
        HttpClient httpClient,
        IOptions<ProcurementAssistantOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<ProcurementAgentCompletionResult> CompleteAsync(
        ProcurementAgentCompletionRequest request,
        CancellationToken cancellationToken)
    {
        return await CompleteWithChatCompletionsAsync(
            request,
            includeReasoningEffort: !string.IsNullOrWhiteSpace(request.ReasoningEffort),
            cancellationToken);
    }

    private async Task<ProcurementAgentCompletionResult> CompleteWithChatCompletionsAsync(
        ProcurementAgentCompletionRequest request,
        bool includeReasoningEffort,
        CancellationToken cancellationToken)
    {
        using var httpRequest = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_options.OpenAiBaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(BuildPayload(request, includeReasoningEffort)),
                Encoding.UTF8,
                "application/json"),
        };

        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.OpenAiApiKey.Trim());

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
        {
            throw new ProcurementAssistantUnavailableException(
                "The procurement assistant could not authenticate with OpenAI. Provide a valid OpenAI API key before running spend-analysis queries.");
        }

        if (!response.IsSuccessStatusCode)
        {
            if (includeReasoningEffort && ShouldRetryWithoutReasoningEffort(body))
            {
                return await CompleteWithChatCompletionsAsync(
                    request,
                    includeReasoningEffort: false,
                    cancellationToken);
            }

            throw new ProcurementAssistantUpstreamException(
                $"OpenAI returned {(int)response.StatusCode} while Walter was orchestrating procurement tools. {BuildOpenAiErrorDetail(body)}");
        }

        using var document = JsonDocument.Parse(body);
        if (!document.RootElement.TryGetProperty("choices", out var choices) ||
            choices.ValueKind != JsonValueKind.Array ||
            choices.GetArrayLength() == 0)
        {
            throw new ProcurementAssistantUpstreamException(
                "OpenAI returned an empty completion while Walter was orchestrating procurement tools.");
        }

        var message = choices[0].GetProperty("message");
        return new ProcurementAgentCompletionResult
        {
            Content = ReadMessageContent(message),
            ToolCalls = ReadToolCalls(message),
        };
    }

    private object BuildPayload(ProcurementAgentCompletionRequest request, bool includeReasoningEffort)
    {
        var payload = new Dictionary<string, object?>
        {
            ["model"] = request.Model,
            ["messages"] = request.Messages.Select(BuildMessagePayload).ToArray(),
            ["tool_choice"] = "auto",
            ["tools"] = request.Tools.Select(tool => new
            {
                type = "function",
                function = new
                {
                    name = tool.Name,
                    description = tool.Description,
                    parameters = tool.ParametersJsonSchema,
                },
            }).ToArray(),
        };

        if (includeReasoningEffort && !string.IsNullOrWhiteSpace(request.ReasoningEffort))
        {
            payload["reasoning_effort"] = request.ReasoningEffort;
        }

        return payload;
    }

    private static object BuildMessagePayload(ProcurementAgentMessage message)
    {
        return message.Role switch
        {
            "assistant" when message.ToolCalls.Count > 0 => new
            {
                role = message.Role,
                content = message.Content ?? string.Empty,
                tool_calls = message.ToolCalls.Select(toolCall => new
                {
                    id = toolCall.Id,
                    type = "function",
                    function = new
                    {
                        arguments = toolCall.ArgumentsJson,
                        name = toolCall.Name,
                    },
                }).ToArray(),
            },
            "tool" => new
            {
                role = message.Role,
                content = message.Content ?? string.Empty,
                tool_call_id = message.ToolCallId,
            },
            _ => new
            {
                role = message.Role,
                content = message.Content ?? string.Empty,
            },
        };
    }

    private static string? ReadMessageContent(JsonElement message)
    {
        if (!message.TryGetProperty("content", out var content))
        {
            return null;
        }

        return content.ValueKind switch
        {
            JsonValueKind.String => content.GetString(),
            JsonValueKind.Array => string.Join(
                Environment.NewLine,
                content.EnumerateArray()
                    .Where(part =>
                        part.TryGetProperty("type", out var type) &&
                        type.ValueKind == JsonValueKind.String &&
                        string.Equals(type.GetString(), "text", StringComparison.OrdinalIgnoreCase) &&
                        part.TryGetProperty("text", out var text) &&
                        text.ValueKind == JsonValueKind.String)
                    .Select(part => part.GetProperty("text").GetString())
                    .Where(text => !string.IsNullOrWhiteSpace(text))),
            _ => null,
        };
    }

    private static IReadOnlyList<ProcurementAgentToolCall> ReadToolCalls(JsonElement message)
    {
        if (!message.TryGetProperty("tool_calls", out var toolCalls) ||
            toolCalls.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var results = new List<ProcurementAgentToolCall>();
        foreach (var toolCall in toolCalls.EnumerateArray())
        {
            if (!toolCall.TryGetProperty("id", out var idElement) ||
                idElement.ValueKind != JsonValueKind.String ||
                !toolCall.TryGetProperty("function", out var functionElement) ||
                functionElement.ValueKind != JsonValueKind.Object ||
                !functionElement.TryGetProperty("name", out var nameElement) ||
                nameElement.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var argumentsJson = functionElement.TryGetProperty("arguments", out var argumentsElement)
                ? argumentsElement.GetString() ?? "{}"
                : "{}";

            results.Add(new ProcurementAgentToolCall(
                idElement.GetString() ?? string.Empty,
                nameElement.GetString() ?? string.Empty,
                argumentsJson));
        }

        return results;
    }

    private static string BuildOpenAiErrorDetail(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "No error body was returned.";
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("error", out var errorElement))
            {
                var message = errorElement.TryGetProperty("message", out var messageElement) &&
                              messageElement.ValueKind == JsonValueKind.String
                    ? messageElement.GetString()
                    : null;
                var type = errorElement.TryGetProperty("type", out var typeElement) &&
                           typeElement.ValueKind == JsonValueKind.String
                    ? typeElement.GetString()
                    : null;

                if (!string.IsNullOrWhiteSpace(message) && !string.IsNullOrWhiteSpace(type))
                {
                    return $"OpenAI error ({type}): {message}";
                }

                if (!string.IsNullOrWhiteSpace(message))
                {
                    return $"OpenAI error: {message}";
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

    /// <summary>
    /// GPT-5.4 mini currently rejects the combination of function tools and reasoning_effort
    /// on chat/completions, even though both features are supported individually.
    /// Retry once without reasoning_effort so the procurement agent can still use tools.
    /// </summary>
    private static bool ShouldRetryWithoutReasoningEffort(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            if (!document.RootElement.TryGetProperty("error", out var errorElement))
            {
                return false;
            }

            var type = errorElement.TryGetProperty("type", out var typeElement) &&
                       typeElement.ValueKind == JsonValueKind.String
                ? typeElement.GetString()
                : null;
            var message = errorElement.TryGetProperty("message", out var messageElement) &&
                          messageElement.ValueKind == JsonValueKind.String
                ? messageElement.GetString()
                : null;

            return string.Equals(type, "invalid_request_error", StringComparison.OrdinalIgnoreCase) &&
                   !string.IsNullOrWhiteSpace(message) &&
                   message.Contains("Function tools with reasoning_effort are not supported", StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
