using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.Services;

/// <summary>Builds a projection's projects and jobs from a fresh datamart snapshot.</summary>
public sealed class ProjectionSeeder(IProjectionDataSource data, TimeProvider? timeProvider = null)
{
    /// <summary>Captures the latest imported inputs using one UTC snapshot anchor; replaces projects, jobs, SeededAt, and HistoryMonths.</summary>
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

        projection.Projects = prepared.Projects;
        projection.SeededAt = snapshotAtUtc;
        ApplyRunRates(projection, historyMonths);

        ProjectionProject? Match(PositionBudgetRecord r) =>
            prepared.MatchFunding(r.ProjectId, r.Task);

        projection.Jobs = personnel
            .Where(r => !r.IsFuture)
            .GroupBy(r => (r.EmployeeId, r.PositionNumber))
            .Select((g, i) => ToJob(i + 1, g.ToList(), Match))
            .ToList();
    }

    /// <summary>Removes Projected expenses on every project and recreates them from RunRates for the window.</summary>
    public static void ApplyRunRates(Projection projection, int historyMonths)
    {
        projection.HistoryMonths = historyMonths;
        foreach (var project in projection.Projects)
        {
            project.Expenses.RemoveAll(e => e.Kind == ProjectionExpenseKind.Projected);
            project.Expenses.AddRange(project.RunRates
                .Where(r => r.HistoryMonths == historyMonths && r.MonthlyAmount != 0)
                .Select(r => new ProjectionExpense
                {
                    Kind = ProjectionExpenseKind.Projected,
                    ExpenditureCategory = r.ExpenditureCategory,
                    Amount = r.MonthlyAmount,
                }));
        }
    }

    private static ProjectionJob ToJob(int id, List<PositionBudgetRecord> rows, Func<PositionBudgetRecord, ProjectionProject?> match)
    {
        var first = rows[0];
        var unsplit = rows.Any(r => r.EarnCodeStatus == "Unsplit");
        var job = new ProjectionJob
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
        };
        if (unsplit) return job;

        foreach (var r in rows)
        {
            var project = match(r);
            job.FundingEntries.Add(new ProjectionFundingEntry
            {
                ProjectId = project?.Id,
                Percent = (r.DistributionPercent ?? 0) / 100 * (r.EarnCodeShare ?? 1),
                StartDate = ToDate(r.FundingEffectiveDate),
                EndDate = ToDate(r.FundingEndDate),
                IsSeeded = true,
            });
        }

        // The rest of the person's pay comes from projects outside this portfolio.
        var funded = job.FundingEntries.Sum(f => f.Percent);
        if (funded < 1)
            job.FundingEntries.Add(new ProjectionFundingEntry { Percent = 1 - funded, IsSeeded = true });
        return job;
    }

    private static DateOnly? ToDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);
}
