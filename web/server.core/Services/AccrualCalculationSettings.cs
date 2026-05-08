using server.core.Models;

namespace server.core.Services;

public sealed class AccrualCalculationSettings
{
    private static readonly StringComparer ClassificationComparer = StringComparer.OrdinalIgnoreCase;

    public static AccrualCalculationSettings Current { get; } = new(
        approachingThresholdPct: 80m,
        atCapThresholdPct: 96m,
        facultyLikeBenefitsRate: 0.41m,
        defaultBenefitsRate: 0.51m,
        defaultAcademicRate: 70m,
        defaultStaffRate: 45m,
        facultyLikeClassifications:
        [
            "FY Acad Admin",
            "FY Acad Coord",
            "FY Faculty",
        ],
        hourlyRateBuckets:
        [
            new RateBucket("FY Acad Admin", 65m),
            new RateBucket("FY Acad Coord", 62m),
            new RateBucket("FY Faculty", 78m),
            new RateBucket("FY Researcher", 68m),
            new RateBucket("MSP", 52m),
            new RateBucket("PSS", 32.5m),
            new RateBucket("SMG", 72m),
        ],
        fallbackAccrualTiers:
        [
            new FallbackAccrualTier(384m, 16m),
            new FallbackAccrualTier(368m, 15.33m),
            new FallbackAccrualTier(352m, 14.67m),
            new FallbackAccrualTier(336m, 14m),
            new FallbackAccrualTier(320m, 13.33m),
            new FallbackAccrualTier(288m, 12m),
            new FallbackAccrualTier(240m, 10m),
        ]);

    private readonly HashSet<string> _facultyLikeClassificationSet;

    private AccrualCalculationSettings(
        decimal approachingThresholdPct,
        decimal atCapThresholdPct,
        decimal facultyLikeBenefitsRate,
        decimal defaultBenefitsRate,
        decimal defaultAcademicRate,
        decimal defaultStaffRate,
        IReadOnlyList<string> facultyLikeClassifications,
        IReadOnlyList<RateBucket> hourlyRateBuckets,
        IReadOnlyList<FallbackAccrualTier> fallbackAccrualTiers)
    {
        ApproachingThresholdPct = approachingThresholdPct;
        AtCapThresholdPct = atCapThresholdPct;
        FacultyLikeBenefitsRate = facultyLikeBenefitsRate;
        DefaultBenefitsRate = defaultBenefitsRate;
        DefaultAcademicRate = defaultAcademicRate;
        DefaultStaffRate = defaultStaffRate;
        FacultyLikeClassifications = facultyLikeClassifications;
        HourlyRateBuckets = hourlyRateBuckets;
        FallbackAccrualTiers = fallbackAccrualTiers;
        _facultyLikeClassificationSet = new HashSet<string>(facultyLikeClassifications, ClassificationComparer);
    }

    public decimal ApproachingThresholdPct { get; }
    public decimal AtCapThresholdPct { get; }
    public decimal DefaultAcademicRate { get; }
    public decimal DefaultBenefitsRate { get; }
    public decimal DefaultStaffRate { get; }
    public decimal FacultyLikeBenefitsRate { get; }
    public IReadOnlyList<string> FacultyLikeClassifications { get; }
    public IReadOnlyList<FallbackAccrualTier> FallbackAccrualTiers { get; }
    public IReadOnlyList<RateBucket> HourlyRateBuckets { get; }

    public decimal GetBenefitsRate(string classification)
    {
        return _facultyLikeClassificationSet.Contains(classification)
            ? FacultyLikeBenefitsRate
            : DefaultBenefitsRate;
    }

    public decimal GetHourlyRate(string classification)
    {
        foreach (var bucket in HourlyRateBuckets)
        {
            if (ClassificationComparer.Equals(bucket.Label, classification))
            {
                return bucket.HourlyRate;
            }
        }

        return classification.Contains("Academic", StringComparison.OrdinalIgnoreCase)
            ? DefaultAcademicRate
            : DefaultStaffRate;
    }

    public decimal GetLoadedHourlyRate(string classification, decimal? hourlyRate = null)
    {
        var baseRate = hourlyRate ?? GetHourlyRate(classification);
        return baseRate * (1m + GetBenefitsRate(classification));
    }

    public decimal GetNormalMonthlyAccrual(decimal accrualLimit)
    {
        foreach (var tier in FallbackAccrualTiers)
        {
            if (accrualLimit >= tier.MinCapHours)
            {
                return tier.MonthlyAccrualHours;
            }
        }

        return FallbackAccrualTiers[^1].MonthlyAccrualHours;
    }

    public AccrualAssumptionsResponse ToResponse()
    {
        var benefitsRates = FacultyLikeClassifications
            .Select(classification => new AccrualBenefitsRateRow
            {
                Label = classification,
                Rate = FacultyLikeBenefitsRate,
            })
            .Append(new AccrualBenefitsRateRow
            {
                Label = "All other classes",
                Rate = DefaultBenefitsRate,
            })
            .ToList();

        var hourlyRates = HourlyRateBuckets
            .Select(bucket => new AccrualHourlyRateRow
            {
                HourlyRate = bucket.HourlyRate,
                Label = bucket.Label,
            })
            .Append(new AccrualHourlyRateRow
            {
                HourlyRate = DefaultAcademicRate,
                Label = "Fallback academic",
            })
            .Append(new AccrualHourlyRateRow
            {
                HourlyRate = DefaultStaffRate,
                Label = "Fallback staff",
            })
            .ToList();

        var fallbackTiers = FallbackAccrualTiers
            .Select(tier => new AccrualFallbackAccrualTierRow
            {
                Label = $"{tier.MinCapHours:0}+ cap hours",
                MonthlyAccrualHours = tier.MonthlyAccrualHours,
            })
            .Append(new AccrualFallbackAccrualTierRow
            {
                Label = $"Below {FallbackAccrualTiers[^1].MinCapHours:0} cap hours",
                MonthlyAccrualHours = FallbackAccrualTiers[^1].MonthlyAccrualHours,
            })
            .ToList();

        return new AccrualAssumptionsResponse
        {
            ApproachingThresholdPct = ApproachingThresholdPct,
            AtCapThresholdPct = AtCapThresholdPct,
            BenefitsRates = benefitsRates,
            FallbackAccrualTiers = fallbackTiers,
            HourlyRates = hourlyRates,
        };
    }

    public sealed record FallbackAccrualTier(decimal MinCapHours, decimal MonthlyAccrualHours);

    public sealed record RateBucket(string Label, decimal HourlyRate);
}
