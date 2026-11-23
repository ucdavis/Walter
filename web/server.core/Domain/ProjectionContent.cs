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

    /// <summary>Original scoped staffing and source identities. Ordinary saves and copies retain this capture.</summary>
    [JsonRequired]
    public ProjectionComparison Comparison { get; set; } = new();

    /// <summary>Highest appointment identity issued, including appointments since removed.</summary>
    [JsonRequired]
    public int LastAppointmentId { get; set; }
    /// <summary>Highest funding source identity issued, including sources since removed.</summary>
    [JsonRequired]
    public int LastFundingSourceId { get; set; }

    [JsonRequired]
    public List<ProjectionFundingSource> FundingSources { get; set; } = [];
    [JsonRequired]
    public List<ProjectionAppointment> Appointments { get; set; } = [];
}

public sealed record ProjectionComparison
{
    [JsonRequired]
    public List<ProjectionAppointment> Appointments { get; init; } = [];
    /// <summary>Retains enough identity to label excluded sources and their original funding shares.</summary>
    [JsonRequired]
    public List<ProjectionCapturedSource> FundingSources { get; init; } = [];
}

public sealed record ProjectionCapturedSource(int Id, string Name, string? ProjectNumber, string? TaskNumber);
