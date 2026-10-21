using System.Text.Json.Serialization;

namespace server.core.Models;

/// <summary>
/// Maps output from usp_GetProjectCosts: one PPM expenditure item with every
/// "PPM Project Expenses" report column. Expenditure category and type are 'CODE - Name'.
/// </summary>
public sealed class ProjectCostRecord
{
    [JsonPropertyName("transactionNumber")]
    public long TransactionNumber { get; set; }

    /// <summary>Null for internal (non-sponsored) projects, as are the other Award fields.</summary>
    [JsonPropertyName("awardNumber")]
    public string? AwardNumber { get; set; }

    [JsonPropertyName("awardName")]
    public string? AwardName { get; set; }

    [JsonPropertyName("awardType")]
    public string? AwardType { get; set; }

    [JsonPropertyName("awardStatus")]
    public string? AwardStatus { get; set; }

    [JsonPropertyName("awardStartDate")]
    public DateTime? AwardStartDate { get; set; }

    [JsonPropertyName("awardEndDate")]
    public DateTime? AwardEndDate { get; set; }

    [JsonPropertyName("projectNumber")]
    public string ProjectNumber { get; set; } = "";

    [JsonPropertyName("projectName")]
    public string ProjectName { get; set; } = "";

    [JsonPropertyName("projectBusinessUnit")]
    public string ProjectBusinessUnit { get; set; } = "";

    [JsonPropertyName("projectOwningOrgCode")]
    public string ProjectOwningOrgCode { get; set; } = "";

    [JsonPropertyName("projectOwningOrgName")]
    public string ProjectOwningOrgName { get; set; } = "";

    [JsonPropertyName("projectType")]
    public string ProjectType { get; set; } = "";

    [JsonPropertyName("projectStatus")]
    public string ProjectStatus { get; set; } = "";

    [JsonPropertyName("projectStartDate")]
    public DateTime ProjectStartDate { get; set; }

    [JsonPropertyName("projectEndDate")]
    public DateTime? ProjectEndDate { get; set; }

    [JsonPropertyName("taskNumber")]
    public string TaskNumber { get; set; } = "";

    [JsonPropertyName("taskName")]
    public string TaskName { get; set; } = "";

    [JsonPropertyName("taskStatus")]
    public string TaskStatus { get; set; } = "";

    /// <summary>Null on sponsored rows, as are the other Task chart fields.</summary>
    [JsonPropertyName("taskFundCode")]
    public string? TaskFundCode { get; set; }

    [JsonPropertyName("taskFundName")]
    public string? TaskFundName { get; set; }

    [JsonPropertyName("taskPurposeCode")]
    public string? TaskPurposeCode { get; set; }

    [JsonPropertyName("taskPurposeName")]
    public string? TaskPurposeName { get; set; }

    [JsonPropertyName("taskProgramCode")]
    public string? TaskProgramCode { get; set; }

    [JsonPropertyName("taskProgramName")]
    public string? TaskProgramName { get; set; }

    [JsonPropertyName("taskActivityCode")]
    public string? TaskActivityCode { get; set; }

    [JsonPropertyName("taskActivityName")]
    public string? TaskActivityName { get; set; }

    [JsonPropertyName("expenditureBusinessUnit")]
    public string ExpenditureBusinessUnit { get; set; } = "";

    [JsonPropertyName("expenditureOrgCode")]
    public string ExpenditureOrgCode { get; set; } = "";

    [JsonPropertyName("expenditureOrgName")]
    public string ExpenditureOrgName { get; set; } = "";

    [JsonPropertyName("expenditureCategory")]
    public string ExpenditureCategory { get; set; } = "";

    [JsonPropertyName("expenditureType")]
    public string ExpenditureType { get; set; } = "";

    [JsonPropertyName("expenditureBatch")]
    public string ExpenditureBatch { get; set; } = "";

    [JsonPropertyName("expenditureItemDate")]
    public DateTime ExpenditureItemDate { get; set; }

    /// <summary>'Mon-YY', e.g. 'Sep-26'.</summary>
    [JsonPropertyName("accountingPeriod")]
    public string AccountingPeriod { get; set; } = "";

    [JsonPropertyName("accountingDate")]
    public DateTime AccountingDate { get; set; }

    [JsonPropertyName("document")]
    public string Document { get; set; } = "";

    [JsonPropertyName("documentEntry")]
    public string DocumentEntry { get; set; } = "";

    [JsonPropertyName("sourceTransactionNumber")]
    public long? SourceTransactionNumber { get; set; }

    [JsonPropertyName("transferredFromTransactionNumber")]
    public long? TransferredFromTransactionNumber { get; set; }

    [JsonPropertyName("adjustingItem")]
    public string? AdjustingItem { get; set; }

    [JsonPropertyName("comment")]
    public string? Comment { get; set; }

    [JsonPropertyName("billable")]
    public string Billable { get; set; } = "";

    [JsonPropertyName("invoicedStatus")]
    public string InvoicedStatus { get; set; } = "";

    [JsonPropertyName("revenueStatus")]
    public string RevenueStatus { get; set; } = "";

    [JsonPropertyName("rawCost")]
    public decimal RawCost { get; set; }

    [JsonPropertyName("burdenedCost")]
    public decimal BurdenedCost { get; set; }
}
