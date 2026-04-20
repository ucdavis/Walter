using System.Globalization;
using server.Models;

namespace server.Services;

public static class AccrualOverviewCalculator
{
    // These rates are used to estimate the cost of lost vacation accrual for employees who are at or approaching their accrual cap.
    // Using data from Nephi 2026 -- should be replaced with actual data from the system when available.
    private const decimal DefaultAcademicRate = 70m;
    private const decimal DefaultMonthlyAccrual = 16m;
    private const decimal DefaultStaffRate = 45m;
    private static readonly Dictionary<string, decimal> HourlyRates = new(StringComparer.OrdinalIgnoreCase)
    {
        ["FY Acad Admin"] = 65m,
        ["FY Acad Coord"] = 62m,
        ["FY Faculty"] = 78m,
        ["FY Researcher"] = 68m,
        ["MSP"] = 52m,
        ["PSS"] = 32.5m,
        ["SMG"] = 72m,
    };

    public static AccrualOverviewResponse Build(IReadOnlyList<EmployeeAccrualBalanceRecord> records)
    {
        var usableRecords = records
            .Where(record => !string.IsNullOrWhiteSpace(record.EmployeeId))
            .ToList();

        if (usableRecords.Count == 0)
        {
            return new AccrualOverviewResponse();
        }

        var monthlySnapshots = BuildMonthlySnapshots(usableRecords);
        if (monthlySnapshots.Count == 0)
        {
            return new AccrualOverviewResponse();
        }

        var orderedMonths = monthlySnapshots
            .OrderBy(kvp => kvp.Key)
            .Select(kvp => kvp.Value)
            .TakeLast(12)
            .ToList();

        var latestMonth = orderedMonths[^1];
        var latestEmployees = latestMonth.Employees;
        var ytdMonthCount = GetFiscalYearMonthCount(latestMonth.AsOfDate);
        var monthlyLostCost = DecimalRound(latestEmployees.Sum(employee => employee.LostCostMonth));
        var totalCharges = latestEmployees.Sum(employee => employee.NormalMonthlyAccrual * employee.HourlyRate);
        var wasteRate = totalCharges > 0m
            ? DecimalRound((monthlyLostCost / totalCharges) * 100m, 1)
            : 0m;

        var departmentBreakdown = latestEmployees
            .GroupBy(employee => employee.Department, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var employees = group.ToList();
                var lostCostMonth = DecimalRound(employees.Sum(employee => employee.LostCostMonth));

                return new AccrualDepartmentBreakdownRow
                {
                    AvgBalanceHours = DecimalRound(employees.Average(employee => employee.BalanceHours)),
                    ApproachingCapCount = employees.Count(employee => employee.Status == AccrualStatus.Approaching),
                    AtCapCount = employees.Count(employee => employee.Status == AccrualStatus.AtCap),
                    Department = group.Key,
                    Headcount = employees.Count,
                    LostCostMonth = lostCostMonth,
                    LostCostYtd = DecimalRound(lostCostMonth * ytdMonthCount),
                };
            })
            .OrderByDescending(row => row.LostCostMonth)
            .ThenBy(row => row.Department, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new AccrualOverviewResponse
        {
            AsOfDate = latestMonth.AsOfDate,
            ApproachingCapCount = latestEmployees.Count(employee => employee.Status == AccrualStatus.Approaching),
            AtCapCount = latestEmployees.Count(employee => employee.Status == AccrualStatus.AtCap),
            DepartmentBreakdown = departmentBreakdown,
            EmployeeStatusOverTime = orderedMonths
                .Select(month => new AccrualStatusTrendPoint
                {
                    Active = month.Employees.Count(employee => employee.Status == AccrualStatus.Active),
                    Approaching = month.Employees.Count(employee => employee.Status == AccrualStatus.Approaching),
                    AsOfDate = month.AsOfDate,
                    AtCap = month.Employees.Count(employee => employee.Status == AccrualStatus.AtCap),
                    Label = month.Label,
                })
                .ToList(),
            LostCostMonth = monthlyLostCost,
            LostCostYtd = DecimalRound(monthlyLostCost * ytdMonthCount),
            MonthlyLostCost = orderedMonths
                .Select(month => new AccrualLostCostTrendPoint
                {
                    AsOfDate = month.AsOfDate,
                    Label = month.Label,
                    LostCost = DecimalRound(month.Employees.Sum(employee => employee.LostCostMonth)),
                })
                .ToList(),
            TotalDepartments = departmentBreakdown.Count,
            TotalEmployees = latestEmployees.Count,
            WasteRate = wasteRate,
            YtdMonthCount = ytdMonthCount,
        };
    }

    private static Dictionary<int, MonthlySnapshot> BuildMonthlySnapshots(
        IReadOnlyList<EmployeeAccrualBalanceRecord> records)
    {
        var byEmployee = records
            .GroupBy(record => record.EmployeeId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group.OrderBy(record => record.AsOfDate).ToList(),
                StringComparer.OrdinalIgnoreCase);

        var monthlySnapshots = new Dictionary<int, MonthlySnapshot>();

        foreach (var employeeHistory in byEmployee.Values)
        {
            var historyByMonth = employeeHistory
                .GroupBy(record => GetMonthKey(record.AsOfDate))
                .OrderBy(group => group.Key);

            foreach (var monthGroup in historyByMonth)
            {
                var latestDateInMonth = monthGroup.Max(record => record.AsOfDate);
                var currentRows = monthGroup
                    .Where(record => record.AsOfDate == latestDateInMonth)
                    .ToList();

                var historyUpToMonth = employeeHistory
                    .Where(record => record.AsOfDate <= latestDateInMonth)
                    .ToList();

                var snapshot = BuildEmployeeSnapshot(currentRows, historyUpToMonth, latestDateInMonth);

                if (!monthlySnapshots.TryGetValue(monthGroup.Key, out var monthSnapshot))
                {
                    monthSnapshot = new MonthlySnapshot(
                        latestDateInMonth,
                        latestDateInMonth.ToString("MMM yy", CultureInfo.InvariantCulture));
                    monthlySnapshots[monthGroup.Key] = monthSnapshot;
                }

                if (latestDateInMonth > monthSnapshot.AsOfDate)
                {
                    monthSnapshot.AsOfDate = latestDateInMonth;
                }

                monthSnapshot.Employees.Add(snapshot);
            }
        }

        return monthlySnapshots;
    }

