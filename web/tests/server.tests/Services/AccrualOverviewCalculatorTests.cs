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
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 368m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 95.8m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 14),
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 372m,
                accrualLimit: 384m,
                accrualHours: 12m,
                accrualPercentage: 96.9m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 31),
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 31),
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                asOfDate: new DateTime(2026, 3, 31),
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
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 150m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 62.5m),
            CreateRecord(
                employeeId: "E002",
                asOfDate: new DateTime(2026, 3, 31),
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
        result.LostCostYtd.Should().Be(8424m);
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
        result.DepartmentBreakdown[0].Headcount.Should().Be(1);
        result.DepartmentBreakdown[0].LostCostMonth.Should().Be(936m);
        result.DepartmentBreakdown[0].AtCapCount.Should().Be(1);
        result.DepartmentBreakdown[1].Department.Should().Be("PLANT SCIENCES");
        result.DepartmentBreakdown[1].ApproachingCapCount.Should().Be(1);
    }

    private static EmployeeAccrualBalanceRecord CreateRecord(
        string employeeId,
        DateTime asOfDate,
        string department,
        string employeeClassDescription,
        decimal calculatedBal,
        decimal accrualLimit,
        decimal accrualHours,
        decimal accrualPercentage)
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
            Level5DeptDesc = department,
            TypeLabel = "Vacation",
        };
    }
}
