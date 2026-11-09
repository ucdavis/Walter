using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Server.Tests;
using server.core.Domain;

namespace server.tests.Domain;

public sealed class ProjectionBenefitSerializationTests
{
    public static TheoryData<string, decimal> StoredAppointments => new()
    {
        { """[{"id":1,"cbrRate":0,"vacationAccrualRate":0.083}]""", 0m },
        { """[{"id":1,"cbrRate":0.32175,"vacationAccrualRate":0.083}]""", 0.32175m },
        { """[{"id":1,"cbrRate":"0.32175","vacationAccrualRate":0.083}]""", 0.32175m },
    };

    [Theory]
    [MemberData(nameof(StoredAppointments))]
    public void Stored_appointments_load_with_numeric_cbr_and_round_trip_without_changing_supplied_rates(string storedJson, decimal expectedCbr)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var converter = ctx.Model.FindEntityType(typeof(Projection))!
            .FindProperty(nameof(Projection.Appointments))!.GetValueConverter()!;

        var jobs = (List<ProjectionAppointment>)converter.ConvertFromProvider(storedJson)!;

        var job = jobs.Should().ContainSingle().Subject;
        job.CbrRate.Should().Be(expectedCbr);
        job.VacationAccrualRate.Should().Be(0.083m);
        job.MonthlySalary.Should().BeNull();

        var savedJson = (string)converter.ConvertToProvider(jobs)!;
        using var document = JsonDocument.Parse(savedJson);
        var savedJob = document.RootElement[0];
        savedJob.GetProperty("cbrRate").ValueKind.Should().Be(JsonValueKind.Number);
        savedJob.GetProperty("cbrRate").GetDecimal().Should().Be(expectedCbr);
        savedJob.GetProperty("vacationAccrualRate").GetDecimal().Should().Be(0.083m);

        var reloaded = (List<ProjectionAppointment>)converter.ConvertFromProvider(savedJson)!;
        reloaded.Single().CbrRate.Should().Be(expectedCbr);
        reloaded.Single().VacationAccrualRate.Should().Be(0.083m);
    }

    [Theory]
    [InlineData("\"not a rate\"")]
    [InlineData("null")]
    [InlineData("true")]
    [InlineData("{}")]
    public void Malformed_cbr_values_are_rejected_instead_of_defaulted(string cbrJson)
    {
        var json = $$"""{"cbrRate":{{cbrJson}}}""";

        var deserialize = () => JsonSerializer.Deserialize<ProjectionAppointment>(json,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        deserialize.Should().Throw<JsonException>();
    }

    [Fact]
    public void Missing_cbr_is_rejected_instead_of_silently_becoming_an_explicit_zero()
    {
        var deserialize = () => JsonSerializer.Deserialize<ProjectionAppointment>("""{"id":1}""",
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        deserialize.Should().Throw<JsonException>();
    }
}
