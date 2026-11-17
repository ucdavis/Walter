namespace server.core.Models;

/// <summary>Initial plan settings and editor limits; saved plans keep their selected forecast duration and notes.</summary>
public static class ProjectionPlanDefaults
{
    public const int DefaultForecastMonths = 12;
    public const int MaximumNameLength = 200;
    public const int MaximumNotesLength = 2000;

    public static IReadOnlyList<int> ForecastMonthOptions { get; } = [12, 18];
}
