namespace server.Models;

public sealed class AccrualOverviewResponse
{
    public DateTime AsOfDate { get; init; }
    public int ApproachingCapCount { get; init; }
    public int AtCapCount { get; init; }
    public IReadOnlyList<AccrualDepartmentBreakdownRow> DepartmentBreakdown { get; init; } = [];
    public IReadOnlyList<AccrualStatusTrendPoint> EmployeeStatusOverTime { get; init; } = [];
    public decimal LostCostMonth { get; init; }
    public decimal LostCostYtd { get; init; }
    public IReadOnlyList<AccrualLostCostTrendPoint> MonthlyLostCost { get; init; } = [];
    public int TotalDepartments { get; init; }
    public int TotalEmployees { get; init; }
    public decimal WasteRate { get; init; }
    public int YtdMonthCount { get; init; }
}

public sealed class AccrualLostCostTrendPoint
{
    public DateTime AsOfDate { get; init; }
    public string Label { get; init; } = string.Empty;
    public decimal LostCost { get; init; }
}

public sealed class AccrualStatusTrendPoint
{
    public int Active { get; init; }
    public int Approaching { get; init; }
    public DateTime AsOfDate { get; init; }
    public int AtCap { get; init; }
    public string Label { get; init; } = string.Empty;
}

public sealed class AccrualDepartmentBreakdownRow
{
    public decimal AvgBalanceHours { get; init; }
    public int ApproachingCapCount { get; init; }
    public int AtCapCount { get; init; }
    public string Department { get; init; } = string.Empty;
    public int Headcount { get; init; }
    public decimal LostCostMonth { get; init; }
    public decimal LostCostYtd { get; init; }
}
