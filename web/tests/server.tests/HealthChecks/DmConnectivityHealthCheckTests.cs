using FluentAssertions;
using server.HealthChecks;

namespace server.tests.HealthChecks;

public class DmConnectivityHealthCheckTests
{
    [Fact]
    public void TryParseDmConnectivityResult_parses_expected_shape()
    {
        var row = new Dictionary<string, object?>
        {
            ["Status"] = "Connectivity check PASSED",
            ["SourcesTested"] = 3,
            ["SourcesFailed"] = 0,
        };

        var ok = DmConnectivityHealthCheck.TryParseDmConnectivityResult(row, out var result);

        ok.Should().BeTrue();
        result.Status.Should().Be("Connectivity check PASSED");
        result.SourcesTested.Should().Be(3);
        result.SourcesFailed.Should().Be(0);
    }

    [Fact]
    public void TryParseDmConnectivityResult_is_case_insensitive_and_converts_numeric_types()
    {
        var row = new Dictionary<string, object?>
        {
            ["status"] = "ok",
            ["sourcestested"] = 5m,
            ["sourcesfailed"] = 1L,
        };

        var ok = DmConnectivityHealthCheck.TryParseDmConnectivityResult(row, out var result);

        ok.Should().BeTrue();
        result.Status.Should().Be("ok");
        result.SourcesTested.Should().Be(5);
        result.SourcesFailed.Should().Be(1);
    }

    [Fact]
    public void TryParseDmConnectivityResult_returns_false_when_shape_is_unexpected()
    {
        var row = new Dictionary<string, object?>
        {
            ["Column1"] = 1,
        };

        var ok = DmConnectivityHealthCheck.TryParseDmConnectivityResult(row, out _);

        ok.Should().BeFalse();
    }
}

