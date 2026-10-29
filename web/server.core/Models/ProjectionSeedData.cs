namespace server.core.Models;

/// <summary>Result sets of dbo.usp_GetProjectionSeed, at project/task x expenditure category grain.</summary>
public sealed class ProjectionSeedData
{
    public List<ProjectionSeedProject> Projects { get; set; } = [];
    public List<ProjectionSeedBudget> Budgets { get; set; } = [];
    public List<ProjectionSeedActual> Actuals { get; set; } = [];
    public List<ProjectionSeedRunRate> RunRates { get; set; } = [];
}

public sealed class ProjectionSeedProject
{
    public string ProjectNumber { get; set; } = string.Empty;
    public string? TaskNumber { get; set; }
    public string? TaskName { get; set; }
    public string? ProjectName { get; set; }
    public string? ProjectType { get; set; }
    public string? AwardNumber { get; set; }
    public string? AwardName { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
}

public sealed class ProjectionSeedBudget
{
    public string ProjectNumber { get; set; } = string.Empty;
    public string? TaskNumber { get; set; }
    public string ExpenditureCategory { get; set; } = string.Empty;
    public decimal Budget { get; set; }
    public decimal SpentToDate { get; set; }
    public decimal Committed { get; set; }
}

public sealed class ProjectionSeedActual
{
    public string ProjectNumber { get; set; } = string.Empty;
    public string? TaskNumber { get; set; }
    public string ExpenditureCategory { get; set; } = string.Empty;
    public DateTime Month { get; set; }
    public decimal Amount { get; set; }
}

/// <summary>Trailing non-personnel monthly average over a 3, 6, or 12 month window.</summary>
public sealed class ProjectionSeedRunRate
{
    public string ProjectNumber { get; set; } = string.Empty;
    public string? TaskNumber { get; set; }
    public string ExpenditureCategory { get; set; } = string.Empty;
    public int HistoryMonths { get; set; }
    public decimal MonthlyAmount { get; set; }
}

/// <summary>A row of dbo.CompositeBenefitRates; RateSet is the UCPath business unit.</summary>
public sealed class JobCodeRecord
{
    public string RateSet { get; set; } = string.Empty;
    public string JobCode { get; set; } = string.Empty;
    public string? Title { get; set; }
    public decimal? Cbr { get; set; }
    public decimal? VacationAccrual { get; set; }
}
