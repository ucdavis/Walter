using System.Security.Claims;
using System.Text.Json;
using AggieEnterpriseApi.Extensions;
using Anthropic;
using Anthropic.Models.Messages;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using server.core.Data;
using server.Helpers;
using server.Models;

namespace server.Services;

public interface IAskService
{
    Task<AskResponse> AskAsync(AskRequest request, ClaimsPrincipal user, CancellationToken ct = default);
}

public sealed record AskRequest(string Question, IReadOnlyList<ConversationMessage>? ConversationHistory);

public sealed record ConversationMessage(string Role, string Content);

public sealed record AskResponse(string Answer, IReadOnlyList<string> ToolsUsed, IReadOnlyList<ChartSpec> Charts);

public sealed record ChartSpec(string Type, string Title, IReadOnlyList<ChartDataPoint> Data, string? XKey, string? YKey);

public sealed record ChartDataPoint(string Label, decimal Value, decimal? Value2);

public sealed record AccessibleProject(string ProjectNumber, string ProjectName);

public sealed class AskService : IAskService
{
    private const int MaxIterations = 10;
    private const int MaxResultRows = 500;

    private const string SystemPrompt = """
        You are a helpful financial data assistant for UC Davis research project management.
        You help Principal Investigators and Project Managers understand their project finances.

        You have access to tools that query financial data from UC Davis's data warehouse.
        When the user asks a question and you need project IDs, use list_my_projects first to find them.

        When answering questions:
        - Always query the relevant data before answering
        - Present financial amounts formatted as currency (e.g., $1,234.56)
        - Be precise with numbers; do not estimate or round unless asked
        - If the user asks about projects you cannot find data for, say so clearly
        - Explain financial terms if the user seems unfamiliar
        - Keep responses concise but thorough
        - When comparing values across projects or categories, use create_chart to visualize the data
        """;

    private readonly AnthropicClient _client;
    private readonly string _model;
    private readonly int _maxTokens;
    private readonly IDatamartService _datamartService;
    private readonly IFinancialApiService _financialApiService;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<AskService> _logger;

