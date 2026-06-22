using System.Text.Json.Serialization;

namespace server.core.Models;

/// <summary>
/// Maps result set 1 of usp_GetProjectProjection: per-expenditure-category budget header.
/// </summary>
public sealed class ProjectProjectionCategory
{
    [JsonPropertyName("expenditureCategory")]
    public string ExpenditureCategory { get; set; } = "";

    // The sproc emits 1/0 as INT, which Dapper cannot reliably map to bool.
    [JsonPropertyName("isPersonnel")]
    public int IsPersonnel { get; set; }

    [JsonPropertyName("budget")]
    public decimal Budget { get; set; }

    [JsonPropertyName("spentToDate")]
    public decimal SpentToDate { get; set; }

    [JsonPropertyName("committed")]
    public decimal Committed { get; set; }

    [JsonPropertyName("remainingNow")]
    public decimal RemainingNow { get; set; }
}

/// <summary>
/// Maps result set 2 of usp_GetProjectProjection: one row per period x category,
/// covering 3 trailing actual months, the blended current month, and 12 projected months.
/// </summary>
public sealed class ProjectProjectionPeriod
{
    /// <summary>'YYYY-MM'.</summary>
    [JsonPropertyName("month")]
    public string Month { get; set; } = "";

    /// <summary>'Mmm-yy' display label.</summary>
    [JsonPropertyName("displayPeriod")]
    public string DisplayPeriod { get; set; } = "";

    /// <summary>'actual', 'blended', or 'projected'.</summary>
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    [JsonPropertyName("expenditureCategory")]
    public string ExpenditureCategory { get; set; } = "";

    // The sproc emits 1/0 as INT, which Dapper cannot reliably map to bool.
    [JsonPropertyName("isPersonnel")]
    public int IsPersonnel { get; set; }

    [JsonPropertyName("actualAmount")]
    public decimal ActualAmount { get; set; }

    [JsonPropertyName("projectedAmount")]
    public decimal ProjectedAmount { get; set; }

    /// <summary>Running budget remaining (burndown), anchored at the category's current balance.</summary>
    [JsonPropertyName("remaining")]
    public decimal Remaining { get; set; }
}

/// <summary>
/// Envelope for both result sets of usp_GetProjectProjection.
/// </summary>
public sealed class ProjectProjectionResult
{
    [JsonPropertyName("categories")]
    public IReadOnlyList<ProjectProjectionCategory> Categories { get; set; } =
        Array.Empty<ProjectProjectionCategory>();

    [JsonPropertyName("periods")]
    public IReadOnlyList<ProjectProjectionPeriod> Periods { get; set; } =
        Array.Empty<ProjectProjectionPeriod>();
}
