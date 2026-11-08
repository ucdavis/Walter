using server.core.Domain;
using server.core.Models;

namespace server.Services;

/// <summary>Applies dashboard visibility to fresh seed inputs and combines eligible tasks by project.</summary>
internal static class ProjectionSeedPolicy
{
    /// <summary>Filters fresh task inputs at the UTC capture date and aggregates their financials without mutating the source.</summary>
    public static PreparedSeed Prepare(ProjectionSeedData seed, DateTime snapshotAtUtc)
    {
        var snapshotDate = DateOnly.FromDateTime(snapshotAtUtc);
        var projects = new List<ProjectionProject>();
        var taskProjects = new Dictionary<(string ProjectNumber, string TaskNumber), ProjectionProject?>();
        var budgets = seed.Budgets.ToLookup(b => b.ProjectNumber);
        var actuals = seed.Actuals.ToLookup(a => a.ProjectNumber);
        var runRates = seed.RunRates.ToLookup(r => r.ProjectNumber);

        foreach (var group in seed.Projects.GroupBy(p => p.ProjectNumber).OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            // Retain excluded keys so personnel matching cannot redirect their funding to another task.
            foreach (var task in group)
                taskProjects[TaskKey(task.ProjectNumber, task.TaskNumber)] = null;

            var awardEndDate = ToDate(group.Max(p => p.AwardEndDate));
            var tasks = group
                .Where(p => p.ProjectType == "Internal"
                    ? p.TaskStatus != "Inactive"
                    : awardEndDate is null || awardEndDate >= snapshotDate)
                .OrderBy(p => p.TaskNumber ?? "", StringComparer.Ordinal)
                .ToList();
            if (tasks.Count == 0) continue;

            var first = tasks[0];
            var taskNumbers = tasks.Select(p => p.TaskNumber ?? "").ToHashSet(StringComparer.Ordinal);
            var project = new ProjectionProject
            {
                Id = projects.Count + 1,
                ProjectNumber = group.Key,
                ProjectName = first.ProjectName ?? group.Key,
                ProjectType = first.ProjectType,
                AwardNumber = first.AwardNumber,
                AwardName = first.AwardName,
                StartDate = ToDate(tasks.Min(p => p.StartDate)),
                EndDate = ToDate(tasks.Max(p => p.EndDate)),
                IsSeeded = true,
                Budgets = budgets[group.Key]
                    .Where(b => taskNumbers.Contains(b.TaskNumber ?? ""))
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
                Actuals = actuals[group.Key]
                    .Where(a => taskNumbers.Contains(a.TaskNumber ?? ""))
                    .GroupBy(a => (a.ExpenditureCategory, Month: DateOnly.FromDateTime(a.Month)))
                    .OrderBy(g => g.Key.Month)
                    .ThenBy(g => g.Key.ExpenditureCategory, StringComparer.Ordinal)
                    .Select(g => new ProjectionActual
                    {
                        ExpenditureCategory = g.Key.ExpenditureCategory,
                        Month = g.Key.Month,
                        Amount = g.Sum(a => a.Amount),
                    }).ToList(),
                // Sum captured task averages without changing each task's source history window.
                RunRates = runRates[group.Key]
                    .Where(r => taskNumbers.Contains(r.TaskNumber ?? ""))
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
            projects.Add(project);
            foreach (var task in tasks)
                taskProjects[TaskKey(task.ProjectNumber, task.TaskNumber)] = project;
        }

        return new PreparedSeed(projects, taskProjects);
    }

    private static (string ProjectNumber, string TaskNumber) TaskKey(string? projectNumber, string? taskNumber) =>
        (projectNumber ?? "", taskNumber ?? "");

    private static DateOnly? ToDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);

    internal sealed class PreparedSeed(
        List<ProjectionProject> projects,
        IReadOnlyDictionary<(string ProjectNumber, string TaskNumber), ProjectionProject?> taskProjects)
    {
        public List<ProjectionProject> Projects { get; } = projects;
        private readonly Dictionary<string, ProjectionProject> _projects = projects.ToDictionary(p => p.ProjectNumber!);

        /// <summary>Preserves excluded-task funding outside the plan while allowing unmatched source task identifiers.</summary>
        public ProjectionProject? MatchFunding(string? projectNumber, string? taskNumber)
        {
            // A known excluded task must remain outside, even when another task on its project is retained.
            if (taskProjects.TryGetValue(TaskKey(projectNumber, taskNumber), out var project))
                return project;

            // Cognos can use a task absent from portfolio rows; retain its existing project-level fallback.
            return _projects.GetValueOrDefault(projectNumber ?? "");
        }
    }
}
