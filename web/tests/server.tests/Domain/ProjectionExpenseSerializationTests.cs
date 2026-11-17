using System.Text.Json;
using System.Text.Json.Nodes;
using FluentAssertions;
using server.core.Domain;

namespace server.tests.Domain;

public sealed class ProjectionExpenseSerializationTests
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    private const string ValidExpense = """{"id":1,"kind":"Monthly","description":"Supplies","expenditureCategory":"05 - Supplies","amount":0,"startMonth":"2026-01-01","endMonth":null}""";

    [Theory]
    [InlineData("id")]
    [InlineData("kind")]
    [InlineData("description")]
    [InlineData("expenditureCategory")]
    [InlineData("amount")]
    [InlineData("startMonth")]
    public void Expense_choices_must_be_present_in_the_json_contract(string missing)
    {
        var document = JsonNode.Parse(ValidExpense)!.AsObject();
        document.Remove(missing);

        var deserialize = () => document.Deserialize<ProjectionExpense>(Options);

        deserialize.Should().Throw<JsonException>();
    }

    [Fact]
    public void Explicit_zero_and_open_monthly_end_round_trip()
    {
        var expense = JsonSerializer.Deserialize<ProjectionExpense>(ValidExpense, Options)!;

        expense.Amount.Should().Be(0);
        expense.EndMonth.Should().BeNull();
        JsonSerializer.Deserialize<ProjectionExpense>(JsonSerializer.Serialize(expense, Options), Options)
            .Should().BeEquivalentTo(expense);
    }

    [Fact]
    public void Generated_expense_kind_is_not_part_of_the_contract()
    {
        var deserialize = () => JsonSerializer.Deserialize<ProjectionExpense>(ValidExpense.Replace("Monthly", "Projected"), Options);

        deserialize.Should().Throw<JsonException>();
    }

    [Theory]
    [InlineData("""{"expenditureCategory":"05 - Supplies"}""")]
    [InlineData("""{"amount":0}""")]
    [InlineData("""{"expenditureCategory":"05 - Supplies","amount":null}""")]
    public void An_override_requires_an_explicit_category_and_numeric_amount(string json)
    {
        var deserialize = () => JsonSerializer.Deserialize<ProjectionHistoricalExpenseOverride>(json, Options);

        deserialize.Should().Throw<JsonException>();
    }
}