    public AskService(
        IOptions<AnthropicSettings> settings,
        IDatamartService datamartService,
        IFinancialApiService financialApiService,
        AppDbContext dbContext,
        ILogger<AskService> logger)
    {
        var config = settings.Value;

        _client = new AnthropicClient
        {
            ApiKey = config.ApiKey
                ?? throw new InvalidOperationException("Anthropic API key is not configured. Set ANTHROPIC__APIKEY.")
        };

        _model = config.Model;
        _maxTokens = config.MaxTokens;
        _datamartService = datamartService;
        _financialApiService = financialApiService;
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<AskResponse> AskAsync(AskRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        var (accessibleProjectIds, accessibleProjects) = await GetAccessibleProjectsAsync(user, ct);

        var messages = BuildMessages(request);
        var tools = GetToolDefinitions();
        var toolsUsed = new List<string>();
        var charts = new List<ChartSpec>();

        for (var i = 0; i < MaxIterations; i++)
        {
            var response = await _client.Messages.Create(new MessageCreateParams
            {
                MaxTokens = _maxTokens,
                Model = _model,
                System = SystemPrompt,
                Messages = messages,
                Tools = tools,
            }, ct);

            if (response.StopReason == StopReason.EndTurn || response.StopReason == StopReason.MaxTokens)
            {
                var text = ExtractText(response.Content);
                return new AskResponse(text, toolsUsed, charts);
            }

            if (response.StopReason == StopReason.ToolUse)
            {
                // Add assistant message with its content (text + tool_use blocks)
                messages.Add(new MessageParam
                {
                    Role = Role.Assistant,
                    Content = ConvertResponseToParam(response.Content),
                });

                // Process each tool call and build tool_result blocks
                var toolResults = new List<ContentBlockParam>();

                foreach (var block in response.Content)
                {
                    if (!block.TryPickToolUse(out var toolUse))
                        continue;

                    toolsUsed.Add(toolUse.Name);
                    _logger.LogInformation("LLM requested tool: {ToolName} with input: {Input}",
                        toolUse.Name, JsonSerializer.Serialize(toolUse.Input));

                    var result = await ExecuteToolAsync(toolUse, accessibleProjectIds, accessibleProjects, user, charts, ct);

                    toolResults.Add(new ToolResultBlockParam
                    {
                        ToolUseID = toolUse.ID,
                        Content = result,
                    });
                }

                // Add user message with tool results
                messages.Add(new MessageParam
                {
                    Role = Role.User,
                    Content = toolResults,
                });
            }
        }

        return new AskResponse(
            "I wasn't able to complete the analysis within the allowed number of steps. Please try a simpler question.",
            toolsUsed, charts);
    }

    private static string ExtractText(IReadOnlyList<ContentBlock> content)
    {
        var parts = new List<string>();
        foreach (var block in content)
        {
            if (block.TryPickText(out var textBlock))
                parts.Add(textBlock.Text);
        }
        return string.Join("\n", parts);
    }

    private static List<ContentBlockParam> ConvertResponseToParam(IReadOnlyList<ContentBlock> content)
    {
        var result = new List<ContentBlockParam>();
        foreach (var block in content)
        {
            if (block.TryPickText(out var textBlock))
            {
                result.Add(new TextBlockParam { Text = textBlock.Text });
            }
            else if (block.TryPickToolUse(out var toolUse))
            {
                result.Add(new ToolUseBlockParam
                {
                    ID = toolUse.ID,
                    Name = toolUse.Name,
                    Input = toolUse.Input,
                });
            }
        }
        return result;
    }

    private async Task<string> ExecuteToolAsync(
        ToolUseBlock toolUse,
        HashSet<string> accessibleProjectIds,
        IReadOnlyList<AccessibleProject> accessibleProjects,
        ClaimsPrincipal user,
        List<ChartSpec> charts,
        CancellationToken ct)
    {
        // list_my_projects doesn't need project_ids
        if (toolUse.Name == "list_my_projects")
        {
            return JsonSerializer.Serialize(accessibleProjects);
        }

        // create_chart — collect the spec and confirm to Claude
        if (toolUse.Name == "create_chart")
        {
            try
            {
                var chart = ParseChartSpec(toolUse.Input);
                charts.Add(chart);
                return JsonSerializer.Serialize(new { success = true, message = "Chart will be displayed to the user." });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse chart spec");
                return JsonSerializer.Serialize(new { error = "Invalid chart specification: " + ex.Message });
            }
        }

        // Parse project_ids from tool input
        List<string> requestedProjectIds;
        try
        {
            if (!toolUse.Input.TryGetValue("project_ids", out var projectIdsElement))
                return JsonSerializer.Serialize(new { error = "Missing required parameter: project_ids" });

            requestedProjectIds = projectIdsElement.EnumerateArray()
                .Select(e => e.GetString()!)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse project_ids from tool input");
            return JsonSerializer.Serialize(new { error = "Invalid project_ids format. Expected an array of strings." });
        }

        if (requestedProjectIds.Count == 0)
            return JsonSerializer.Serialize(new { error = "project_ids array is empty." });

        // Access check
        var unauthorized = requestedProjectIds
            .Where(id => !accessibleProjectIds.Contains(id))
            .ToList();

        if (unauthorized.Count > 0)
        {
            _logger.LogWarning("Access denied for projects: {Projects}", string.Join(", ", unauthorized));
            return JsonSerializer.Serialize(new
            {
                error = "Access denied",
                message = $"You do not have access to the following project(s): {string.Join(", ", unauthorized)}. You can only query projects where you are a PI or PM.",
            });
        }

        var applicationUser = user.GetUserIdentifier();

        try
        {
            object? data = toolUse.Name switch
            {
                "get_faculty_portfolio" => await _datamartService.GetFacultyPortfolioAsync(requestedProjectIds, applicationUser, ct),
                "get_position_budgets" => await _datamartService.GetPositionBudgetsAsync(requestedProjectIds, applicationUser, ct),
                "get_gl_ppm_reconciliation" => await _datamartService.GetGLPPMReconciliationAsync(requestedProjectIds, applicationUser, ct),
                "get_gl_transactions" => await _datamartService.GetGLTransactionListingsAsync(requestedProjectIds, applicationUser, ct),
                _ => new { error = $"Unknown tool: {toolUse.Name}" },
            };

            // Truncate large result sets
            data = TruncateIfNeeded(data);

            return JsonSerializer.Serialize(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing tool {ToolName}", toolUse.Name);
            return JsonSerializer.Serialize(new { error = $"Error executing {toolUse.Name}: {ex.Message}" });
        }
    }

    private static ChartSpec ParseChartSpec(IReadOnlyDictionary<string, JsonElement> input)
    {
        var type = input.TryGetValue("chart_type", out var ct) ? ct.GetString() ?? "bar" : "bar";
        var title = input.TryGetValue("title", out var t) ? t.GetString() ?? "" : "";
        var xKey = input.TryGetValue("x_key", out var xk) ? xk.GetString() : null;
        var yKey = input.TryGetValue("y_key", out var yk) ? yk.GetString() : null;

        var data = new List<ChartDataPoint>();
        if (input.TryGetValue("data", out var dataElement))
        {
            foreach (var item in dataElement.EnumerateArray())
            {
                var label = item.TryGetProperty("label", out var l) ? l.GetString() ?? "" : "";
                var value = item.TryGetProperty("value", out var v) ? v.GetDecimal() : 0;
                decimal? value2 = item.TryGetProperty("value2", out var v2) ? v2.GetDecimal() : null;
                data.Add(new ChartDataPoint(label, value, value2));
            }
        }

        return new ChartSpec(type, title, data, xKey, yKey);
    }

    private static object TruncateIfNeeded(object? data)
    {
        return data switch
        {
            IReadOnlyList<FacultyPortfolioRecord> list when list.Count > MaxResultRows
                => new { rows = list.Take(MaxResultRows), total = list.Count, truncated = true },
            IReadOnlyList<PositionBudgetRecord> list when list.Count > MaxResultRows
                => new { rows = list.Take(MaxResultRows), total = list.Count, truncated = true },
            IReadOnlyList<GLPPMReconciliationRecord> list when list.Count > MaxResultRows
                => new { rows = list.Take(MaxResultRows), total = list.Count, truncated = true },
            IReadOnlyList<GLTransactionRecord> list when list.Count > MaxResultRows
                => new { rows = list.Take(MaxResultRows), total = list.Count, truncated = true },
            _ => data ?? new { },
        };
    }

    private async Task<(HashSet<string> Ids, IReadOnlyList<AccessibleProject> Projects)> GetAccessibleProjectsAsync(
        ClaimsPrincipal user, CancellationToken ct)
    {
        var userId = user.GetUserId();

        var employeeId = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.EmployeeId)
            .SingleOrDefaultAsync(ct);

        if (string.IsNullOrWhiteSpace(employeeId))
        {
            _logger.LogWarning("User {UserId} has no employee ID", userId);
            return (new HashSet<string>(StringComparer.OrdinalIgnoreCase), []);
        }

        var client = _financialApiService.GetClient();

        var piTask = client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.PrincipalInvestigator, ct);
        var pmTask = client.PpmProjectByProjectTeamMemberEmployeeId.ExecuteAsync(
            employeeId, PpmRole.ProjectManager, ct);

        await Task.WhenAll(piTask, pmTask);

        var piData = piTask.Result.ReadData();
        var pmData = pmTask.Result.ReadData();

        var allProjects = piData.PpmProjectByProjectTeamMemberEmployeeId
            .Concat(pmData.PpmProjectByProjectTeamMemberEmployeeId)
            .GroupBy(p => p.ProjectNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g => new AccessibleProject(g.Key, g.First().Name))
            .OrderBy(p => p.ProjectName)
            .ToList();

        var ids = allProjects.Select(p => p.ProjectNumber).ToHashSet(StringComparer.OrdinalIgnoreCase);

        _logger.LogInformation("User {EmployeeId} has access to {Count} projects", employeeId, ids.Count);

        return (ids, allProjects);
    }