    private static EmployeeSnapshot BuildEmployeeSnapshot(
        IReadOnlyList<EmployeeAccrualBalanceRecord> currentRows,
        IReadOnlyList<EmployeeAccrualBalanceRecord> historyRows,
        DateTime asOfDate)
    {
        var department = MostCommonValue(currentRows.Select(row => row.Level5DeptDesc), "Unknown Department");
        var classDescription = MostCommonValue(currentRows.Select(row => row.EmployeeClassDescription), "Unknown");
        var balance = currentRows.Max(row => row.CalculatedBal ?? 0m);
        var accrualLimit = currentRows.Max(row => row.AccrualLimit ?? 0m);
        var percentage = currentRows.Max(row => row.AccrualPercentage ?? 0m);

        if (percentage <= 0m && accrualLimit > 0m)
        {
            percentage = (balance / accrualLimit) * 100m;
        }

        var normalMonthlyAccrual = historyRows
            .Where(row => (row.AccrualHours ?? 0m) > 0m)
            .OrderBy(row => row.AsOfDate)
            .Select(row => row.AccrualHours ?? 0m)
            .LastOrDefault();

        if (normalMonthlyAccrual <= 0m)
        {
            normalMonthlyAccrual = accrualLimit > 0m
                ? accrualLimit / 24m
                : DefaultMonthlyAccrual;
        }

        var hourlyRate = GetHourlyRate(classDescription);
        var status = GetStatus(percentage);

        return new EmployeeSnapshot(
            asOfDate,
            balance,
            department,
            hourlyRate,
            status == AccrualStatus.AtCap
                ? DecimalRound(normalMonthlyAccrual * hourlyRate)
                : 0m,
            normalMonthlyAccrual,
            status);
    }

    private static decimal DecimalRound(decimal value, int decimals = 2)
    {
        return Math.Round(value, decimals, MidpointRounding.AwayFromZero);
    }

    private static int GetFiscalYearMonthCount(DateTime asOfDate)
    {
        return asOfDate.Month >= 7
            ? asOfDate.Month - 6
            : asOfDate.Month + 6;
    }

    private static int GetMonthKey(DateTime date)
    {
        return (date.Year * 100) + date.Month;
    }

    private static decimal GetHourlyRate(string employeeClassDescription)
    {
        var normalizedClassification = NormalizeClassification(employeeClassDescription);
        if (HourlyRates.TryGetValue(normalizedClassification, out var rate))
        {
            return rate;
        }

        return employeeClassDescription.Contains("Academic", StringComparison.OrdinalIgnoreCase)
            ? DefaultAcademicRate
            : DefaultStaffRate;
    }

    private static AccrualStatus GetStatus(decimal percentage)
    {
        return percentage switch
        {
            >= 100m => AccrualStatus.AtCap,
            >= 80m => AccrualStatus.Approaching,
            _ => AccrualStatus.Active,
        };
    }

    private static string MostCommonValue(IEnumerable<string?> values, string fallback)
    {
        return values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .GroupBy(value => value!.Trim(), StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.Key)
            .FirstOrDefault() ?? fallback;
    }

    private static string NormalizeClassification(string employeeClassDescription)
    {
        var lower = employeeClassDescription.ToLowerInvariant();

        if (lower.Contains("dean") || lower.Contains("admin"))
        {
            return "FY Acad Admin";
        }

        if (lower.Contains("coord"))
        {
            return "FY Acad Coord";
        }

        if (lower.Contains("faculty") || lower.Contains("emeriti") || lower.Contains("recall"))
        {
            return "FY Faculty";
        }

        if (lower.Contains("post doc") ||
            lower.Contains("non faculty") ||
            lower.Contains("student") ||
            lower.Contains("research"))
        {
            return "FY Researcher";
        }

        if (lower.Contains("management") && lower.Contains("senior"))
        {
            return "MSP";
        }

        if (lower.Contains("staff"))
        {
            return "PSS";
        }

        return employeeClassDescription;
    }

    private enum AccrualStatus
    {
        Active,
        Approaching,
        AtCap,
    }

    private sealed record EmployeeSnapshot(
        DateTime AsOfDate,
        decimal BalanceHours,
        string Department,
        decimal HourlyRate,
        decimal LostCostMonth,
        decimal NormalMonthlyAccrual,
        AccrualStatus Status);

    private sealed class MonthlySnapshot
    {
        public MonthlySnapshot(DateTime asOfDate, string label)
        {
            AsOfDate = asOfDate;
            Label = label;
        }

        public DateTime AsOfDate { get; set; }
        public List<EmployeeSnapshot> Employees { get; } = [];
        public string Label { get; }
    }
}
