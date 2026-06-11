using FluentAssertions;
using server.core.Services;

namespace server.tests.Services;

public sealed class ProjectProjectionTestDataTests
{
    [Fact]
    public void Generate_produces_sixteen_periods_per_category()
    {
        var result = ProjectProjectionTestData.Generate(new DateTime(2026, 6, 11));

        result.Categories.Should().HaveCount(6);
        result.Periods.Should().HaveCount(6 * 16);

        foreach (var category in result.Categories)
        {
            var periods = result.Periods
                .Where(p => p.ExpenditureCategory == category.ExpenditureCategory)
                .ToList();

            periods.Should().HaveCount(16);
            periods.Count(p => p.Kind == "actual").Should().Be(3);
            periods.Count(p => p.Kind == "blended").Should().Be(1);
            periods.Count(p => p.Kind == "projected").Should().Be(12);
        }
    }

    [Fact]
    public void Generate_anchors_remaining_at_the_last_actual_month()
    {
        var result = ProjectProjectionTestData.Generate(new DateTime(2026, 6, 11));

        foreach (var category in result.Categories)
        {
            var lastActual = result.Periods
                .Where(p => p.ExpenditureCategory == category.ExpenditureCategory && p.Kind == "actual")
                .OrderBy(p => p.Month)
                .Last();

            lastActual.Month.Should().Be("2026-05");
            lastActual.Remaining.Should().Be(category.RemainingNow);
        }
    }
}
