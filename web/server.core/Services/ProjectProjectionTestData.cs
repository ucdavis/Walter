using System.Globalization;
using server.core.Models;

namespace server.core.Services;

/// <summary>
/// Generated projection test data for local development, where the
/// usp_GetProjectProjection sproc may not exist. Enabled via
/// Datamart:UseFakeProjectProjection. Mirrors the sproc's shape: 6 expenditure
/// categories x 16 periods (3 trailing actual months, the blended current
/// month, 12 projected months) with a running remaining per category.
/// </summary>
public static class ProjectProjectionTestData
{
    private sealed record CategorySpec(
        string Name,
        int IsPersonnel,
        decimal RemainingNow,
        decimal[] Actuals,
        decimal BlendedActual,
        decimal BlendedProjected,
        decimal MonthlyProjected);

    private static readonly CategorySpec[] Specs =
    {
        new("01 - Salaries and Wages", 1, 120_000m, new[] { 8_000m, 8_000m, 8_000m }, 0m, 8_000m, 8_000m),
        new("02 - Fringe Benefits", 1, 30_000m, new[] { 2_800m, 2_800m, 2_800m }, 0m, 2_800m, 2_800m),
        new("03 - Supplies / Services / Other Expenses", 0, 9_000m, new[] { 500m, 250m, 750m }, 200m, 300m, 500m),
        new("07 - Travel", 0, 6_000m, new[] { 0m, 1_200m, 0m }, 0m, 400m, 400m),
        new("08 - Fellowship & Scholarships", 0, 25_000m, new[] { 3_000m, 3_000m, 3_000m }, 0m, 3_000m, 3_000m),
        new("09 - Indirect Costs", 0, 80_000m, new[] { 4_300m, 4_300m, 4_300m }, 0m, 4_300m, 4_300m),
    };

    public static ProjectProjectionResult Generate(DateTime today)
    {
        var currMonth = new DateTime(today.Year, today.Month, 1);

        var categories = Specs.Select(s => new ProjectProjectionCategory
        {
            ExpenditureCategory = s.Name,
            IsPersonnel = s.IsPersonnel,
            Budget = s.RemainingNow + s.Actuals.Sum() + 5_000m,
            SpentToDate = s.Actuals.Sum() + 5_000m,
            Committed = 0m,
            RemainingNow = s.RemainingNow,
        }).ToArray();

        var periods = new List<ProjectProjectionPeriod>();
        foreach (var s in Specs)
        {
            // Anchor like the sproc: remaining equals RemainingNow as of the
            // last actual month, integrated backward and forward from there.
            var remaining = s.RemainingNow + s.Actuals.Sum();
            for (var offset = -3; offset <= 12; offset++)
            {
                var monthStart = currMonth.AddMonths(offset);
                var kind = offset < 0 ? "actual" : offset == 0 ? "blended" : "projected";
                var actual = offset < 0 ? s.Actuals[offset + 3] : offset == 0 ? s.BlendedActual : 0m;
                var projected = offset == 0 ? s.BlendedProjected : offset > 0 ? s.MonthlyProjected : 0m;
                remaining -= actual + projected;

                periods.Add(new ProjectProjectionPeriod
                {
                    Month = monthStart.ToString("yyyy-MM", CultureInfo.InvariantCulture),
                    DisplayPeriod = monthStart.ToString("MMM-yy", CultureInfo.InvariantCulture),
                    Kind = kind,
                    ExpenditureCategory = s.Name,
                    IsPersonnel = s.IsPersonnel,
                    ActualAmount = actual,
                    ProjectedAmount = projected,
                    Remaining = remaining,
                });
            }
        }

        return new ProjectProjectionResult { Categories = categories, Periods = periods };
    }
}
