using System.Text.Json;
using FluentAssertions;
using server.core.Domain;

namespace server.tests.Domain;

public sealed class ProjectionAllocationSerializationTests
{
    [Fact]
    public void Explicit_outside_funding_and_zero_share_round_trip_without_becoming_missing_inputs()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var allocation = JsonSerializer.Deserialize<ProjectionFundingAllocation>(
            """{"fundingSourceId":null,"percent":0}""", options)!;

        allocation.FundingSourceId.Should().BeNull();
        allocation.Percent.Should().Be(0);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(allocation, options));
        document.RootElement.GetProperty("fundingSourceId").ValueKind.Should().Be(JsonValueKind.Null);
        document.RootElement.GetProperty("percent").GetDecimal().Should().Be(0);
    }

    [Theory]
    [InlineData("""{"percent":0}""")]
    [InlineData("""{"fundingSourceId":null}""")]
    [InlineData("""{"fundingSourceId":null,"percent":null}""")]
    public void Missing_allocation_choices_are_rejected_instead_of_becoming_zero_or_outside_funding(string json)
    {
        var deserialize = () => JsonSerializer.Deserialize<ProjectionFundingAllocation>(json,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        deserialize.Should().Throw<JsonException>();
    }
}
