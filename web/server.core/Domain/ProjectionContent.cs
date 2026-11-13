using System.Text.Json.Serialization;
using server.core.Models;

namespace server.core.Domain;

/// <summary>Typed scenario document; plan identity, name, capture anchor, and concurrency metadata live on Projection.</summary>
public sealed record ProjectionContent
{
    /// <summary>3, 6, or 12; selects captured historical averages without changing custom expense amounts.</summary>
    [JsonRequired]
    public int HistoryMonths { get; set; } = 3;

    /// <summary>Number of forecast calendar months from the plan's capture month, including that month.</summary>
    [JsonRequired]
    public int ForecastMonths { get; set; } = ProjectionPlanDefaults.DefaultForecastMonths;

    /// <summary>Optional plain-text planning context; has no effect on forecast calculations.</summary>
    public string? Notes { get; set; }

    [JsonRequired]
    public List<ProjectionFundingSource> FundingSources { get; set; } = [];
    [JsonRequired]
    public List<ProjectionAppointment> Appointments { get; set; } = [];
}
