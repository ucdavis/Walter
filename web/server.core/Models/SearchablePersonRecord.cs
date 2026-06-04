using System.Text.Json.Serialization;

namespace server.core.Models;

public sealed class SearchablePersonRecord
{
    [JsonPropertyName("iamId")]
    public string IamId { get; set; } = string.Empty;

    [JsonPropertyName("employeeId")]
    public string EmployeeId { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string? Email { get; set; }
}
