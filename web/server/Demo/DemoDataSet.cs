using System.Globalization;
using server.core.Models;
using server.Helpers;

namespace Server.Demo;

/// <summary>Invented people, projects, and reports for demos, created in memory.</summary>
public static class DemoDataSet
{
    public const string PiIamId = "DEMO000001";
    public const string PiEmployeeId = "DEMO0001";
    public const string PmIamId = "DEMO000002";
    public const string PmEmployeeId = "DEMO0002";
    private const string SecondPiEmployeeId = "DEMO0003";
    internal const string SalaryCategory = "01 - Salaries and Wages";
    internal const string BenefitsCategory = "02 - Fringe Benefits";
    private const string SuppliesCategory = "03 - Supplies / Services / Other Expenses";

    internal static SearchablePersonRecord[] CreatePeople() =>
    [
        new() { IamId = PiIamId, EmployeeId = PiEmployeeId, Name = "Professor Ada Example", Email = "ada.example@example.invalid" },
        new() { IamId = PmIamId, EmployeeId = PmEmployeeId, Name = "Pat Demo", Email = "pat.demo@example.invalid" },
        new() { IamId = "DEMO000003", EmployeeId = SecondPiEmployeeId, Name = "Professor Robin Fiction", Email = "robin.fiction@example.invalid" },
        new() { IamId = "DEMO000101", EmployeeId = "DEMO0101", Name = "Taylor Sample", Email = "taylor.sample@example.invalid" },
        new() { IamId = "DEMO000102", EmployeeId = "DEMO0102", Name = "Casey Placeholder", Email = "casey.placeholder@example.invalid" },
        new() { IamId = "DEMO000103", EmployeeId = "DEMO0103", Name = "Morgan Makebelieve", Email = "morgan.makebelieve@example.invalid" },
    ];

    private static (string Number, string Name, string Pi, bool Internal, int EndMonth, decimal BudgetMonths, decimal Salary, decimal Supplies)[] Projects() =>
    [
        ("DEMO-1001", "Sky Garden Demonstration Research", PiEmployeeId, false, 18, 48m, 2500m, 500m),
        ("DEMO-1002", "Rainbow Soil Demonstration Study", PiEmployeeId, false, 2, 16m, 2500m, 1500m),
        ("DEMO-1003", "Moon Orchard Demonstration Research", SecondPiEmployeeId, false, 12, 30m, 6000m, 800m),
        ("DEMO-1004", "Imaginary Laboratory Start-up", PiEmployeeId, true, 24, 24m, 2000m, 400m),
    ];

    internal static PpmProjectMembership[] CreateMemberships()
    {
        var people = CreatePeople().ToDictionary(p => p.EmployeeId);
        return Projects().Select(p => new PpmProjectMembership(p.Number, p.Name,
        [
            new PpmTeamMember(p.Pi, people[p.Pi].Name, PpmRole.PrincipalInvestigator),
            new PpmTeamMember(PmEmployeeId, people[PmEmployeeId].Name, PpmRole.ProjectManager),
        ])).ToArray();
    }

