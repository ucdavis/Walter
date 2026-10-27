using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace server.core.Domain;

/// <summary>
/// An editable budget scenario for one PI, seeded from a snapshot of their portfolio.
/// Children carry their FK id but no back-navigation so the graph serializes without cycles.
/// </summary>
public class Projection
{
    [Key]
    public int Id { get; set; }

    /// <summary>Owner PI; the target of the portfolio access check.</summary>
    [Required, MaxLength(8)]
    public string PiEmployeeId { get; set; } = "";

    [Required, MaxLength(10)]
    public string PiIamId { get; set; } = "";

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    /// <summary>3, 6, or 12; the averaging window of the current Projected expenses.</summary>
    public int HistoryMonths { get; set; }

    /// <summary>When the snapshot was taken (create or last reset); the projection's "now".</summary>
    public DateTime SeededAt { get; set; }

    [MaxLength(200)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    [MaxLength(200)]
    public string? UpdatedBy { get; set; }

    public DateTime UpdatedAt { get; set; }

    public List<ProjectionProject> Projects { get; set; } = [];
    public List<ProjectionJob> Jobs { get; set; } = [];

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Projection>().HasIndex(p => p.PiEmployeeId);
        modelBuilder.Entity<ProjectionBudget>()
            .HasIndex(b => new { b.ProjectionProjectId, b.ExpenditureCategory })
            .IsUnique();
        modelBuilder.Entity<ProjectionExpense>().Property(e => e.Kind).HasConversion<string>().HasMaxLength(20);

        // SQL Server rejects SET NULL here (second cascade path from Projection), so EF nulls tracked rows instead.
        modelBuilder.Entity<ProjectionFundingEntry>()
            .HasOne(f => f.Project)
            .WithMany()
            .HasForeignKey(f => f.ProjectionProjectId)
            .OnDelete(DeleteBehavior.ClientSetNull);
    }
}

/// <summary>A project/task in the projection; ProjectNumber is null for a hypothetical project.</summary>
public class ProjectionProject
{
    [Key]
    public int Id { get; set; }

    public int ProjectionId { get; set; }

    [MaxLength(10)]
    public string? ProjectNumber { get; set; }

    [MaxLength(20)]
    public string? TaskNumber { get; set; }

    [MaxLength(300)]
    public string? TaskName { get; set; }

    [Required, MaxLength(300)]
    public string ProjectName { get; set; } = "";

    [MaxLength(100)]
    public string? ProjectType { get; set; }

    [MaxLength(20)]
    public string? AwardNumber { get; set; }

    [MaxLength(300)]
    public string? AwardName { get; set; }

    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsSeeded { get; set; }

    public List<ProjectionBudget> Budgets { get; set; } = [];
    public List<ProjectionActual> Actuals { get; set; } = [];
    public List<ProjectionRunRate> RunRates { get; set; } = [];
    public List<ProjectionExpense> Expenses { get; set; } = [];
}

/// <summary>Budget for a project/task x expenditure category; the projection's starting balance.</summary>
public class ProjectionBudget
{
    [Key]
    public int Id { get; set; }

    public int ProjectionProjectId { get; set; }

    [Required, MaxLength(200)]
    public string ExpenditureCategory { get; set; } = "";

    [Precision(18, 2)]
    public decimal Budget { get; set; }

    [Precision(18, 2)]
    public decimal SpentToDate { get; set; }

    [Precision(18, 2)]
    public decimal Committed { get; set; }

    public bool IsSeeded { get; set; }
}

/// <summary>Read-only monthly cost history captured at seed time.</summary>
public class ProjectionActual
{
    [Key]
    public int Id { get; set; }

    public int ProjectionProjectId { get; set; }

    public DateOnly Month { get; set; }

    [Required, MaxLength(200)]
    public string ExpenditureCategory { get; set; } = "";

    [Precision(18, 2)]
    public decimal Amount { get; set; }
}

/// <summary>Trailing monthly average per window, kept so the window can change without new data.</summary>
public class ProjectionRunRate
{
    [Key]
    public int Id { get; set; }

    public int ProjectionProjectId { get; set; }

    [Required, MaxLength(200)]
    public string ExpenditureCategory { get; set; } = "";

    public int HistoryMonths { get; set; }

    [Precision(18, 2)]
    public decimal MonthlyAmount { get; set; }
}

/// <summary>A person or hypothetical hire; EmployeeId is null for a hypothetical hire.</summary>
public class ProjectionJob
{
    [Key]
    public int Id { get; set; }

    public int ProjectionId { get; set; }

    [MaxLength(8)]
    public string? EmployeeId { get; set; }

    [MaxLength(8)]
    public string? PositionNumber { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [MaxLength(6)]
    public string? JobCode { get; set; }

    [MaxLength(200)]
    public string? Title { get; set; }

    /// <summary>CBR rate set (UCPath business unit): DVCMP, DVMED, or UCANR.</summary>
    [Required, MaxLength(5)]
    public string RateSet { get; set; } = "DVCMP";

    /// <summary>1.0-FTE monthly rate as of SeededAt; null means the job needs input.</summary>
    [Precision(18, 2)]
    public decimal? MonthlySalary { get; set; }

    [Precision(9, 6)]
    public decimal Fte { get; set; }

    [Precision(9, 6)]
    public decimal? CbrRate { get; set; }

    [Precision(9, 6)]
    public decimal VacationAccrualRate { get; set; }

    [Precision(9, 6)]
    public decimal ColaRate { get; set; }

    /// <summary>Month of year (1 to 12) the COLA applies.</summary>
    public int ColaMonth { get; set; } = 7;

    [Precision(18, 2)]
    public decimal? FeeRemissionMonthly { get; set; }

    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsSeeded { get; set; }

    public List<ProjectionFundingEntry> FundingEntries { get; set; } = [];
}

/// <summary>Share of a job's cost; a null project means funded outside this PI's projects.</summary>
public class ProjectionFundingEntry
{
    [Key]
    public int Id { get; set; }

    public int ProjectionJobId { get; set; }

    public int? ProjectionProjectId { get; set; }

    /// <summary>Lets an unsaved graph link funding to a project; not serialized.</summary>
    [JsonIgnore]
    public ProjectionProject? Project { get; set; }

    [Precision(9, 6)]
    public decimal Percent { get; set; }

    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsSeeded { get; set; }
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProjectionExpenseKind
{
    OneTime,
    Monthly,
    /// <summary>Generated from run-rates; editing converts it to Monthly so window changes keep the edit.</summary>
    Projected,
}

public class ProjectionExpense
{
    [Key]
    public int Id { get; set; }

    public int ProjectionProjectId { get; set; }

    public ProjectionExpenseKind Kind { get; set; }

    [MaxLength(200)]
    public string? Description { get; set; }

    [Required, MaxLength(200)]
    public string ExpenditureCategory { get; set; } = "";

    /// <summary>Per month for Monthly and Projected; total for OneTime.</summary>
    [Precision(18, 2)]
    public decimal Amount { get; set; }

    public DateOnly? StartMonth { get; set; }
    public DateOnly? EndMonth { get; set; }
}
