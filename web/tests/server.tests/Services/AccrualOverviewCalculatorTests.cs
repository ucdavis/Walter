using FluentAssertions;
using server.Models;
using server.Services;

namespace server.tests.Services;

public sealed class AccrualOverviewCalculatorTests
{
    [Fact]
    public void Build_returns_empty_response_when_no_records_exist()
    {
        var result = AccrualOverviewCalculator.Build([]);

        result.TotalEmployees.Should().Be(0);
        result.DepartmentBreakdown.Should().BeEmpty();
        result.MonthlyLostCost.Should().BeEmpty();
        result.EmployeeStatusOverTime.Should().BeEmpty();
    }

    [Fact]
    public void Build_uses_latest_month_snapshot_and_deduplicates_employee_rows()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            // Employee 1: latest month is at cap with zero accrual, so lost cost should
            // fall back to the previous positive accrual amount.
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 2, 28),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 368m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 95.8m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 14),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 372m,
                accrualLimit: 384m,
                accrualHours: 12m,
                accrualPercentage: 96.9m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030015",
                department: "ENVIRONMENTAL TOXICOLOGY",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),

            // Employee 2: approaching cap and should remain in the March snapshot.
            CreateRecord(
                employeeId: "E002",
                asOfDate: new DateTime(2026, 2, 28),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 150m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 62.5m),
            CreateRecord(
                employeeId: "E002",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 204m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 85m),
        };

        var result = AccrualOverviewCalculator.Build(records);

        result.AsOfDate.Should().Be(new DateTime(2026, 3, 31));
        result.TotalEmployees.Should().Be(2);
        result.TotalDepartments.Should().Be(2);
        result.AtCapCount.Should().Be(1);
        result.ApproachingCapCount.Should().Be(1);
        result.LostCostMonth.Should().Be(936m);
        result.LostCostYtd.Should().Be(936m);
        result.YtdMonthCount.Should().Be(9);
        result.WasteRate.Should().Be(74.2m);

        result.MonthlyLostCost.Should().HaveCount(2);
        result.MonthlyLostCost.Select(point => point.Label)
            .Should().ContainInOrder("Feb 26", "Mar 26");
        result.MonthlyLostCost[^1].LostCost.Should().Be(936m);

        result.EmployeeStatusOverTime.Should().HaveCount(2);
        result.EmployeeStatusOverTime[^1].AtCap.Should().Be(1);
        result.EmployeeStatusOverTime[^1].Approaching.Should().Be(1);
        result.EmployeeStatusOverTime[^1].Active.Should().Be(0);

        result.DepartmentBreakdown.Should().HaveCount(2);
        result.DepartmentBreakdown[0].Department.Should().Be("NUTRITION");
        result.DepartmentBreakdown[0].DepartmentCode.Should().Be("030090");
        result.DepartmentBreakdown[0].Headcount.Should().Be(1);
        result.DepartmentBreakdown[0].LostCostMonth.Should().Be(936m);
        result.DepartmentBreakdown[0].LostCostYtd.Should().Be(936m);
        result.DepartmentBreakdown[0].AtCapCount.Should().Be(1);
        result.DepartmentBreakdown[1].Department.Should().Be("PLANT SCIENCES");
        result.DepartmentBreakdown[1].DepartmentCode.Should().Be("030003");
        result.DepartmentBreakdown[1].LostCostYtd.Should().Be(0m);
        result.DepartmentBreakdown[1].ApproachingCapCount.Should().Be(1);
    }

    [Fact]
    public void Build_carries_forward_previous_month_employees_missing_from_latest_month()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Biweekly,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 8m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Biweekly,Employee",
                asOfDate: new DateTime(2026, 4, 11),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 8m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Monthly,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.Build(records);

        result.AsOfDate.Should().Be(new DateTime(2026, 4, 11));
        result.TotalEmployees.Should().Be(2);
        result.AtCapCount.Should().Be(2);
        result.LostCostMonth.Should().Be(1508m);
        result.MonthlyLostCost.Should().HaveCount(2);
        result.MonthlyLostCost[^1].LostCost.Should().Be(1508m);
        result.EmployeeStatusOverTime[^1].AtCap.Should().Be(2);
        result.DepartmentBreakdown.Should().HaveCount(2);
        result.DepartmentBreakdown.Select(row => row.DepartmentCode)
            .Should().BeEquivalentTo(["030003", "030090"]);
    }

    [Fact]
    public void Build_does_not_carry_forward_previous_month_employees_into_month_end_snapshot()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Current,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 200m,
                accrualLimit: 240m,
                accrualHours: 8m,
                accrualPercentage: 83.3m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Current,Employee",
                asOfDate: new DateTime(2026, 4, 30),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 208m,
                accrualLimit: 240m,
                accrualHours: 8m,
                accrualPercentage: 86.7m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Departed,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.Build(records);

        result.AsOfDate.Should().Be(new DateTime(2026, 4, 30));
        result.TotalEmployees.Should().Be(1);
        result.AtCapCount.Should().Be(0);
        result.ApproachingCapCount.Should().Be(1);
        result.LostCostMonth.Should().Be(0m);
        result.EmployeeStatusOverTime[^1].AtCap.Should().Be(0);
        result.DepartmentBreakdown.Should().ContainSingle();
        result.DepartmentBreakdown[0].DepartmentCode.Should().Be("030003");
    }

    [Fact]
    public void BuildDepartmentDetail_returns_summary_and_employees_for_department_code()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Gradziel,Thomas M",
                asOfDate: new DateTime(2026, 1, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 368m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 95.8m,
                hoursTaken: 8m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Gradziel,Thomas M",
                asOfDate: new DateTime(2026, 2, 28),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m,
                hoursTaken: 0m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Saichaie,Amanda M",
                asOfDate: new DateTime(2026, 1, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 280m,
                accrualLimit: 384m,
                accrualHours: 8m,
                accrualPercentage: 72.9m,
                hoursTaken: 0m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Saichaie,Amanda M",
                asOfDate: new DateTime(2026, 2, 28),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 322m,
                accrualLimit: 384m,
                accrualHours: 8m,
                accrualPercentage: 83.9m,
                hoursTaken: 0m),
            CreateRecord(
                employeeId: "E003",
                employeeName: "Other,Employee",
                asOfDate: new DateTime(2026, 2, 28),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 120m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 50m,
                hoursTaken: 0m),
        };

        var result = AccrualOverviewCalculator.BuildDepartmentDetail(records, "030003");

        result.Should().NotBeNull();
        result!.DepartmentCode.Should().Be("030003");
        result.DepartmentName.Should().Be("PLANT SCIENCES");
        result.Headcount.Should().Be(2);
        result.AtCapCount.Should().Be(1);
        result.ApproachingCapCount.Should().Be(1);
        result.LostCostMonth.Should().Be(1248m);
        result.LostCostYtd.Should().Be(1248m);
        result.Departments.Select(d => d.Code).Should().ContainInOrder("030090", "030003");
        result.Employees.Should().HaveCount(2);
        result.Employees[0].EmployeeName.Should().Be("Gradziel,Thomas M");
        result.Employees[0].MonthsToCap.Should().Be(0);
        result.Employees[0].LastVacationDate.Should().Be(new DateTime(2026, 1, 31));
        result.Employees[0].LostCostMonth.Should().Be(1248m);
        result.Employees[1].EmployeeId.Should().Be("E002");
        result.Employees[1].MonthsToCap.Should().Be(8);
        result.Employees[1].PctOfCap.Should().Be(83.9m);
    }

    [Fact]
    public void BuildDepartmentDetail_carries_forward_department_employee_missing_from_latest_month()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Biweekly,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 200m,
                accrualLimit: 240m,
                accrualHours: 8m,
                accrualPercentage: 83.3m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Biweekly,Employee",
                asOfDate: new DateTime(2026, 4, 11),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 208m,
                accrualLimit: 240m,
                accrualHours: 8m,
                accrualPercentage: 86.7m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Monthly,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.BuildDepartmentDetail(records, "030003");

        result.Should().NotBeNull();
        result!.AsOfDate.Should().Be(new DateTime(2026, 4, 11));
        result.Headcount.Should().Be(2);
        result.AtCapCount.Should().Be(1);
        result.ApproachingCapCount.Should().Be(1);
        result.Employees.Should().HaveCount(2);
        result.Employees.Select(employee => employee.EmployeeName)
            .Should().Contain(["Biweekly,Employee", "Monthly,Employee"]);
    }

    [Fact]
    public void Build_treats_employees_at_or_above_96_percent_as_at_cap()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Threshold,Employee",
                asOfDate: new DateTime(2026, 2, 28),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 360m,
                accrualLimit: 384m,
                accrualHours: 12m,
                accrualPercentage: 93.8m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Threshold,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 372m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 96.9m),
        };

        var result = AccrualOverviewCalculator.Build(records);

        result.TotalEmployees.Should().Be(1);
        result.AtCapCount.Should().Be(1);
        result.ApproachingCapCount.Should().Be(0);
        result.LostCostMonth.Should().Be(936m);
        result.LostCostYtd.Should().Be(936m);
        result.DepartmentBreakdown.Should().ContainSingle();
        result.DepartmentBreakdown[0].AtCapCount.Should().Be(1);
        result.DepartmentBreakdown[0].ApproachingCapCount.Should().Be(0);
    }

    [Fact]
    public void Build_keeps_employees_below_96_percent_in_approaching()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Boundary,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 368m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 95.8m),
        };

        var result = AccrualOverviewCalculator.Build(records);

        result.TotalEmployees.Should().Be(1);
        result.AtCapCount.Should().Be(0);
        result.ApproachingCapCount.Should().Be(1);
        result.LostCostMonth.Should().Be(0m);
        result.DepartmentBreakdown.Should().ContainSingle();
        result.DepartmentBreakdown[0].AtCapCount.Should().Be(0);
        result.DepartmentBreakdown[0].ApproachingCapCount.Should().Be(1);
    }

    [Fact]
    public void BuildDepartmentDetail_uses_mid_tier_fallback_accrual_rates_when_current_history_has_no_positive_accrual()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Fallback352,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 352m,
                accrualLimit: 352m,
                accrualHours: 0m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Fallback336,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 336m,
                accrualLimit: 336m,
                accrualHours: 0m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.BuildDepartmentDetail(records, "030003");

        result.Should().NotBeNull();
        result!.Employees.Should().HaveCount(2);
        result.Employees.Should().ContainSingle(employee =>
            employee.EmployeeId == "E001" &&
            employee.AccrualHoursPerMonth == 14.67m &&
            employee.LostCostMonth == 476.78m);
        result.Employees.Should().ContainSingle(employee =>
            employee.EmployeeId == "E002" &&
            employee.AccrualHoursPerMonth == 14m &&
            employee.LostCostMonth == 455m);
        result.LostCostMonth.Should().Be(931.78m);
        result.AtCapCount.Should().Be(2);
    }

    private static EmployeeAccrualBalanceRecord CreateRecord(
        string employeeId,
        string departmentCode,
        DateTime asOfDate,
        string department,
        string employeeClassDescription,
        decimal calculatedBal,
        decimal accrualLimit,
        decimal accrualHours,
        decimal accrualPercentage,
        string? employeeName = null,
        decimal? hoursTaken = null)
    {
        return new EmployeeAccrualBalanceRecord
        {
            AccrualHours = accrualHours,
            AccrualLimit = accrualLimit,
            AccrualPercentage = accrualPercentage,
            AsOfDate = asOfDate,
            CalculatedBal = calculatedBal,
            EmployeeClassDescription = employeeClassDescription,
            EmployeeId = employeeId,
            EmployeeName = employeeName,
            HoursTaken = hoursTaken,
            Level5Dept = departmentCode,
            Level5DeptDesc = department,
            TypeLabel = "Vacation",
        };
    }
}
