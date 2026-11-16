namespace server.core.Models;

public sealed class EmployeeAccrualBalanceRecord
{
    public string EmployeeId { get; init; } = string.Empty;

    /// <summary>
    /// Usage reporting date and balance snapshot date, not the actual date leave was taken.
    /// </summary>
    public DateTime AsOfDate { get; init; }
    public string? EmployeeName { get; init; }

    /// <summary>
    /// Employee email from the accrual source data; null or blank values cannot receive employee Accrual Notifications.
    /// </summary>
    public string? EmployeeEmail { get; init; }
    public string? EmployeeClassDescription { get; init; }
    public string? PositionNumber { get; init; }
    public string? Level5Dept { get; init; }
    public string? Level5DeptDesc { get; init; }
    public decimal? HourlyRateFTE { get; init; }

    /// <summary>
    /// Signed usage for this reporting period, repeated across the employee's positions.
    /// Count each employee/date once before totaling usage across periods.
    /// </summary>
    public decimal? HoursTaken { get; init; }
    public decimal? CalculatedBal { get; init; }
    public decimal? AccrualLimit { get; init; }

    /// <summary>
    /// Accrual awarded in this reporting period, repeated across positions. The report uses
    /// the latest positive award as its monthly accrual estimate, not a calendar-month total.
    /// </summary>
    public decimal? AccrualHours { get; init; }
    public decimal? AccrualPercentage { get; init; }
    public string? TypeLabel { get; init; }
}
