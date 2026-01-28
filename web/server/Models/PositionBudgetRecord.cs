using System.Text.Json.Serialization;

namespace server.Models;

/// <summary>
/// Maps output from usp_GetPositionBudgets stored procedure.
/// </summary>
public sealed record PositionBudgetRecord(
    [property: JsonPropertyName("employeeId")] string? EmployeeId,
    [property: JsonPropertyName("positionNumber")] string? PositionNumber,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("projectId")] string? ProjectId,
    [property: JsonPropertyName("projectDescription")] string? ProjectDescription,
    [property: JsonPropertyName("positionDescription")] string? PositionDescription,
    [property: JsonPropertyName("monthlyRate")] decimal? MonthlyRate,
    [property: JsonPropertyName("distributionPercent")] decimal? DistributionPercent,
    [property: JsonPropertyName("compositeBenefitRate")] decimal? CompositeBenefitRate,
    [property: JsonPropertyName("fte")] decimal? Fte,
    [property: JsonPropertyName("positionEffectiveDate")] DateTime? PositionEffectiveDate,
    [property: JsonPropertyName("jobEndDate")] DateTime? JobEndDate,
    [property: JsonPropertyName("fundingEffectiveDate")] DateTime? FundingEffectiveDate,
    [property: JsonPropertyName("fundingEndDate")] DateTime? FundingEndDate
);