    private static List<MessageParam> BuildMessages(AskRequest request)
    {
        var messages = new List<MessageParam>();

        // Add conversation history (limit to last 10 exchanges = 20 messages)
        if (request.ConversationHistory is { Count: > 0 })
        {
            var history = request.ConversationHistory;
            if (history.Count > 20)
                history = history.Skip(history.Count - 20).ToList();

            foreach (var msg in history)
            {
                messages.Add(new MessageParam
                {
                    Role = msg.Role == "assistant" ? Role.Assistant : Role.User,
                    Content = msg.Content,
                });
            }
        }

        // Add the current question
        messages.Add(new MessageParam
        {
            Role = Role.User,
            Content = request.Question,
        });

        return messages;
    }

    private static IReadOnlyList<ToolUnion> GetToolDefinitions()
    {
        return
        [
            new Tool
            {
                Name = "list_my_projects",
                Description = "Lists all projects the current user has access to, with project number and project name. Use this first when the user asks about their projects or when you need project IDs to query other tools. Takes no parameters.",
                InputSchema = new InputSchema
                {
                    Type = JsonSerializer.SerializeToElement("object"),
                    Properties = new Dictionary<string, JsonElement>(),
                },
            },

            new Tool
            {
                Name = "create_chart",
                Description = "Creates a chart that will be displayed to the user. Use this when a visual representation would help the user understand the data (e.g., comparing budgets across projects, showing expense breakdowns, or comparing GL vs PPM amounts). Supports bar, line, and pie charts. For comparing two values per label (e.g., budget vs spent, GL vs PPM), use value and value2.",
                InputSchema = new InputSchema
                {
                    Type = JsonSerializer.SerializeToElement("object"),
                    Properties = new Dictionary<string, JsonElement>
                    {
                        ["chart_type"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "string",
                            @enum = new[] { "bar", "line", "pie" },
                            description = "Type of chart to create"
                        }),
                        ["title"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "string",
                            description = "Chart title displayed above the chart"
                        }),
                        ["data"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "array",
                            items = new
                            {
                                type = "object",
                                properties = new
                                {
                                    label = new { type = "string", description = "X-axis label or pie slice name" },
                                    value = new { type = "number", description = "Primary numeric value" },
                                    value2 = new { type = "number", description = "Optional second value for grouped/comparison charts" },
                                },
                                required = new[] { "label", "value" }
                            },
                            description = "Array of data points for the chart"
                        }),
                        ["x_key"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "string",
                            description = "Label for the x-axis or primary value legend (e.g., 'Budget')"
                        }),
                        ["y_key"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "string",
                            description = "Label for the second value legend when using value2 (e.g., 'Spent')"
                        }),
                    },
                    Required = ["chart_type", "title", "data"],
                },
            },

            new Tool
            {
                Name = "get_faculty_portfolio",
                Description = "Retrieves project portfolio data including budgets, expenditures, commitments, and remaining balance. Returns award dates, project status, task details, expenditure categories, fund/purpose/program/activity codes, and team members (PI, PM, PA, CoPI). Use this for questions about overall project finances, budgets, balances, and expenditure breakdowns.",
                InputSchema = new InputSchema
                {
                    Type = JsonSerializer.SerializeToElement("object"),
                    Properties = new Dictionary<string, JsonElement>
                    {
                        ["project_ids"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "array",
                            items = new { type = "string" },
                            description = "List of project numbers (e.g., ['K30PR12345'])"
                        })
                    },
                    Required = ["project_ids"],
                },
            },

            new Tool
            {
                Name = "get_position_budgets",
                Description = "Retrieves personnel position and budget data. Returns employee names, position numbers, descriptions, monthly rates, distribution percentages, composite benefit rates, FTE, and effective/end dates. Use this for questions about staffing, personnel costs, and employee assignments on projects.",
                InputSchema = new InputSchema
                {
                    Type = JsonSerializer.SerializeToElement("object"),
                    Properties = new Dictionary<string, JsonElement>
                    {
                        ["project_ids"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "array",
                            items = new { type = "string" },
                            description = "List of project numbers (e.g., ['K30PR12345'])"
                        })
                    },
                    Required = ["project_ids"],
                },
            },

            new Tool
            {
                Name = "get_gl_ppm_reconciliation",
                Description = "Retrieves GL (General Ledger) vs PPM (Project Portfolio Management) reconciliation data. Compares GL actuals/commitments/obligations with PPM budget/commitments/ITD expenditures/budget balance. Use this for questions about discrepancies between GL and PPM, or when comparing GL and PPM financial figures.",
                InputSchema = new InputSchema
                {
                    Type = JsonSerializer.SerializeToElement("object"),
                    Properties = new Dictionary<string, JsonElement>
                    {
                        ["project_ids"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "array",
                            items = new { type = "string" },
                            description = "List of project numbers (e.g., ['K30PR12345'])"
                        })
                    },
                    Required = ["project_ids"],
                },
            },

            new Tool
            {
                Name = "get_gl_transactions",
                Description = "Retrieves detailed General Ledger transaction listings. Returns individual transactions with entity, fund, department, account, purpose, program, activity, document type, journal details, period, and amounts (actual, commitment, obligation). Use this for questions about specific transactions, journal entries, or detailed spending line items.",
                InputSchema = new InputSchema
                {
                    Type = JsonSerializer.SerializeToElement("object"),
                    Properties = new Dictionary<string, JsonElement>
                    {
                        ["project_ids"] = JsonSerializer.SerializeToElement(new
                        {
                            type = "array",
                            items = new { type = "string" },
                            description = "List of project numbers (e.g., ['K30PR12345'])"
                        })
                    },
                    Required = ["project_ids"],
                },
            },
        ];
    }
}
