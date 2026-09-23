using FluentAssertions;
using server.core.Services;

namespace server.tests.Services;

public sealed class DatamartOptionsTests
{
    [Theory]
    [InlineData("UCPathDWH", "dbo.usp_GetPositionBudgets")]
    [InlineData("Local", "dbo.usp_GetPositionBudgetsLocal")]
    [InlineData(" local ", "dbo.usp_GetPositionBudgetsLocal")]
    [InlineData("Cognos", "dbo.usp_GetPositionBudgetsCognos")]
    [InlineData("cognos", "dbo.usp_GetPositionBudgetsCognos")]
    [InlineData("", "dbo.usp_GetPositionBudgets")]
    [InlineData("unknown", "dbo.usp_GetPositionBudgets")]
    public void PositionBudgetsSproc_maps_source_to_sproc(string source, string expected)
    {
        var options = new DatamartOptions { PositionBudgetsSource = source };

        options.PositionBudgetsSproc.Should().Be(expected);
    }

    [Theory]
    [InlineData("Cognos", true)]
    [InlineData(" cognos ", true)]
    [InlineData("Local", false)]
    [InlineData("UCPathDWH", false)]
    [InlineData("", false)]
    public void UseCognosPositionBudgets_is_true_only_for_cognos(string source, bool expected)
    {
        var options = new DatamartOptions { PositionBudgetsSource = source };

        options.UseCognosPositionBudgets.Should().Be(expected);
    }
}
