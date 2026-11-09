using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace server.core.Domain;

/// <summary>
/// An editable budget scenario for one PI, seeded from a snapshot of their portfolio.
/// Funding sources and appointments are JSON columns, saved whole; their IDs are unique per plan.
/// </summary>
public class Projection
{
    [Key]
    public int Id { get; set; }

    /// <summary>Deduplicates retried creation within a PI's plans while this row exists; never changes on later saves.</summary>
    [JsonIgnore]
    public Guid CreationKey { get; set; }

    /// <summary>Owner PI; the target of the portfolio access check.</summary>
    [Required, MaxLength(8)]
    public string PiEmployeeId { get; set; } = "";

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    /// <summary>3, 6, or 12; selected averaging window for explicit estimate regeneration.</summary>
    public int HistoryMonths { get; set; }

    /// <summary>Original UTC capture, snapshot identity, and salary base. Advances only on create or reset; each funding source has its own financial capture.</summary>
    public DateTime SeededAt { get; set; }

    [MaxLength(200)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    [MaxLength(200)]
    public string? UpdatedBy { get; set; }

    /// <summary>UTC audit time and exact client concurrency token; advances on every write.</summary>
    public DateTime UpdatedAt { get; set; }

    public List<ProjectionFundingSource> FundingSources { get; set; } = [];
    public List<ProjectionAppointment> Appointments { get; set; } = [];

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    internal static void OnModelCreating(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<Projection>();
        entity.HasIndex(p => p.PiEmployeeId);
        entity.HasIndex(p => new { p.PiEmployeeId, p.CreationKey }).IsUnique();
        // SQL datetime2 preserves ticks but drops Kind. Restore UTC without shifting the saved token.
        foreach (var property in new[] { nameof(CreatedAt), nameof(SeededAt), nameof(UpdatedAt) })
            entity.Property<DateTime>(property).HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        entity.Property(p => p.UpdatedAt).IsConcurrencyToken();
        AsJson(entity.Property(p => p.FundingSources));
        AsJson(entity.Property(p => p.Appointments));
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

/// <summary>An independent task or planned funding source.</summary>
public class ProjectionFundingSource
{
    public int Id { get; set; }
    public string? ProjectNumber { get; set; }
    public string? TaskNumber { get; set; }
    public string? TaskName { get; set; }
    /// <summary>Editable label within the scenario; captured project metadata remains unchanged.</summary>
    public string Name { get; set; } = "";
    public string? ProjectName { get; set; }
    public string? ProjectType { get; set; }
    public string? AwardNumber { get; set; }
    public string? AwardName { get; set; }
    [JsonRequired]
    public ProjectionSourceKind SourceKind { get; set; }
    /// <summary>Exact UTC capture of this source's financial inputs, independent of the plan's salary base.</summary>
    [JsonRequired]
    public DateTime CapturedAt { get; set; }
    /// <summary>Scenario-only change to available balance; captured budget, spending, and commitments remain intact.</summary>
    public decimal BalanceAdjustment { get; set; }
    /// <summary>Imported date bounds, retained separately from editable scenario bounds.</summary>
    public DateOnly? CapturedStartDate { get; set; }
    public DateOnly? CapturedEndDate { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }

    public List<ProjectionBudget> Budgets { get; set; } = [];
    public List<ProjectionActual> Actuals { get; set; } = [];
    public List<ProjectionRunRate> RunRates { get; set; } = [];
    public List<ProjectionExpense> Expenses { get; set; } = [];
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProjectionSourceKind
{
    Task,
    Planned,
}

/// <summary>Budget for a project/task x expenditure category; the projection's starting balance.</summary>
public class ProjectionBudget
{
    public string ExpenditureCategory { get; set; } = "";
    public decimal Budget { get; set; }
    public decimal SpentToDate { get; set; }
    public decimal Committed { get; set; }
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

/// <summary>An appointment for a person or hypothetical hire; EmployeeId is null for a hypothetical hire.</summary>
public class ProjectionAppointment
{
    public int Id { get; set; }
    public string? EmployeeId { get; set; }
    public string? PositionNumber { get; set; }
    public string Name { get; set; } = "";
    public string? JobCode { get; set; }
    public string? Title { get; set; }

    /// <summary>CBR rate set (UCPath business unit): DVCMP, DVMED, or UCANR.</summary>
    public string RateSet { get; set; } = "DVCMP";

    /// <summary>1.0-FTE monthly rate at the snapshot, or at the start of an unseeded future hire; null is allowed only in an unsaved seed draft.</summary>
    public decimal? MonthlySalary { get; set; }

    public decimal Fte { get; set; }

    /// <summary>Composite benefit cost as a fraction of salary, captured or explicitly chosen for this plan.</summary>
    [JsonRequired]
    public decimal CbrRate { get; set; }

    /// <summary>Additional salary-based vacation cost rate; defaults to zero and does not represent leave hours.</summary>
    public decimal VacationAccrualRate { get; set; }
    public decimal ColaRate { get; set; }

    /// <summary>Month of year (1 to 12) the COLA applies.</summary>
    public int ColaMonth { get; set; } = 7;

    /// <summary>Appointment's monthly fee cost, allocated by funding share without FTE or COLA scaling; null contributes zero.</summary>
    public decimal? FeeRemissionMonthly { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    /// <summary>True for an appointment imported from personnel data, whose salary remains based at the snapshot month.</summary>
    public bool IsSeeded { get; set; }
    /// <summary>Imported funding had no exact task match and needs review; cleared when the user applies a reviewed allocation schedule.</summary>
    public bool HasUnmatchedFunding { get; set; }

    public List<ProjectionFundingAllocation> Allocations { get; set; } = [];
}

/// <summary>Share of an appointment's cost; a null FundingSourceId means funded outside this plan.</summary>
public class ProjectionFundingAllocation
{
    [JsonRequired]
    public int? FundingSourceId { get; set; }
    /// <summary>Fraction of the appointment, not full-time FTE; each share is 0 to 1, but combined shares need not total 1.</summary>
    [JsonRequired]
    public decimal Percent { get; set; }
    /// <summary>Inclusive first day; null adds no start restriction beyond the appointment and source dates.</summary>
    public DateOnly? StartDate { get; set; }
    /// <summary>Inclusive last day; null adds no end restriction beyond the appointment and source dates.</summary>
    public DateOnly? EndDate { get; set; }
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProjectionExpenseKind
{
    OneTime,
    Monthly,
    /// <summary>Generated from run-rates; explicit regeneration or reset replaces these, including edited ones.</summary>
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
