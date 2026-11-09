using server.core.Domain;
using server.core.Models;

namespace server.Services;

/// <summary>Applies dashboard visibility to fresh inputs while retaining each eligible task as an independent source.</summary>
internal static class ProjectionSeedPolicy
{
    /// <summary>Filters at the UTC capture date without combining task balances, history, or funding identities.</summary>
    public static PreparedSeed Prepare(ProjectionSeedData seed, DateTime snapshotAtUtc)
    {
        var snapshotDate = DateOnly.FromDateTime(snapshotAtUtc);
        var sources = new List<ProjectionFundingSource>();
        var taskSources = new Dictionary<(string ProjectNumber, string TaskNumber), ProjectionFundingSource?>();
        var budgets = seed.Budgets.ToLookup(b => TaskKey(b.ProjectNumber, b.TaskNumber));
        var actuals = seed.Actuals.ToLookup(a => TaskKey(a.ProjectNumber, a.TaskNumber));
        var runRates = seed.RunRates.ToLookup(r => TaskKey(r.ProjectNumber, r.TaskNumber));

        foreach (var group in seed.Projects.GroupBy(p => p.ProjectNumber).OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            // Remember excluded keys so their genuine outside funding remains distinct from unmatched tasks.
            foreach (var task in group)
                taskSources[TaskKey(task.ProjectNumber, task.TaskNumber)] = null;

            var awardEndDate = ToDate(group.Max(p => p.AwardEndDate));
            var tasks = group
                .Where(p => p.ProjectType == "Internal"
                    ? p.TaskStatus != "Inactive"
                    : awardEndDate is null || awardEndDate >= snapshotDate)
                .GroupBy(p => TaskKey(p.ProjectNumber, p.TaskNumber))
                .Select(g => g.First())
                .OrderBy(p => p.TaskNumber ?? "", StringComparer.Ordinal);
            foreach (var task in tasks)
            {
                var key = TaskKey(task.ProjectNumber, task.TaskNumber);
                var source = new ProjectionFundingSource
                {
                    Id = sources.Count + 1,
                    ProjectNumber = task.ProjectNumber,
                    TaskNumber = string.IsNullOrEmpty(task.TaskNumber) ? null : task.TaskNumber,
                    TaskName = task.TaskName,
                    ProjectName = task.ProjectName ?? task.ProjectNumber,
                    ProjectType = task.ProjectType,
                    AwardNumber = task.AwardNumber,
                    AwardName = task.AwardName,
                    SourceKind = ProjectionSourceKind.Task,
                    CapturedAt = snapshotAtUtc,
                    CapturedStartDate = ToDate(task.StartDate),
                    CapturedEndDate = ToDate(task.EndDate),
                    StartDate = ToDate(task.StartDate),
                    EndDate = ToDate(task.EndDate),
                    IsSeeded = true,
                    Budgets = budgets[key]
                        .GroupBy(b => b.ExpenditureCategory)
                        .OrderBy(g => g.Key, StringComparer.Ordinal)
                        .Select(g => new ProjectionBudget
                        {
                            ExpenditureCategory = g.Key,
                            Budget = g.Sum(b => b.Budget),
                            SpentToDate = g.Sum(b => b.SpentToDate),
                            Committed = g.Sum(b => b.Committed),
                            IsSeeded = true,
                        }).ToList(),
                    Actuals = actuals[key]
                        .GroupBy(a => (a.ExpenditureCategory, Month: DateOnly.FromDateTime(a.Month)))
                        .OrderBy(g => g.Key.Month)
                        .ThenBy(g => g.Key.ExpenditureCategory, StringComparer.Ordinal)
                        .Select(g => new ProjectionActual
                        {
                            ExpenditureCategory = g.Key.ExpenditureCategory,
                            Month = g.Key.Month,
                            Amount = g.Sum(a => a.Amount),
                        }).ToList(),
                    RunRates = runRates[key]
                        .GroupBy(r => (r.ExpenditureCategory, r.HistoryMonths))
                        .OrderBy(g => g.Key.ExpenditureCategory, StringComparer.Ordinal)
                        .ThenBy(g => g.Key.HistoryMonths)
                        .Select(g => new ProjectionRunRate
                        {
                            ExpenditureCategory = g.Key.ExpenditureCategory,
                            HistoryMonths = g.Key.HistoryMonths,
                            MonthlyAmount = g.Sum(r => r.MonthlyAmount),
                        }).ToList(),
                };
                sources.Add(source);
                taskSources[key] = source;
            }
        }

        return new PreparedSeed(sources, taskSources);
    }

    internal static (string ProjectNumber, string TaskNumber) TaskKey(string? projectNumber, string? taskNumber) =>
        (projectNumber ?? "", taskNumber ?? "");

    private static DateOnly? ToDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);

    internal sealed class PreparedSeed(
        List<ProjectionFundingSource> sources,
        IReadOnlyDictionary<(string ProjectNumber, string TaskNumber), ProjectionFundingSource?> taskSources)
    {
        public List<ProjectionFundingSource> FundingSources { get; } = sources;

        /// <summary>Known excluded tasks are outside funding; blank or unknown tasks must remain unallocated rather than guessed.</summary>
        public bool TryMatchFunding(string? projectNumber, string? taskNumber, out ProjectionFundingSource? source)
        {
            source = null;
            return !string.IsNullOrWhiteSpace(taskNumber)
                && taskSources.TryGetValue(TaskKey(projectNumber, taskNumber), out source);
        }
    }
}
