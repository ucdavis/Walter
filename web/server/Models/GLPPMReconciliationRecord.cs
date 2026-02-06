using System.Text.Json.Serialization;

namespace server.Models;

/// <summary>
/// Maps output from usp_GetGLPPMReconciliation stored procedure.
/// </summary>
public sealed class GLPPMReconciliationRecord
{
    [JsonPropertyName("financialDepartment")]
    public string? FinancialDepartment { get; set; }

    [JsonPropertyName("project")]
    public string Project { get; set; } = "";

    [JsonPropertyName("projectDescription")]
    public string? ProjectDescription { get; set; }

    [JsonPropertyName("fundCode")]
    public string? FundCode { get; set; }

    [JsonPropertyName("fundDescription")]
    public string? FundDescription { get; set; }

    [JsonPropertyName("programCode")]
    public string? ProgramCode { get; set; }

    [JsonPropertyName("programDescription")]
    public string? ProgramDescription { get; set; }

    [JsonPropertyName("activityCode")]
    public string? ActivityCode { get; set; }

    [JsonPropertyName("activityDescription")]
    public string? ActivityDescription { get; set; }

    [JsonPropertyName("glActualAmount")]
    public decimal GlActualAmount { get; set; }

    [JsonPropertyName("glCommitmentAmount")]
    public decimal GlCommitmentAmount { get; set; }

    [JsonPropertyName("glObligationAmount")]
    public decimal GlObligationAmount { get; set; }

    [JsonPropertyName("glTotalAmount")]
    public decimal GlTotalAmount { get; set; }

    [JsonPropertyName("ppmBudget")]
    public decimal PpmBudget { get; set; }

    [JsonPropertyName("ppmCommitments")]
    public decimal PpmCommitments { get; set; }

    [JsonPropertyName("ppmItdExp")]
    public decimal PpmItdExp { get; set; }

    [JsonPropertyName("ppmBudBal")]
    public decimal PpmBudBal { get; set; }

    [JsonPropertyName("remainingBalance")]
    public decimal RemainingBalance { get; set; }

    [JsonPropertyName("dataSource")]
    public string DataSource { get; set; } = "";
}