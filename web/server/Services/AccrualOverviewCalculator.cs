using System.Globalization;
using server.Models;

namespace server.Services;

public static class AccrualOverviewCalculator
{
    private const decimal ApproachingThresholdPct = 80m;
    private const decimal AtCapThresholdPct = 96m;
    private const decimal FacultyLikeBenefitsRate = 0.41m;
    private const decimal DefaultBenefitsRate = 0.51m;

    // These rates are used to estimate the cost of lost vacation accrual for employees who are at or approaching their accrual cap.
    // Using data from Nephi 2026 -- should be replaced with actual data from the system when available.
    private const decimal DefaultAcademicRate = 70m;
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

    // Builds the top-level overview response from the available accrual history.
    public static AccrualOverviewResponse Build(IReadOnlyList<EmployeeAccrualBalanceRecord> records)
    {
        var context = PrepareContext(records);
        if (context is null)
        {
            return new AccrualOverviewResponse();
        }

        var latestMonth = context.LatestMonth;
        var latestEmployees = latestMonth.Employees;
        var orderedMonths = context.OrderedMonths;
        var fiscalYearMonths = GetFiscalYearMonths(orderedMonths, latestMonth.AsOfDate);
        var ytdMonthCount = context.YtdMonthCount;
        var monthlyLostCost = DecimalRound(latestEmployees.Sum(employee => employee.LostCostMonth));
        var lostCostYtd = DecimalRound(
            fiscalYearMonths.Sum(month => month.Employees.Sum(employee => employee.LostCostMonth)));
        var totalCharges = latestEmployees.Sum(employee => employee.NormalMonthlyAccrual * employee.HourlyRate);
        var wasteRate = totalCharges > 0m
            ? DecimalRound((monthlyLostCost / totalCharges) * 100m, 1)
            : 0m;
        var departmentBreakdown = BuildDepartmentBreakdown(latestEmployees, fiscalYearMonths);

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
            LostCostYtd = lostCostYtd,
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

    // Builds the department drilldown using the same merged latest snapshot as the overview.
    public static AccrualDepartmentDetailResponse? BuildDepartmentDetail(
        IReadOnlyList<EmployeeAccrualBalanceRecord> records,
        string departmentCode)
    {
        if (string.IsNullOrWhiteSpace(departmentCode))
        {
            return null;
        }

        var context = PrepareContext(records);
        if (context is null)
        {
            return null;
        }

        var latestEmployees = context.LatestMonth.Employees;
        var fiscalYearMonths = GetFiscalYearMonths(context.OrderedMonths, context.LatestMonth.AsOfDate);
        var departmentEmployees = latestEmployees
            .Where(employee => string.Equals(
                employee.DepartmentCode,
                departmentCode,
                StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(employee => employee.PctOfCap)
            .ThenByDescending(employee => employee.LostCostMonth)
            .ThenBy(employee => employee.EmployeeName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (departmentEmployees.Count == 0)
        {
            return null;
        }

        var lostCostMonth = DecimalRound(departmentEmployees.Sum(employee => employee.LostCostMonth));
        var lostCostYtd = DecimalRound(SumDepartmentLostCost(fiscalYearMonths, departmentCode));

        return new AccrualDepartmentDetailResponse
        {
            AsOfDate = context.LatestMonth.AsOfDate,
            AvgBalanceHours = DecimalRound(departmentEmployees.Average(employee => employee.BalanceHours)),
            ApproachingCapCount = departmentEmployees.Count(employee => employee.Status == AccrualStatus.Approaching),
            AtCapCount = departmentEmployees.Count(employee => employee.Status == AccrualStatus.AtCap),
            DepartmentCode = departmentEmployees[0].DepartmentCode,
            DepartmentName = MostCommonValue(
                departmentEmployees.Select(employee => employee.Department),
                "Unknown Department"),
            Departments = BuildDepartmentOptions(latestEmployees),
            Employees = BuildDepartmentEmployeeRows(departmentEmployees),
            Headcount = departmentEmployees.Count,
            LostCostMonth = lostCostMonth,
            LostCostYtd = lostCostYtd,
            YtdMonthCount = context.YtdMonthCount,
        };
    }

    // Normalizes raw records into monthly snapshots and selects the latest view we should display.
    private static CalculationContext? PrepareContext(IReadOnlyList<EmployeeAccrualBalanceRecord> records)
    {
        var usableRecords = records
            .Where(record => !string.IsNullOrWhiteSpace(record.EmployeeId))
            .ToList();

        if (usableRecords.Count == 0)
        {
            return null;
        }

        var monthlySnapshots = BuildMonthlySnapshots(usableRecords);
        if (monthlySnapshots.Count == 0)
        {
            return null;
        }

        var orderedMonths = monthlySnapshots
            .OrderBy(kvp => kvp.Key)
            .Select(kvp => kvp.Value)
            .TakeLast(12)
            .ToList();

        if (orderedMonths.Count == 0)
        {
            return null;
        }

        if (orderedMonths.Count > 1 && IsPartialMonthSnapshot(orderedMonths[^1].AsOfDate))
        {
            // Mid-month extracts can omit monthly-paid employees, so carry forward anyone who
            // existed last month but has not received a current-month row yet.
            orderedMonths[^1] = BuildCarryForwardMonth(
                currentMonth: orderedMonths[^1],
                previousMonth: orderedMonths[^2]);
        }

        var latestMonth = orderedMonths[^1];
        return new CalculationContext(
            latestMonth,
            orderedMonths,
            GetFiscalYearMonthCount(latestMonth.AsOfDate));
    }

    // Creates one employee snapshot per month using that employee's latest row within the month.
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

    // Collapses one employee's current-month rows plus prior history into the values shown in the UI.
    private static EmployeeSnapshot BuildEmployeeSnapshot(
        IReadOnlyList<EmployeeAccrualBalanceRecord> currentRows,
        IReadOnlyList<EmployeeAccrualBalanceRecord> historyRows,
        DateTime asOfDate)
    {
        var employeeId = currentRows
            .Select(row => row.EmployeeId)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;
        var employeeName = MostCommonValue(currentRows.Select(row => row.EmployeeName), employeeId);
        var departmentCode = MostCommonValue(currentRows.Select(row => row.Level5Dept), "UNKNOWN");
        var department = MostCommonValue(currentRows.Select(row => row.Level5DeptDesc), "Unknown Department");
        var classification = NormalizeClassification(MostCommonValue(
            currentRows.Select(row => row.EmployeeClassDescription),
            "Unknown"));
        var balance = currentRows.Max(row => row.CalculatedBal ?? 0m);
        var accrualLimit = currentRows.Max(row => row.AccrualLimit ?? 0m);
        var percentage = currentRows.Max(row => row.AccrualPercentage ?? 0m);

        if (percentage <= 0m && accrualLimit > 0m)
        {
            percentage = (balance / accrualLimit) * 100m;
        }

        percentage = DecimalRound(percentage, 1);

        var monthlyHistory = historyRows
            .GroupBy(row => GetMonthKey(row.AsOfDate))
            .OrderBy(group => group.Key)
            .Select(group =>
            {
                var latestDateInMonth = group.Max(row => row.AsOfDate);
                var latestRows = group
                    .Where(row => row.AsOfDate == latestDateInMonth)
                    .ToList();

                return new EmployeeMonthlyHistoryPoint(
                    latestDateInMonth,
                    latestRows.Max(row => row.AccrualHours ?? 0m),
                    latestRows.Max(row => row.HoursTaken ?? 0m));
            })
            .ToList();

        var normalMonthlyAccrual = historyRows
            .Where(row => (row.AccrualHours ?? 0m) > 0m)
            .OrderBy(row => row.AsOfDate)
            .Select(row => row.AccrualHours ?? 0m)
            .LastOrDefault();

        if (normalMonthlyAccrual <= 0m)
        {
            normalMonthlyAccrual = GetNormalMonthlyAccrual(accrualLimit);
        }

        var recentHistory = monthlyHistory.TakeLast(6).ToList();
        var avgMonthlyUsage = recentHistory.Count > 0
            ? DecimalRound(recentHistory.Average(point => point.HoursTaken))
            : 0m;
        var hourlyRate = GetHourlyRate(classification);
        var status = GetStatus(percentage);
        var monthsToCap = GetMonthsToCap(balance, accrualLimit, normalMonthlyAccrual, avgMonthlyUsage);
        var lastVacationDate = monthlyHistory
            .LastOrDefault(point => point.HoursTaken > 0m)
            ?.AsOfDate;

        return new EmployeeSnapshot(
            asOfDate,
            DecimalRound(balance),
            classification,
            department,
            departmentCode,
            employeeId,
            employeeName,
            hourlyRate,
            lastVacationDate,
            status == AccrualStatus.AtCap
                ? DecimalRound(normalMonthlyAccrual * GetLoadedHourlyRate(classification, hourlyRate))
                : 0m,
            monthsToCap,
            DecimalRound(normalMonthlyAccrual),
            percentage,
            DecimalRound(accrualLimit),
            status);
    }

    // Aggregates the latest snapshot into per-department summary rows.
    private static IReadOnlyList<AccrualDepartmentBreakdownRow> BuildDepartmentBreakdown(
        IReadOnlyList<EmployeeSnapshot> latestEmployees,
        IReadOnlyList<MonthlySnapshot> fiscalYearMonths)
    {
        return latestEmployees
            .GroupBy(employee => employee.DepartmentCode, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var employees = group.ToList();
                var lostCostMonth = DecimalRound(employees.Sum(employee => employee.LostCostMonth));

                return new AccrualDepartmentBreakdownRow
                {
                    AvgBalanceHours = DecimalRound(employees.Average(employee => employee.BalanceHours)),
                    ApproachingCapCount = employees.Count(employee => employee.Status == AccrualStatus.Approaching),
                    AtCapCount = employees.Count(employee => employee.Status == AccrualStatus.AtCap),
                    Department = MostCommonValue(
                        employees.Select(employee => employee.Department),
                        "Unknown Department"),
                    DepartmentCode = group.Key,
                    Headcount = employees.Count,
                    LostCostMonth = lostCostMonth,
                    LostCostYtd = DecimalRound(SumDepartmentLostCost(fiscalYearMonths, group.Key)),
                };
            })
            .OrderByDescending(row => row.LostCostMonth)
            .ThenBy(row => row.Department, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    // Produces the department selector options from the latest snapshot.
    private static IReadOnlyList<AccrualDepartmentOption> BuildDepartmentOptions(
        IReadOnlyList<EmployeeSnapshot> latestEmployees)
    {
        return latestEmployees
            .GroupBy(employee => employee.DepartmentCode, StringComparer.OrdinalIgnoreCase)
            .Select(group => new AccrualDepartmentOption
            {
                Code = group.Key,
                Name = MostCommonValue(
                    group.Select(employee => employee.Department),
                    "Unknown Department"),
            })
            .OrderBy(option => option.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    // Maps internal employee snapshots to the department detail table rows.
    private static IReadOnlyList<AccrualDepartmentEmployeeRow> BuildDepartmentEmployeeRows(
        IReadOnlyList<EmployeeSnapshot> employees)
    {
        return employees
            .Select(employee => new AccrualDepartmentEmployeeRow
            {
                AccrualHoursPerMonth = employee.NormalMonthlyAccrual,
                BalanceHours = employee.BalanceHours,
                CapHours = employee.CapHours,
                Classification = employee.Classification,
                EmployeeId = employee.EmployeeId,
                EmployeeName = employee.EmployeeName,
                LastVacationDate = employee.LastVacationDate,
                LostCostMonth = employee.LostCostMonth,
                MonthsToCap = employee.MonthsToCap,
                PctOfCap = employee.PctOfCap,
            })
            .ToList();
    }

    // Applies the rounding convention used throughout the accrual UI.
    private static decimal DecimalRound(decimal value, int decimals = 2)
    {
        return Math.Round(value, decimals, MidpointRounding.AwayFromZero);
    }

    // Merges the newest month with the immediately prior month to fill gaps in partial extracts.
    private static MonthlySnapshot BuildCarryForwardMonth(
        MonthlySnapshot currentMonth,
        MonthlySnapshot previousMonth)
    {
        var mergedMonth = new MonthlySnapshot(currentMonth.AsOfDate, currentMonth.Label);
        mergedMonth.Employees.AddRange(currentMonth.Employees);

        var currentEmployeeIds = currentMonth.Employees
            .Select(employee => employee.EmployeeId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var employee in previousMonth.Employees)
        {
            if (!currentEmployeeIds.Contains(employee.EmployeeId))
            {
                mergedMonth.Employees.Add(employee);
            }
        }

        return mergedMonth;
    }

    // Detects whether the snapshot was taken before the month has fully closed.
    private static bool IsPartialMonthSnapshot(DateTime asOfDate)
    {
        return asOfDate.Day < DateTime.DaysInMonth(asOfDate.Year, asOfDate.Month);
    }

    // Limits YTD calculations to months in the current fiscal year.
    private static IReadOnlyList<MonthlySnapshot> GetFiscalYearMonths(
        IReadOnlyList<MonthlySnapshot> orderedMonths,
        DateTime latestAsOfDate)
    {
        var fiscalYear = GetFiscalYear(latestAsOfDate);
        return orderedMonths
            .Where(month => GetFiscalYear(month.AsOfDate) == fiscalYear)
            .ToList();
    }

    // Converts a date into the 1-12 fiscal month count used by the UI summary cards.
    private static int GetFiscalYearMonthCount(DateTime asOfDate)
    {
        return asOfDate.Month >= 7
            ? asOfDate.Month - 6
            : asOfDate.Month + 6;
    }

    // Maps a calendar date to its UC fiscal year.
    private static int GetFiscalYear(DateTime date)
    {
        return date.Month >= 7 ? date.Year + 1 : date.Year;
    }

    // Buckets dates by calendar month for snapshot grouping.
    private static int GetMonthKey(DateTime date)
    {
        return (date.Year * 100) + date.Month;
    }

    // Sums fiscal-year lost cost for a single department across the monthly snapshots.
    private static decimal SumDepartmentLostCost(
        IReadOnlyList<MonthlySnapshot> fiscalYearMonths,
        string departmentCode)
    {
        return fiscalYearMonths.Sum(month => month.Employees
            .Where(employee => string.Equals(
                employee.DepartmentCode,
                departmentCode,
                StringComparison.OrdinalIgnoreCase))
            .Sum(employee => employee.LostCostMonth));
    }

    // Estimates how many months remain before the employee reaches their cap.
    private static int? GetMonthsToCap(
        decimal balance,
        decimal accrualLimit,
        decimal normalMonthlyAccrual,
        decimal avgMonthlyUsage)
    {
        if (accrualLimit <= 0m)
        {
            return null;
        }

        if (balance >= accrualLimit)
        {
            return 0;
        }

        var netMonthlyAccrual = normalMonthlyAccrual - avgMonthlyUsage;
        if (netMonthlyAccrual <= 0m)
        {
            return null;
        }

        return Math.Max(
            0,
            (int)Math.Round(
                (accrualLimit - balance) / netMonthlyAccrual,
                MidpointRounding.AwayFromZero));
    }

    // Derives the standard monthly accrual from the employee's accrual cap tiers.
    private static decimal GetNormalMonthlyAccrual(decimal accrualLimit)
    {
        return accrualLimit switch
        {
            >= 384m => 16m,
            >= 368m => 15.33m,
            >= 352m => 14.67m,
            >= 336m => 14m,
            >= 320m => 13.33m,
            >= 288m => 12m,
            >= 240m => 10m,
            _ => 10m,
        };
    }

    // Chooses an hourly rate bucket for lost-cost estimation.
    private static decimal GetHourlyRate(string employeeClassDescription)
    {
        if (HourlyRates.TryGetValue(employeeClassDescription, out var rate))
        {
            return rate;
        }

        return employeeClassDescription.Contains("Academic", StringComparison.OrdinalIgnoreCase)
            ? DefaultAcademicRate
            : DefaultStaffRate;
    }

    // Applies the current parity rule: faculty-like classes use 41% benefits load, all others use 51%.
    private static decimal GetBenefitsRate(string classification)
    {
        return string.Equals(classification, "FY Faculty", StringComparison.OrdinalIgnoreCase)
            ? FacultyLikeBenefitsRate
            : DefaultBenefitsRate;
    }

    private static decimal GetLoadedHourlyRate(string classification, decimal hourlyRate)
    {
        return hourlyRate * (1m + GetBenefitsRate(classification));
    }

    // Classifies employees into the status groupings shown in the overview and detail screens.
    private static AccrualStatus GetStatus(decimal percentage)
    {
        return percentage switch
        {
            >= AtCapThresholdPct => AccrualStatus.AtCap,
            >= ApproachingThresholdPct => AccrualStatus.Approaching,
            _ => AccrualStatus.Active,
        };
    }

    // Picks the most common non-empty string from duplicated source rows.
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

    // Normalizes source job-class descriptions into the smaller set of UI/reporting buckets.
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
        string Classification,
        string Department,
        string DepartmentCode,
        string EmployeeId,
        string EmployeeName,
        decimal HourlyRate,
        DateTime? LastVacationDate,
        decimal LostCostMonth,
        int? MonthsToCap,
        decimal NormalMonthlyAccrual,
        decimal PctOfCap,
        decimal CapHours,
        AccrualStatus Status);

    private sealed record EmployeeMonthlyHistoryPoint(
        DateTime AsOfDate,
        decimal AccrualHours,
        decimal HoursTaken);

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

    private sealed record CalculationContext(
        MonthlySnapshot LatestMonth,
        IReadOnlyList<MonthlySnapshot> OrderedMonths,
        int YtdMonthCount);
}
