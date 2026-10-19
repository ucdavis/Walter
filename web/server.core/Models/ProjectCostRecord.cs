using System.Text.Json.Serialization;

namespace server.core.Models;

/// <summary>
/// Maps output from usp_GetProjectCosts: one PPM expenditure item.
/// </summary>
public sealed class ProjectCostRecord
{
    [JsonPropertyName("transactionNumber")]
    public long TransactionNumber { get; set; }

    /// <summary>'Mon-YY', e.g. 'Sep-26'.</summary>
    [JsonPropertyName("accountingPeriod")]
    public string AccountingPeriod { get; set; } = "";

    [JsonPropertyName("expenditureCategory")]
    public string ExpenditureCategory { get; set; } = "";

    [JsonPropertyName("expenditureType")]
    public string ExpenditureType { get; set; } = "";

    [JsonPropertyName("documentEntry")]
    public string DocumentEntry { get; set; } = "";

    [JsonPropertyName("burdenedCost")]
    public decimal BurdenedCost { get; set; }
}
