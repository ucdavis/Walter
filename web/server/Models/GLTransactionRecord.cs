using System.Text.Json.Serialization;

namespace server.Models;

/// <summary>
/// Maps output from usp_GetGLTransactionListings stored procedure.
/// </summary>
public sealed class GLTransactionRecord
{
    [JsonPropertyName("entity")]
    public string? Entity { get; set; }

    [JsonPropertyName("entityDescription")]
    public string? EntityDescription { get; set; }

    [JsonPropertyName("fund")]
    public string? Fund { get; set; }

    [JsonPropertyName("fundDescription")]
    public string? FundDescription { get; set; }

    [JsonPropertyName("financialDepartment")]
    public string? FinancialDepartment { get; set; }

    [JsonPropertyName("financialDepartmentDescription")]
    public string? FinancialDepartmentDescription { get; set; }

    [JsonPropertyName("account")]
    public string? Account { get; set; }

    [JsonPropertyName("accountDescription")]
    public string? AccountDescription { get; set; }

    [JsonPropertyName("purpose")]
    public string? Purpose { get; set; }

    [JsonPropertyName("purposeDescription")]
    public string? PurposeDescription { get; set; }

    [JsonPropertyName("program")]
    public string? Program { get; set; }

    [JsonPropertyName("programDescription")]
    public string? ProgramDescription { get; set; }

    [JsonPropertyName("project")]
    public string? Project { get; set; }

    [JsonPropertyName("projectDescription")]
    public string? ProjectDescription { get; set; }

    [JsonPropertyName("activity")]
    public string? Activity { get; set; }

    [JsonPropertyName("activityDescription")]
    public string? ActivityDescription { get; set; }

    [JsonPropertyName("documentType")]
    public string? DocumentType { get; set; }

    [JsonPropertyName("accountingSequenceNumber")]
    public string? AccountingSequenceNumber { get; set; }

    [JsonPropertyName("trackingNo")]
    public string? TrackingNo { get; set; }

    [JsonPropertyName("reference")]
    public string? Reference { get; set; }

    [JsonPropertyName("journalLineDescription")]
    public string? JournalLineDescription { get; set; }

    [JsonPropertyName("journalAcctDate")]
    public DateTime? JournalAcctDate { get; set; }

    [JsonPropertyName("journalName")]
    public string? JournalName { get; set; }

    [JsonPropertyName("journalReference")]
    public string? JournalReference { get; set; }

    [JsonPropertyName("periodName")]
    public string? PeriodName { get; set; }

    [JsonPropertyName("journalBatchName")]
    public string? JournalBatchName { get; set; }

    [JsonPropertyName("journalSource")]
    public string? JournalSource { get; set; }

    [JsonPropertyName("journalCategory")]
    public string? JournalCategory { get; set; }

    [JsonPropertyName("batchStatus")]
    public string? BatchStatus { get; set; }

    [JsonPropertyName("actualFlag")]
    public string? ActualFlag { get; set; }

    [JsonPropertyName("encumbranceTypeCode")]
    public string? EncumbranceTypeCode { get; set; }

    [JsonPropertyName("actualAmount")]
    public decimal ActualAmount { get; set; }

    [JsonPropertyName("commitmentAmount")]
    public decimal CommitmentAmount { get; set; }

    [JsonPropertyName("obligationAmount")]
    public decimal ObligationAmount { get; set; }
}