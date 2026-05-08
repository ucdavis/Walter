namespace server.core.Models;

public sealed class AccrualAssumptionsResponse
{
    public decimal ApproachingThresholdPct { get; init; }
    public decimal AtCapThresholdPct { get; init; }
    public IReadOnlyList<AccrualBenefitsRateRow> BenefitsRates { get; init; } = [];
    public IReadOnlyList<AccrualFallbackAccrualTierRow> FallbackAccrualTiers { get; init; } = [];
    public IReadOnlyList<AccrualHourlyRateRow> HourlyRates { get; init; } = [];
}

public sealed class AccrualBenefitsRateRow
{
    public string Label { get; init; } = string.Empty;
    public decimal Rate { get; init; }
}

public sealed class AccrualHourlyRateRow
{
    public string Label { get; init; } = string.Empty;
    public decimal HourlyRate { get; init; }
}

public sealed class AccrualFallbackAccrualTierRow
{
    public string Label { get; init; } = string.Empty;
    public decimal MonthlyAccrualHours { get; init; }
}
