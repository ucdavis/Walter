using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.Services;

/// <summary>Builds a plan's funding sources and appointments from a fresh datamart snapshot.</summary>
public sealed class ProjectionSeeder(IProjectionDataSource data, TimeProvider? timeProvider = null)
{
    /// <summary>Captures editable inputs and setup-only roster provenance using one UTC anchor, without constructing a saved entity.</summary>
    public async Task<ProjectionSeedResponse> CaptureDraftAsync(string piEmployeeId, int historyMonths,
        string? applicationUser, string? emulatingUser, CancellationToken ct, DateTime previousSeededAt = default)
    {
        // Resets must advance even with a stalled clock; the query and returned capture always share one anchor.
        var snapshotAtUtc = ProjectionTimestamps.Advance(previousSeededAt,
            (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime);
        var seed = await data.GetProjectionSeedAsync(piEmployeeId, snapshotAtUtc, applicationUser, emulatingUser, ct);
        var prepared = ProjectionSeedPolicy.Prepare(seed, snapshotAtUtc);
        // Include excluded source projects so their dated funding remains outside the prepared plan.
        var projectNumbers = seed.Projects.Select(p => p.ProjectNumber).Distinct().ToList();
        var personnel = projectNumbers.Count == 0
            ? Array.Empty<PositionBudgetRecord>()
            : await data.GetCognosPositionBudgetsAsync(projectNumbers, applicationUser, emulatingUser, ct);
        ApplyRunRates(prepared.FundingSources, historyMonths);

        (bool Known, ProjectionFundingSource? Source) Match(PositionBudgetRecord r)
        {
            var known = prepared.TryMatchFunding(r.ProjectId, r.Task, out var source);
            return (known, source);
        }

        var appointments = new List<ProjectionAppointment>();
        var roster = new List<ProjectionRosterEntry>();
        foreach (var group in personnel.Where(r => !r.IsFuture).GroupBy(r => (r.EmployeeId, r.PositionNumber)))
        {
            var rows = group.ToList();
            var appointment = ToAppointment(appointments.Count + 1, rows, Match);
            appointments.Add(appointment);
            roster.Add(new(appointment.Id, rows.Select(r => r.ProjectId).Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => p!).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList()));
        }
        return new(new("New projection", historyMonths, snapshotAtUtc, prepared.FundingSources, appointments), roster);
    }

    /// <summary>Captures eligible task financials for Add without querying personnel or changing any saved plan.</summary>
    public async Task<List<ProjectionFundingSource>> CaptureSourcesAsync(string piEmployeeId, int historyMonths,
        string? applicationUser, string? emulatingUser, CancellationToken ct)
    {
        var snapshotAtUtc = (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        var seed = await data.GetProjectionSeedAsync(piEmployeeId, snapshotAtUtc, applicationUser, emulatingUser, ct);
        var sources = ProjectionSeedPolicy.Prepare(seed, snapshotAtUtc).FundingSources;
        ApplyRunRates(sources, historyMonths);
        return sources;
    }

    /// <summary>Removes Projected expenses on every source and recreates them from RunRates for the window.</summary>
    public static void ApplyRunRates(IReadOnlyList<ProjectionFundingSource> sources, int historyMonths)
    {
        foreach (var source in sources)
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
            CbrRate = first.CompositeBenefitRate ?? ProjectionAppointmentDefaults.Default.CbrRate,
            VacationAccrualRate = first.VacationAccrual ?? 0,
            ColaRate = ProjectionAppointmentDefaults.Default.ColaRate,
            ColaMonth = ProjectionAppointmentDefaults.Default.ColaMonth,
            StartDate = ToDate(first.JobEffectiveDate),
            EndDate = ToDate(first.JobEndDate),
            IsSeeded = true,
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
            });
        }

        // Count all imported shares before omitting unknown tasks, so their gaps never become outside funding.
        var funded = rows.Sum(r => (r.DistributionPercent ?? 0) / 100 * (r.EarnCodeShare ?? 1));
        if (funded < 1)
            appointment.Allocations.Add(new ProjectionFundingAllocation { Percent = 1 - funded });
        return appointment;
    }

    private static DateOnly? ToDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);
}
