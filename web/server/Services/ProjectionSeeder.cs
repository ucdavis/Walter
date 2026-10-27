using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.Services;

/// <summary>Builds a projection's projects and jobs from a fresh datamart snapshot.</summary>
public sealed class ProjectionSeeder(IProjectionDataSource data)
{
    /// <summary>Replaces projection.Projects and projection.Jobs; sets SeededAt and HistoryMonths.</summary>
    public async Task SeedAsync(Projection projection, int historyMonths,
        string? applicationUser, string? emulatingUser, CancellationToken ct)
    {
        var seed = await data.GetProjectionSeedAsync(projection.PiEmployeeId, applicationUser, emulatingUser, ct);

        var nextId = 1;
        var projects = seed.Projects.ToDictionary(p => (p.ProjectNumber, p.TaskNumber), p => new ProjectionProject
        {
            Id = nextId++,
            ProjectNumber = p.ProjectNumber,
            TaskNumber = p.TaskNumber,
            TaskName = p.TaskName,
            ProjectName = p.ProjectName ?? p.ProjectNumber,
            ProjectType = p.ProjectType,
            AwardNumber = p.AwardNumber,
            AwardName = p.AwardName,
            StartDate = ToDate(p.StartDate),
            EndDate = ToDate(p.EndDate),
            IsSeeded = true,
        });

        foreach (var b in seed.Budgets)
            projects.GetValueOrDefault((b.ProjectNumber, b.TaskNumber))?.Budgets.Add(new ProjectionBudget
            {
                ExpenditureCategory = b.ExpenditureCategory,
                Budget = b.Budget,
                SpentToDate = b.SpentToDate,
                Committed = b.Committed,
                IsSeeded = true,
            });
        foreach (var a in seed.Actuals)
            projects.GetValueOrDefault((a.ProjectNumber, a.TaskNumber))?.Actuals.Add(new ProjectionActual
            {
                Month = DateOnly.FromDateTime(a.Month),
                ExpenditureCategory = a.ExpenditureCategory,
                Amount = a.Amount,
            });
        foreach (var r in seed.RunRates)
            projects.GetValueOrDefault((r.ProjectNumber, r.TaskNumber))?.RunRates.Add(new ProjectionRunRate
            {
                ExpenditureCategory = r.ExpenditureCategory,
                HistoryMonths = r.HistoryMonths,
                MonthlyAmount = r.MonthlyAmount,
            });

        projection.Projects = [.. projects.Values];
        projection.SeededAt = DateTime.UtcNow;
        ApplyRunRates(projection, historyMonths);

        var projectNumbers = projects.Keys.Select(k => k.ProjectNumber).Distinct().ToList();
        var personnel = await data.GetCognosPositionBudgetsAsync(projectNumbers, applicationUser, emulatingUser, ct);

        // Sponsored lines may carry a task that matches no portfolio row; charge the project's first task.
        ProjectionProject? Match(PositionBudgetRecord r) =>
            projects.GetValueOrDefault((r.ProjectId ?? "", r.Task))
            ?? projection.Projects.FirstOrDefault(p => p.ProjectNumber == r.ProjectId);

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
            CbrRate = first.CompositeBenefitRate,
            VacationAccrualRate = first.VacationAccrual ?? 0,
            StartDate = ToDate(first.JobEffectiveDate),
            EndDate = ToDate(first.JobEndDate),
            IsSeeded = true,
        };
        if (unsplit) return job;

        foreach (var r in rows)
        {
            var project = match(r);
            if (project is null) continue;
            job.FundingEntries.Add(new ProjectionFundingEntry
            {
                ProjectId = project.Id,
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