    internal static FacultyPortfolioRecord[] CreatePortfolio(DateTime month)
    {
        var people = CreatePeople().ToDictionary(p => p.EmployeeId);
        return Projects().SelectMany(project => new[]
        {
            (Category: SalaryCategory, Monthly: project.Salary),
            (Category: BenefitsCategory, Monthly: project.Salary * 0.3m),
            (Category: SuppliesCategory, Monthly: project.Supplies),
        }.Select(category => new FacultyPortfolioRecord
        {
            ProjectNumber = project.Number, ProjectName = project.Name,
            ProjectType = project.Internal ? "Internal" : "Sponsored",
            ProjectStatus = "ACTIVE", ProjectOwningOrgCode = "DEMO-DEPT",
            ProjectOwningOrg = "Department of Imaginary Research",
            ProjectStartDate = month.AddMonths(-12), ProjectEndDate = month.AddMonths(project.EndMonth),
            AwardNumber = project.Internal ? null : $"DEMO-AWARD-{project.Number[^4..]}",
            AwardName = project.Internal ? null : $"Fictional {project.Name} Award",
            AwardStartDate = project.Internal ? null : month.AddMonths(-12),
            AwardEndDate = project.Internal ? null : month.AddMonths(project.EndMonth),
            AwardType = project.Internal ? null : "Grant", AwardStatus = project.Internal ? null : "ACTIVE",
            AwardPi = project.Internal ? null : people[project.Pi].Name,
            TaskNum = "1", TaskName = "Demonstration Research", TaskStatus = "ACTIVE",
            Pi = people[project.Pi].Name, Pm = people[PmEmployeeId].Name, PmEmployeeId = PmEmployeeId,
            OwnerName = people[project.Pi].Name, Pa = "Alex Example Administrator",
            GrantAdministrator = "Alex Example Administrator", ContractAdministrator = "Alex Example Administrator",
            PrimarySponsorName = project.Internal ? null : "Imaginary Research Foundation",
            SponsorAwardNumber = project.Internal ? null : $"FICTION-{project.Number[^4..]}",
            ExpenditureCategoryName = category.Category,
            FundCode = "DEMO-FUND", FundDesc = "Fictional Research Fund", ProjectFund = "DEMO-FUND",
            PurposeCode = "DEMO-PURPOSE", PurposeDesc = "Demonstration Research",
            ProgramCode = "DEMO-PROGRAM", ProgramDesc = "Imaginary Research Program",
            ActivityCode = "DEMO-ACTIVITY", ActivityDesc = "Presentation Examples",
            PpmBudget = category.Monthly * project.BudgetMonths,
            PpmExpenses = category.Monthly * 12.5m,
            PpmCommitments = category.Monthly * 3m,
            PpmBudBal = category.Monthly * (project.BudgetMonths - 15.5m),
            GlBeginningBalance = 0m, GlRevenue = -category.Monthly * project.BudgetMonths,
            GlExpenses = category.Monthly * 12.5m,
            BillingCycle = "Monthly", CostShareRequiredBySponsor = "No",
            PostReportingPeriod = month.ToString("MMM-yy", CultureInfo.InvariantCulture),
        })).ToArray();
    }

    internal static PositionBudgetRecord[] CreatePersonnel(DateTime month)
    {
        var people = CreatePeople().ToDictionary(p => p.EmployeeId);
        return Projects().Select(project =>
        {
            var employeeId = project.Number switch
            {
                "DEMO-1003" => "DEMO0102",
                "DEMO-1004" => "DEMO0103",
                _ => "DEMO0101",
            };
            var rate = employeeId == "DEMO0102" ? 7500m : employeeId == "DEMO0103" ? 4000m : 5000m;
            var fte = employeeId == "DEMO0102" ? 0.8m : employeeId == "DEMO0103" ? 0.5m : 1m;
            return new PositionBudgetRecord
            {
                EmployeeId = employeeId, Name = people[employeeId].Name, PositionNumber = $"POS-{employeeId}",
                ProjectId = project.Number, ProjectDescription = project.Name, Task = "1",
                ProjectType = project.Internal ? "Internal" : "Sponsored", PositionDescription = "Fictional Research Specialist",
                JobCode = "DEMO-JOB", MonthlyRate = rate, Fte = fte,
                DistributionPercent = 100m * project.Salary / (rate * fte), CompositeBenefitRate = 0.3m,
                BusinessUnit = "DEMO", VacationAccrual = 0.08m,
                JobEffectiveDate = month.AddMonths(-12), JobEndDate = month.AddMonths(24),
                FundingEffectiveDate = month.AddMonths(-12), FundingEndDate = month.AddMonths(project.EndMonth),
                EarnCode = "REG", EarnCodeShare = 1m, EarnCodeStatus = "BaseOnly",
            };
        }).ToArray();
    }

