using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.Services;

/// <summary>Builds a plan's funding sources and appointments from a fresh datamart snapshot.</summary>
public sealed class ProjectionSeeder(IProjectionDataSource data, TimeProvider? timeProvider = null)
{
    /// <summary>Captures the latest imported inputs using one UTC snapshot anchor; replaces sources, appointments, SeededAt, and HistoryMonths.</summary>
    public async Task SeedAsync(Projection projection, int historyMonths,
        string? applicationUser, string? emulatingUser, CancellationToken ct)
    {
        // Keep the query's month and saved snapshot identical across retries or a month boundary.
        var snapshotAtUtc = ProjectionTimestamps.Advance(projection.SeededAt,
            (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime);
        var seed = await data.GetProjectionSeedAsync(projection.PiEmployeeId, snapshotAtUtc,
            applicationUser, emulatingUser, ct);

        var prepared = ProjectionSeedPolicy.Prepare(seed, snapshotAtUtc);
        // Include excluded source projects so their dated funding remains outside the prepared plan.
        var projectNumbers = seed.Projects.Select(p => p.ProjectNumber).Distinct().ToList();
        var personnel = projectNumbers.Count == 0
            ? Array.Empty<PositionBudgetRecord>()
            : await data.GetCognosPositionBudgetsAsync(projectNumbers, applicationUser, emulatingUser, ct);

        projection.FundingSources = prepared.FundingSources;
        projection.SeededAt = snapshotAtUtc;
        ApplyRunRates(projection, historyMonths);

        (bool Known, ProjectionFundingSource? Source) Match(PositionBudgetRecord r)
        {
            var known = prepared.TryMatchFunding(r.ProjectId, r.Task, out var source);
            return (known, source);
        }

        projection.Appointments = personnel
            .Where(r => !r.IsFuture)
            .GroupBy(r => (r.EmployeeId, r.PositionNumber))
            .Select((g, i) => ToAppointment(i + 1, g.ToList(), Match))
            .ToList();
    }

    /// <summary>Captures eligible task financials for Add without querying personnel or changing any saved plan.</summary>
    public async Task<List<ProjectionFundingSource>> CaptureSourcesAsync(string piEmployeeId, int historyMonths,
        string? applicationUser, string? emulatingUser, CancellationToken ct)
    {
        var snapshotAtUtc = (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        var seed = await data.GetProjectionSeedAsync(piEmployeeId, snapshotAtUtc, applicationUser, emulatingUser, ct);
        var projection = new Projection { FundingSources = ProjectionSeedPolicy.Prepare(seed, snapshotAtUtc).FundingSources };
        ApplyRunRates(projection, historyMonths);
        return projection.FundingSources;
    }

    /// <summary>Removes Projected expenses on every source and recreates them from RunRates for the window.</summary>
    public static void ApplyRunRates(Projection projection, int historyMonths)
    {
        projection.HistoryMonths = historyMonths;
        foreach (var source in projection.FundingSources)
        {
            source.Expenses.RemoveAll(e => e.Kind == ProjectionExpenseKind.Projected);
            source.Expenses.AddRange(source.RunRates
                .Where(r => r.HistoryMonths == historyMonths && r.MonthlyAmount != 0)
                .Select(r => new ProjectionExpense
                {
                    Kind = ProjectionExpenseKind.Projected,
                    ExpenditureCategory = r.ExpenditureCategory,
                    Amount = r.MonthlyAmount,
                }));
        }
    }

    private static ProjectionAppointment ToAppointment(int id, List<PositionBudgetRecord> rows,
        Func<PositionBudgetRecord, (bool Known, ProjectionFundingSource? Source)> match)
    {
        var first = rows[0];
        var unsplit = rows.Any(r => r.EarnCodeStatus == "Unsplit");
        var appointment = new ProjectionAppointment
        {
            Id = id,
            EmployeeId = first.EmployeeId,
            PositionNumber = first.PositionNumber,
            Name = first.Name ?? first.EmployeeId ?? "",
            JobCode = first.JobCode,
            Title = first.PositionDescription,
            RateSet = first.BusinessUnit ?? "DVCMP",
            MonthlySalary = unsplit ? null : first.MonthlyRate,
            Fte = first.Fte ?? 0,
            CbrRate = first.CompositeBenefitRate ?? 0,
            VacationAccrualRate = first.VacationAccrual ?? 0,
            StartDate = ToDate(first.JobEffectiveDate),
            EndDate = ToDate(first.JobEndDate),
            IsSeeded = true,
            SourceProjectNumbers = rows.Select(r => r.ProjectId).Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => p!).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList(),
            HasUnmatchedFunding = rows.Any(r => !match(r).Known),
        };
        if (unsplit) return appointment;

        foreach (var r in rows)
        {
            var matched = match(r);
            if (!matched.Known) continue;
            appointment.Allocations.Add(new ProjectionFundingAllocation
            {
                FundingSourceId = matched.Source?.Id,
                Percent = (r.DistributionPercent ?? 0) / 100 * (r.EarnCodeShare ?? 1),
                StartDate = ToDate(r.FundingEffectiveDate),
                EndDate = ToDate(r.FundingEndDate),
                IsSeeded = true,
            });
        }

        // Count all imported shares before omitting unknown tasks, so their gaps never become outside funding.
        var funded = rows.Sum(r => (r.DistributionPercent ?? 0) / 100 * (r.EarnCodeShare ?? 1));
        if (funded < 1)
            appointment.Allocations.Add(new ProjectionFundingAllocation { Percent = 1 - funded, IsSeeded = true });
        return appointment;
    }

    private static DateOnly? ToDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);
}
