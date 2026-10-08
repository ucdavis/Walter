using System.Text.Json.Serialization;

namespace server.core.Models;

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

    /// <summary>Project-Task chartfield segment (PRODUCT). Surfaced so funding entries on internal projects can show which task is being charged.</summary>
    [JsonPropertyName("task")]
    public string? Task { get; set; }

    /// <summary>Project classification from FacultyDeptPortfolio (e.g. "Internal"); drives whether the client shows the Task on a funding entry.</summary>
    [JsonPropertyName("projectType")]
    public string? ProjectType { get; set; }

    [JsonPropertyName("positionDescription")]
    public string? PositionDescription { get; set; }

    [JsonPropertyName("jobCode")]
    public string? JobCode { get; set; }

    [JsonPropertyName("monthlyRate")]
    public decimal? MonthlyRate { get; set; }

    [JsonPropertyName("distributionPercent")]
    public decimal? DistributionPercent { get; set; }

    [JsonPropertyName("compositeBenefitRate")]
    public decimal? CompositeBenefitRate { get; set; }

    [JsonPropertyName("fte")]
    public decimal? Fte { get; set; }

    [JsonPropertyName("jobEffectiveDate")]
    public DateTime? JobEffectiveDate { get; set; }

    [JsonPropertyName("jobEndDate")]
    public DateTime? JobEndDate { get; set; }

    [JsonPropertyName("fundingEffectiveDate")]
    public DateTime? FundingEffectiveDate { get; set; }

    [JsonPropertyName("fundingEndDate")]
    public DateTime? FundingEndDate { get; set; }

    /// <summary>True when the funding entry is effective after the last load (Cognos source only; always false otherwise).</summary>
    [JsonPropertyName("isFuture")]
    public bool IsFuture { get; set; }

    /// <summary>391 earn code of the funding line ("" = default distribution). Cognos source only.</summary>
    [JsonPropertyName("earnCode")]
    public string? EarnCode { get; set; }

    /// <summary>Share of the person's pay for this earn code, from the UCP-310 (1 when not split). The client multiplies it into the line salary. Cognos source only.</summary>
    [JsonPropertyName("earnCodeShare")]
    public decimal? EarnCodeShare { get; set; }

    /// <summary>BaseOnly, Split, or Unsplit (other earn codes funded but no UCP-310 to split by). Cognos source only.</summary>
    [JsonPropertyName("earnCodeStatus")]
    public string? EarnCodeStatus { get; set; }
}
