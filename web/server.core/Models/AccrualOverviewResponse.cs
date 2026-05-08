namespace server.core.Models;

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
    public string DepartmentCode { get; init; } = string.Empty;
    public string Department { get; init; } = string.Empty;
    public int Headcount { get; init; }
    public decimal LostCostMonth { get; init; }
    public decimal LostCostYtd { get; init; }
}

public sealed class AccrualDepartmentDetailResponse
{
    public DateTime AsOfDate { get; init; }
    public decimal AvgBalanceHours { get; init; }
    public int ApproachingCapCount { get; init; }
    public int AtCapCount { get; init; }
    public string DepartmentCode { get; init; } = string.Empty;
    public string DepartmentName { get; init; } = string.Empty;
    public IReadOnlyList<AccrualDepartmentOption> Departments { get; init; } = [];
    public IReadOnlyList<AccrualDepartmentEmployeeRow> Employees { get; init; } = [];
    public int Headcount { get; init; }
    public decimal LostCostMonth { get; init; }
    public decimal LostCostYtd { get; init; }
    public int YtdMonthCount { get; init; }
}

public sealed class AccrualDepartmentOption
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
}

public sealed class AccrualDepartmentEmployeeRow
{
    public decimal AccrualHoursPerMonth { get; init; }
    public decimal BalanceHours { get; init; }
    public decimal CapHours { get; init; }
    public string Classification { get; init; } = string.Empty;
    public string EmployeeId { get; init; } = string.Empty;
    public string EmployeeName { get; init; } = string.Empty;
    public DateTime? LastVacationDate { get; init; }
    public decimal LostCostMonth { get; init; }
    public int? MonthsToCap { get; init; }
    public decimal PctOfCap { get; init; }
}
