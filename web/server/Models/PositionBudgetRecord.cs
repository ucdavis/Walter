using System.Text.Json.Serialization;

namespace server.Models;

/// <summary>
/// Maps output from usp_GetPositionBudgets stored procedure.
/// </summary>
public sealed class PositionBudgetRecord
{
    [JsonPropertyName("employeeId")]
    public string? EmployeeId { get; set; }

    [JsonPropertyName("positionNumber")]
    public string? PositionNumber { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("projectId")]
    public string? ProjectId { get; set; }

    [JsonPropertyName("projectDescription")]
    public string? ProjectDescription { get; set; }

    [JsonPropertyName("positionDescription")]
    public string? PositionDescription { get; set; }

    [JsonPropertyName("monthlyRate")]
    public decimal? MonthlyRate { get; set; }

    [JsonPropertyName("distributionPercent")]
    public decimal? DistributionPercent { get; set; }

    [JsonPropertyName("compositeBenefitRate")]
    public decimal? CompositeBenefitRate { get; set; }

    [JsonPropertyName("fte")]
    public decimal? Fte { get; set; }

    [JsonPropertyName("positionEffectiveDate")]
    public DateTime? PositionEffectiveDate { get; set; }

    [JsonPropertyName("jobEndDate")]
    public DateTime? JobEndDate { get; set; }

    [JsonPropertyName("fundingEffectiveDate")]
    public DateTime? FundingEffectiveDate { get; set; }

    [JsonPropertyName("fundingEndDate")]
    public DateTime? FundingEndDate { get; set; }
}