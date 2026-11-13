using System.Globalization;
using server.core.Models;
using server.core.Services;
using server.Helpers;

namespace Server.Demo;

/// <summary>Serves only invented data; unknown people and projects return nothing.</summary>
public sealed class DemoDataSource(DateTime? referenceDate = null)
{
    /// <summary>First of the reference month; read per call so a long-lived instance follows the calendar.</summary>
    private DateTime Month
    {
        get
        {
            var date = referenceDate ?? DateTime.UtcNow;
            return new DateTime(date.Year, date.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        }
    }

    public Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(string iamId, CancellationToken ct = default) =>
        Result(DemoDataSet.CreatePeople().FirstOrDefault(p => Equal(p.IamId, iamId)), ct);

    public Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(string employeeId, CancellationToken ct = default) =>
        Result(DemoDataSet.CreatePeople().FirstOrDefault(p => Equal(p.EmployeeId, employeeId)), ct);

    public Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(IEnumerable<string> employeeIds, CancellationToken ct = default)
    {
        var ids = Requested(employeeIds);
        return Result<IReadOnlyList<SearchablePersonRecord>>(DemoDataSet.CreatePeople().Where(p => ids.Contains(p.EmployeeId)).ToArray(), ct);
    }

    public Task<IReadOnlyList<PpmProjectMembership>> GetEmployeeProjectsAsync(string employeeId, string roleName, CancellationToken ct = default) =>
        Result<IReadOnlyList<PpmProjectMembership>>(DemoDataSet.CreateMemberships()
            .Where(p => p.TeamMembers.Any(m => Equal(m.EmployeeId, employeeId) && Equal(m.RoleName, roleName))).ToArray(), ct);

    public Task<IReadOnlyList<PpmTeamMember>> GetProjectTeamAsync(string projectNumber, string roleName, CancellationToken ct = default) =>
        Result<IReadOnlyList<PpmTeamMember>>(DemoDataSet.CreateMemberships().Where(p => Equal(p.ProjectNumber, projectNumber))
            .SelectMany(p => p.TeamMembers).Where(m => Equal(m.RoleName, roleName)).ToArray(), ct);

    public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var ids = Requested(projectNumbers);
        // Controllers enrich these rows; fresh instances keep one request's changes out of others.
        return Result<IReadOnlyList<FacultyPortfolioRecord>>(DemoDataSet.CreatePortfolio(Month).Where(p => ids.Contains(p.ProjectNumber)).ToArray(), ct);
    }

