namespace server.core.Models;

/// <summary>
/// Employee accrual risk status used to choose the Accrual Notification content.
/// </summary>
public enum AccrualNotificationStatus
{
    /// <summary>
    /// Employee balance is at least 80% and below 96% of the accrual cap.
    /// </summary>
    ApproachingCap,

    /// <summary>
    /// Employee balance is at least 96% of the accrual cap according to the report threshold.
    /// </summary>
    AtCap,
}

/// <summary>
/// Employee classification bucket used to choose the Accrual Notification template variant.
/// </summary>
public enum AccrualEmployeeGroup
{
    /// <summary>
    /// Fiscal-year academic appointee classifications, including academic administrators, coordinators, faculty, and researchers.
    /// </summary>
    FacultyAcademic,

    /// <summary>
    /// Staff classifications, including MSP, PSS, and SMG, that receive the staff Accrual Notification variant.
    /// </summary>
    Staff,

    /// <summary>
    /// Fallback for unmapped classifications that should still receive the generic Accrual Notification variant.
    /// </summary>
    Generic,
}

public sealed class AccrualNotificationCandidate
{
    public DateTime SnapshotAsOfDate { get; init; }
    public DateTime EmployeeAsOfDate { get; init; }
    public string EmployeeId { get; init; } = string.Empty;
    public string EmployeeName { get; init; } = string.Empty;
    public string? EmployeeEmail { get; init; }
    public string DepartmentCode { get; init; } = string.Empty;
    public string Department { get; init; } = string.Empty;
    public string Classification { get; init; } = string.Empty;
    public AccrualEmployeeGroup EmployeeGroup { get; init; }
    public AccrualNotificationStatus Status { get; init; }
    public decimal BalanceHours { get; init; }
    public decimal CapHours { get; init; }
    public decimal PctOfCap { get; init; }
    public decimal AccrualHoursPerMonth { get; init; }
    public int? MonthsToCap { get; init; }
    public DateTime? LastVacationDate { get; init; }
}
