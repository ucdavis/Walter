using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace server.core.Domain;

/// <summary>
/// An editable budget scenario for one PI, seeded from a snapshot of their portfolio.
/// Projects and jobs are JSON columns, saved whole; ids inside them are unique per projection.
/// </summary>
public class Projection
{
    [Key]
    public int Id { get; set; }

    /// <summary>Owner PI; the target of the portfolio access check.</summary>
    [Required, MaxLength(8)]
    public string PiEmployeeId { get; set; } = "";

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

    /// <summary>
    /// Guided workspace choices stored in the existing Projects JSON column.
    /// This API convenience property is not a database column; one project carries the metadata.
    /// </summary>
    [NotMapped]
    public ProjectionSettings Settings
    {
        get => Projects.Select(p => p.GuidedSettings).FirstOrDefault(s => s is not null) ?? new();
        set
        {
            // Keep one copy so project reordering cannot resurrect stale workspace choices.
            foreach (var project in Projects) project.GuidedSettings = null;
            if (Projects.Count > 0) Projects[0].GuidedSettings = value;
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<Projection>();
        entity.HasIndex(p => p.PiEmployeeId);
        AsJson(entity.Property(p => p.Projects));
        AsJson(entity.Property(p => p.Jobs));
    }

    /// <summary>Compares by serialized value so in-place edits to the lists are saved.</summary>
    private static void AsJson<T>(PropertyBuilder<List<T>> property) =>
        property.HasConversion(
            v => JsonSerializer.Serialize(v, JsonOptions),
            v => JsonSerializer.Deserialize<List<T>>(v, JsonOptions)!,
            new ValueComparer<List<T>>(
                (a, b) => JsonSerializer.Serialize(a, JsonOptions) == JsonSerializer.Serialize(b, JsonOptions),
                v => JsonSerializer.Serialize(v, JsonOptions).GetHashCode(),
                v => JsonSerializer.Deserialize<List<T>>(JsonSerializer.Serialize(v, JsonOptions), JsonOptions)!));
}

/// <summary>Display and inclusion choices for the guided workspace; excluded rows remain in the saved snapshot.</summary>
public class ProjectionSettings
{
    /// <summary>First displayed month, YYYY-MM; null starts at the snapshot month.</summary>
    public string? StartMonth { get; set; }

    /// <summary>Number of months displayed from StartMonth.</summary>
    public int Months { get; set; } = 12;

    public string Note { get; set; } = "";

    /// <summary>Included project/task ids; null includes every project.</summary>
    public List<int>? SelectedProjectIds { get; set; }

    /// <summary>Jobs retained for editing but omitted from projected costs.</summary>
    public List<int> ExcludedJobIds { get; set; } = [];
}

/// <summary>A project/task in the projection; ProjectNumber is null for a hypothetical project.</summary>
public class ProjectionProject
{
    public int Id { get; set; }
    public string? ProjectNumber { get; set; }
    public string? TaskNumber { get; set; }
    public string? TaskName { get; set; }
    public string ProjectName { get; set; } = "";
    public string? ProjectType { get; set; }
    public string? AwardNumber { get; set; }
    public string? AwardName { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsSeeded { get; set; }

    /// <summary>Optional guided workspace metadata; persisted inside Projects JSON without changing the table schema.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ProjectionSettings? GuidedSettings { get; set; }

    public List<ProjectionBudget> Budgets { get; set; } = [];
    public List<ProjectionActual> Actuals { get; set; } = [];
    public List<ProjectionRunRate> RunRates { get; set; } = [];
    public List<ProjectionExpense> Expenses { get; set; } = [];
}

/// <summary>Budget for a project/task x expenditure category; the projection's starting balance.</summary>
public class ProjectionBudget
{
    public string ExpenditureCategory { get; set; } = "";
    public decimal Budget { get; set; }
    public decimal SpentToDate { get; set; }
    public decimal Committed { get; set; }
    public bool IsSeeded { get; set; }
}

/// <summary>Read-only monthly cost history captured at seed time.</summary>
public class ProjectionActual
{
    public DateOnly Month { get; set; }
    public string ExpenditureCategory { get; set; } = "";
    public decimal Amount { get; set; }
}

/// <summary>Trailing monthly average per window, kept so the window can change without new data.</summary>
public class ProjectionRunRate
{
    public string ExpenditureCategory { get; set; } = "";
    public int HistoryMonths { get; set; }
    public decimal MonthlyAmount { get; set; }
}

/// <summary>A person or hypothetical hire; EmployeeId is null for a hypothetical hire.</summary>
public class ProjectionJob
{
    public int Id { get; set; }
    public string? EmployeeId { get; set; }
    public string? PositionNumber { get; set; }
    public string Name { get; set; } = "";
    public string? JobCode { get; set; }
    public string? Title { get; set; }

    /// <summary>CBR rate set (UCPath business unit): DVCMP, DVMED, or UCANR.</summary>
    public string RateSet { get; set; } = "DVCMP";

    /// <summary>1.0-FTE monthly rate as of SeededAt; null means the job needs input.</summary>
    public decimal? MonthlySalary { get; set; }

    public decimal Fte { get; set; }
    public decimal? CbrRate { get; set; }
    public decimal VacationAccrualRate { get; set; }
    public decimal ColaRate { get; set; }

    /// <summary>Month of year (1 to 12) the COLA applies.</summary>
    public int ColaMonth { get; set; } = 7;

    public decimal? FeeRemissionMonthly { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsSeeded { get; set; }

    public List<ProjectionFundingEntry> FundingEntries { get; set; } = [];
}

/// <summary>Share of a job's cost; a null ProjectId means funded outside this PI's projects.</summary>
public class ProjectionFundingEntry
{
    public int? ProjectId { get; set; }
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
    /// <summary>Generated from run-rates; a window change or reset replaces these, including edited ones.</summary>
    Projected,
}

public class ProjectionExpense
{
    public ProjectionExpenseKind Kind { get; set; }
    public string? Description { get; set; }
    public string ExpenditureCategory { get; set; } = "";

    /// <summary>Per month for Monthly and Projected; total for OneTime.</summary>
    public decimal Amount { get; set; }

    public DateOnly? StartMonth { get; set; }
    public DateOnly? EndMonth { get; set; }
}
