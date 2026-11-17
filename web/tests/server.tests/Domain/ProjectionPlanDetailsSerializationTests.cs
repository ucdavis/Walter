using System.Text.Json;
using System.Text.Json.Nodes;
using FluentAssertions;
using Server.Controllers;
using server.core.Domain;
using server.core.Models;

namespace server.tests.Domain;

public sealed class ProjectionPlanDetailsSerializationTests
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    [Theory]
    [InlineData("content")]
    [InlineData("historyMonths")]
    [InlineData("fundingSources")]
    [InlineData("appointments")]
    public void Complete_content_is_required_on_drafts_and_saves(string missing)
    {
        var draft = new ProjectionDraft("Plan", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), new());
        var save = new ProjectionsController.SaveProjectionRequest("Plan", new());
        var draftJson = JsonSerializer.SerializeToNode(draft, Options)!.AsObject();
        var saveJson = JsonSerializer.SerializeToNode(save, Options)!.AsObject();
        foreach (var json in new[] { draftJson, saveJson })
        {
            if (missing == "content") json.Remove(missing);
            else json["content"]!.AsObject().Remove(missing);
        }

        var readDraft = () => draftJson.Deserialize<ProjectionDraft>(Options);
        var readSave = () => saveJson.Deserialize<ProjectionsController.SaveProjectionRequest>(Options);

        readDraft.Should().Throw<JsonException>();
        readSave.Should().Throw<JsonException>();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Forecast_duration_must_be_explicit_on_drafts_and_saves(bool explicitNull)
    {
        var draft = new ProjectionDraft("Plan", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), new());
        var save = new ProjectionsController.SaveProjectionRequest("Plan", new());
        var draftJson = JsonSerializer.SerializeToNode(draft, Options)!.AsObject();
        var saveJson = JsonSerializer.SerializeToNode(save, Options)!.AsObject();
        foreach (var json in new[] { draftJson, saveJson })
        {
            var content = json["content"]!.AsObject();
            if (explicitNull) content["forecastMonths"] = null;
            else content.Remove("forecastMonths");
        }

        var readDraft = () => draftJson.Deserialize<ProjectionDraft>(Options);
        var readSave = () => saveJson.Deserialize<ProjectionsController.SaveProjectionRequest>(Options);

        readDraft.Should().Throw<JsonException>();
        readSave.Should().Throw<JsonException>();
    }

    [Fact]
    public void New_entity_defaults_match_the_supported_initial_plan_settings()
    {
        var plan = new Projection();

        plan.Content.ForecastMonths.Should().Be(12);
        plan.Content.Notes.Should().BeNull();
        ProjectionPlanDefaults.ForecastMonthOptions.Should().Equal(12, 18);
    }
}
