namespace server.Services;

public sealed class AnthropicSettings
{
    public string? ApiKey { get; set; }
    public string Model { get; set; } = "claude-haiku-4-5-20251001";
    public int MaxTokens { get; set; } = 4096;
}