    internal static ProjectCostRecord[] CreateCosts(DateTime month)
    {
        return CreatePortfolio(month).SelectMany((row, rowIndex) => Enumerable.Range(0, 13).Select(index =>
        {
            var date = month.AddMonths(index - 12);
            var amount = MonthlyAmount(row) * (index == 12 ? 0.5m : 1m);
            var number = 900000L + rowIndex * 100 + index;
            return new ProjectCostRecord
            {
                TransactionNumber = number, SourceTransactionNumber = number,
                AwardNumber = row.AwardNumber, AwardName = row.AwardName, AwardType = row.AwardType,
                AwardStatus = row.AwardStatus, AwardStartDate = row.AwardStartDate, AwardEndDate = row.AwardEndDate,
                ProjectNumber = row.ProjectNumber, ProjectName = row.ProjectName!, ProjectType = row.ProjectType!,
                ProjectStatus = "ACTIVE", ProjectBusinessUnit = "DEMO", ProjectOwningOrgCode = row.ProjectOwningOrgCode!,
                ProjectOwningOrgName = row.ProjectOwningOrg!, ProjectStartDate = row.ProjectStartDate!.Value,
                ProjectEndDate = row.ProjectEndDate, TaskNumber = row.TaskNum!, TaskName = row.TaskName!, TaskStatus = "ACTIVE",
                TaskFundCode = row.ProjectType == "Internal" ? row.FundCode : null,
                TaskFundName = row.ProjectType == "Internal" ? row.FundDesc : null,
                TaskPurposeCode = row.ProjectType == "Internal" ? row.PurposeCode : null,
                TaskPurposeName = row.ProjectType == "Internal" ? row.PurposeDesc : null,
                TaskProgramCode = row.ProjectType == "Internal" ? row.ProgramCode : null,
                TaskProgramName = row.ProjectType == "Internal" ? row.ProgramDesc : null,
                TaskActivityCode = row.ProjectType == "Internal" ? row.ActivityCode : null,
                TaskActivityName = row.ProjectType == "Internal" ? row.ActivityDesc : null,
                ExpenditureBusinessUnit = "DEMO", ExpenditureOrgCode = "DEMO-DEPT",
                ExpenditureOrgName = "Department of Imaginary Research", ExpenditureCategory = row.ExpenditureCategoryName!,
                ExpenditureType = $"DEMO - {row.ExpenditureCategoryName![5..]}", ExpenditureBatch = $"DEMO-BATCH-{date:yyyyMM}",
                ExpenditureItemDate = date, AccountingDate = date, AccountingPeriod = date.ToString("MMM-yy", CultureInfo.InvariantCulture),
                Document = $"DEMO-DOC-{number}", DocumentEntry = "Fictional expenditure",
                Comment = "Entirely invented presentation data", Billable = row.ProjectType == "Internal" ? "N" : "Y",
                InvoicedStatus = "Not invoiced", RevenueStatus = "Not recognized", RawCost = amount, BurdenedCost = amount,
            };
        })).ToArray();
    }

    /// <summary>Same shape as dbo.usp_GetProjectionSeed, for the projects where the employee is PI.</summary>
    internal static ProjectionSeedData CreateProjectionSeed(string piEmployeeId, DateTime month)
    {
        var numbers = Projects().Where(p => string.Equals(p.Pi, piEmployeeId.Trim(), StringComparison.OrdinalIgnoreCase))
            .Select(p => p.Number).ToHashSet();
        var rows = CreatePortfolio(month).Where(r => numbers.Contains(r.ProjectNumber)).ToArray();
        return new ProjectionSeedData
        {
            Projects = rows.GroupBy(r => r.ProjectNumber).Select(g => g.First()).Select(r => new ProjectionSeedProject
            {
                ProjectNumber = r.ProjectNumber, TaskNumber = r.TaskNum, TaskName = r.TaskName,
                ProjectName = r.ProjectName, ProjectType = r.ProjectType,
                AwardNumber = r.AwardNumber, AwardName = r.AwardName,
                StartDate = r.ProjectStartDate, EndDate = r.ProjectEndDate,
            }).ToList(),
            Budgets = rows.Select(r => new ProjectionSeedBudget
            {
                ProjectNumber = r.ProjectNumber, TaskNumber = r.TaskNum, ExpenditureCategory = r.ExpenditureCategoryName!,
                Budget = r.PpmBudget, SpentToDate = r.PpmExpenses, Committed = r.PpmCommitments,
            }).ToList(),
            Actuals = CreateCosts(month).Where(c => numbers.Contains(c.ProjectNumber)).Select(c => new ProjectionSeedActual
            {
                ProjectNumber = c.ProjectNumber, TaskNumber = c.TaskNumber, ExpenditureCategory = c.ExpenditureCategory,
                Month = c.AccountingDate, Amount = c.BurdenedCost,
            }).ToList(),
            // Personnel is projected from jobs, so only the other categories carry a run rate.
            RunRates = rows.Where(r => r.ExpenditureCategoryName is not (SalaryCategory or BenefitsCategory))
                .SelectMany(r => new[] { 3, 6, 12 }.Select(window => new ProjectionSeedRunRate
                {
                    ProjectNumber = r.ProjectNumber, TaskNumber = r.TaskNum, ExpenditureCategory = r.ExpenditureCategoryName!,
                    HistoryMonths = window, MonthlyAmount = MonthlyAmount(r),
                })).ToList(),
        };
    }

    internal static decimal MonthlyAmount(FacultyPortfolioRecord row) => row.PpmExpenses / 12.5m;
}