    public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var ids = Requested(projectNumbers);
        return Result<IReadOnlyList<PositionBudgetRecord>>(DemoDataSet.CreatePersonnel(Month).Where(p => p.ProjectId is not null && ids.Contains(p.ProjectId)).ToArray(), ct);
    }

    public Task<IReadOnlyList<ProjectCostRecord>> GetProjectCostsAsync(string projectNumber, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default) =>
        Result<IReadOnlyList<ProjectCostRecord>>(DemoDataSet.CreateCosts(Month).Where(p => Equal(p.ProjectNumber, projectNumber)).ToArray(), ct);

    public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var ids = Requested(projectNumbers);
        var transactions = DemoDataSet.CreateCosts(Month).Where(p => ids.Contains(p.ProjectNumber)).Select(p => new GLTransactionRecord
        {
            Entity = "DEMO",
            EntityDescription = "Fictional Demonstration Entity",
            Project = p.ProjectNumber,
            ProjectDescription = p.ProjectName,
            Fund = "DEMO-FUND",
            FundDescription = "Fictional Research Fund",
            FinancialDepartment = "DEMO-DEPT",
            FinancialDepartmentDescription = p.ProjectOwningOrgName,
            Account = $"DEMO-{p.ExpenditureCategory[..2]}",
            AccountDescription = p.ExpenditureCategory[5..],
            Purpose = "DEMO-PURPOSE",
            PurposeDescription = "Demonstration Research",
            Program = "DEMO-PROGRAM",
            ProgramDescription = "Imaginary Research Program",
            Activity = "DEMO-ACTIVITY",
            ActivityDescription = "Presentation Examples",
            DocumentType = "DEMO",
            AccountingSequenceNumber = p.TransactionNumber.ToString(CultureInfo.InvariantCulture),
            TrackingNo = p.Document,
            Reference = p.Document,
            JournalLineDescription = p.Comment,
            JournalAcctDate = p.AccountingDate,
            JournalName = $"DEMO {p.ExpenditureCategory}",
            JournalReference = p.Document,
            PeriodName = p.AccountingPeriod,
            JournalBatchName = p.ExpenditureBatch,
            JournalSource = "Fictional presentation data",
            JournalCategory = p.ExpenditureCategory,
            BatchStatus = "P",
            ActualFlag = "A",
            ActualAmount = p.BurdenedCost,
            NaturalAccountType = "5 - Expense",
        }).ToList();
        transactions.AddRange(DemoDataSet.CreatePortfolio(Month).Where(p => ids.Contains(p.ProjectNumber))
            .GroupBy(p => p.ProjectNumber).Select(group => new GLTransactionRecord
            {
                Entity = "DEMO",
                EntityDescription = "Fictional Demonstration Entity",
                Project = group.Key,
                ProjectDescription = group.First().ProjectName,
                Fund = "DEMO-FUND",
                FundDescription = "Fictional Research Fund",
                FinancialDepartment = "DEMO-DEPT",
                FinancialDepartmentDescription = "Department of Imaginary Research",
                Account = "DEMO-REVENUE",
                AccountDescription = "Fictional project funding",
                Purpose = "DEMO-PURPOSE",
                PurposeDescription = "Demonstration Research",
                Program = "DEMO-PROGRAM",
                ProgramDescription = "Imaginary Research Program",
                Activity = "DEMO-ACTIVITY",
                ActivityDescription = "Presentation Examples",
                DocumentType = "DEMO",
                Reference = $"DEMO-FUNDING-{group.Key}",
                JournalLineDescription = "Entirely invented opening project funding",
                JournalAcctDate = Month.AddMonths(-12),
                PeriodName = Month.AddMonths(-12).ToString("MMM-yy", CultureInfo.InvariantCulture),
                JournalName = "DEMO opening funding",
                JournalSource = "Fictional presentation data",
                BatchStatus = "P",
                ActualFlag = "A",
                ActualAmount = -group.Sum(p => p.PpmBudget),
                NaturalAccountType = "4 - Revenue",
            }));
        return Result<IReadOnlyList<GLTransactionRecord>>(transactions, ct);
    }

    public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(IEnumerable<string> projectNumbers, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        var ids = Requested(projectNumbers);
        return Result<IReadOnlyList<GLPPMReconciliationRecord>>(DemoDataSet.CreatePortfolio(Month).Where(p => ids.Contains(p.ProjectNumber))
            .GroupBy(p => p.ProjectNumber).Select(group => new GLPPMReconciliationRecord
            {
                Project = group.Key,
                ProjectDescription = group.First().ProjectName,
                FinancialDepartment = "DEMO-DEPT",
                FundCode = "DEMO-FUND",
                FundDescription = "Fictional Research Fund",
                PpmFundCode = "DEMO-FUND",
                PpmFundDescription = "Fictional Research Fund",
                ProgramCode = "DEMO-PROGRAM",
                ProgramDescription = "Imaginary Research Program",
                ActivityCode = "DEMO-ACTIVITY",
                ActivityDescription = "Presentation Examples",
                GlActualAmount = group.Sum(p => p.PpmExpenses - p.PpmBudget),
                PpmBudget = group.Sum(p => p.PpmBudget),
                // Reconciliation compares actuals only; its PPM balance excludes the portfolio's commitments.
                PpmItdExp = group.Sum(p => p.PpmExpenses),
                PpmBudBal = group.Sum(p => p.PpmBudget - p.PpmExpenses),
                RemainingBalance = 0m,
                DataSource = "Both",
            }).ToArray(), ct);
    }

    public Task<ProjectProjectionResult> GetProjectProjectionAsync(string projectNumber, int historyMonths, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        if (historyMonths is not (3 or 6 or 12)) throw new ArgumentOutOfRangeException(nameof(historyMonths));
        var rows = DemoDataSet.CreatePortfolio(Month).Where(p => Equal(p.ProjectNumber, projectNumber)).ToArray();
        return Result(new ProjectProjectionResult
        {
            Categories = rows.Select(p => new ProjectProjectionCategory
            {
                ExpenditureCategory = p.ExpenditureCategoryName!,
                IsPersonnel = IsPersonnel(p.ExpenditureCategoryName),
                Budget = p.PpmBudget,
                SpentToDate = p.PpmExpenses,
                Committed = p.PpmCommitments,
                RemainingNow = p.PpmBudBal,
            }).ToArray(),
            Periods = rows.SelectMany(p => Enumerable.Range(-historyMonths, historyMonths + 13).Select(offset =>
            {
                var month = Month.AddMonths(offset);
                var monthly = DemoDataSet.MonthlyAmount(p);
                return new ProjectProjectionPeriod
                {
                    Month = month.ToString("yyyy-MM", CultureInfo.InvariantCulture),
                    DisplayPeriod = month.ToString("MMM-yy", CultureInfo.InvariantCulture),
                    Kind = offset < 0 ? "actual" : offset == 0 ? "blended" : "projected",
                    ExpenditureCategory = p.ExpenditureCategoryName!,
                    IsPersonnel = IsPersonnel(p.ExpenditureCategoryName),
                    ActualAmount = offset < 0 ? monthly : offset == 0 ? monthly / 2m : 0m,
                    ProjectedAmount = offset > 0 ? monthly : offset == 0 ? monthly / 2m : 0m,
                    // Match the report's anchor at the last actual month, then subtract each following month's spend.
                    Remaining = p.PpmBudBal - (offset + 1) * monthly,
                };
            })).ToArray(),
        }, ct);
    }

    public Task<ProjectionSeedData> GetProjectionSeedAsync(string piEmployeeId, CancellationToken ct = default, DateTime? snapshotAtUtc = null) =>
        Result(DemoDataSet.CreateProjectionSeed(piEmployeeId,
            snapshotAtUtc is { } snapshot
                ? new DateTime(snapshot.Year, snapshot.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                : Month), ct);

    private static int IsPersonnel(string? category) => category is DemoDataSet.SalaryCategory or DemoDataSet.BenefitsCategory ? 1 : 0;
    private static bool Equal(string? left, string? right) => string.Equals(left, right?.Trim(), StringComparison.OrdinalIgnoreCase);
    private static HashSet<string> Requested(IEnumerable<string> values) => values.Select(v => v.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static Task<T> Result<T>(T value, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(value);
    }
}
