namespace server.Models;

public sealed class EmployeeAccrualBalanceRecord
{
    public string EmployeeId { get; init; } = string.Empty;
    public DateTime AsOfDate { get; init; }
    public string? EmployeeName { get; init; }
    public string? EmployeeClassDescription { get; init; }
    public string? PositionNumber { get; init; }
    public string? Level5Dept { get; init; }
    public string? Level5DeptDesc { get; init; }
    public decimal? HoursTaken { get; init; }
    public decimal? CalculatedBal { get; init; }
    public decimal? AccrualLimit { get; init; }
    public decimal? AccrualHours { get; init; }
    public decimal? AccrualPercentage { get; init; }
    public string? TypeLabel { get; init; }
}
