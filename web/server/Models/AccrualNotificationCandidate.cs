namespace server.Models;

public enum AccrualNotificationStatus
{
    ApproachingCap,
    AtCap,
}

public enum AccrualEmployeeGroup
{
    FacultyAcademic,
    Staff,
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
