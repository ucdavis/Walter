using FluentAssertions;
using server.core.Models;
using server.core.Services;

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
    public void GetAssumptions_returns_centralized_settings()
    {
        var result = AccrualOverviewCalculator.GetAssumptions();

        result.AtCapThresholdPct.Should().Be(96m);
        result.ApproachingThresholdPct.Should().Be(80m);
        result.BenefitsRates.Should().Contain(row => row.Label == "FY Faculty" && row.Rate == 0.41m);
        result.BenefitsRates.Should().Contain(row => row.Label == "All other classes" && row.Rate == 0.51m);
        result.HourlyRates.Should().Contain(row => row.Label == "FY Faculty" && row.HourlyRate == 78m);
        result.FallbackAccrualTiers.Should().Contain(row => row.Label == "352+ cap hours" && row.MonthlyAccrualHours == 14.67m);
        result.FallbackAccrualTiers.Should().Contain(row => row.Label == "Below 240 cap hours" && row.MonthlyAccrualHours == 10m);
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
        result.LostCostMonth.Should().Be(1319.76m);
        result.LostCostYtd.Should().Be(1319.76m);
        result.YtdMonthCount.Should().Be(9);
        result.WasteRate.Should().Be(104.7m);

        result.MonthlyLostCost.Should().HaveCount(2);
        result.MonthlyLostCost.Select(point => point.Label)
            .Should().ContainInOrder("Feb 26", "Mar 26");
        result.MonthlyLostCost[^1].LostCost.Should().Be(1319.76m);

        result.EmployeeStatusOverTime.Should().HaveCount(2);
        result.EmployeeStatusOverTime[^1].AtCap.Should().Be(1);
        result.EmployeeStatusOverTime[^1].Approaching.Should().Be(1);
        result.EmployeeStatusOverTime[^1].Active.Should().Be(0);

        result.DepartmentBreakdown.Should().HaveCount(2);
        result.DepartmentBreakdown[0].Department.Should().Be("NUTRITION");
        result.DepartmentBreakdown[0].DepartmentCode.Should().Be("030090");
        result.DepartmentBreakdown[0].Headcount.Should().Be(1);
        result.DepartmentBreakdown[0].LostCostMonth.Should().Be(1319.76m);
        result.DepartmentBreakdown[0].LostCostYtd.Should().Be(1319.76m);
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
        result.LostCostMonth.Should().Be(2152.28m);
        result.MonthlyLostCost.Should().HaveCount(2);
        result.MonthlyLostCost[^1].LostCost.Should().Be(2152.28m);
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
        result.LostCostMonth.Should().Be(1759.68m);
        result.LostCostYtd.Should().Be(1759.68m);
        result.Departments.Select(d => d.Code).Should().ContainInOrder("030090", "030003");
        result.Employees.Should().HaveCount(2);
        result.Employees[0].EmployeeName.Should().Be("Gradziel,Thomas M");
        result.Employees[0].MonthsToCap.Should().Be(0);
        result.Employees[0].LastVacationDate.Should().Be(new DateTime(2026, 1, 31));
        result.Employees[0].LostCostMonth.Should().Be(1759.68m);
        result.Employees[0].LostCostYtd.Should().Be(1759.68m);
        result.Employees[1].EmployeeId.Should().Be("E002");
        result.Employees[1].MonthsToCap.Should().Be(8);
        result.Employees[1].PctOfCap.Should().Be(83.9m);
        result.Employees[1].LostCostYtd.Should().Be(0m);
    }

    [Fact]
    public void BuildDepartmentDetail_sums_employee_projected_loss_from_fiscal_year_start()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Fiscal,Employee",
                asOfDate: new DateTime(2025, 6, 30),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Fiscal,Employee",
                asOfDate: new DateTime(2025, 7, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Fiscal,Employee",
                asOfDate: new DateTime(2025, 8, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.BuildDepartmentDetail(records, "030003");

        result.Should().NotBeNull();
        result!.LostCostMonth.Should().Be(490.75m);
        result.LostCostYtd.Should().Be(981.50m);
        result.Employees.Should().ContainSingle(employee =>
            employee.EmployeeId == "E001" &&
            employee.LostCostMonth == 490.75m &&
            employee.LostCostYtd == 981.50m);
    }

    [Fact]
    public void BuildDepartmentDetail_scopes_employee_projected_loss_to_current_department()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Moved,Employee",
                asOfDate: new DateTime(2025, 7, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Moved,Employee",
                asOfDate: new DateTime(2025, 8, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.BuildDepartmentDetail(records, "030090");

        result.Should().NotBeNull();
        result!.LostCostMonth.Should().Be(490.75m);
        result.LostCostYtd.Should().Be(490.75m);
        result.Employees.Should().ContainSingle(employee =>
            employee.EmployeeId == "E001" &&
            employee.LostCostMonth == 490.75m &&
            employee.LostCostYtd == 490.75m);
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
        result.LostCostMonth.Should().Be(1319.76m);
        result.LostCostYtd.Should().Be(1319.76m);
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
    public void Build_uses_source_hourly_rate_with_existing_benefit_load_for_lost_cost()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Rate,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m,
                hourlyRateFTE: 100m),
        };

        var result = AccrualOverviewCalculator.Build(records);

        result.LostCostMonth.Should().Be(2256m);
        result.DepartmentBreakdown.Should().ContainSingle(row => row.LostCostMonth == 2256m);
    }

    [Fact]
    public void BuildNotificationCandidates_returns_one_candidate_per_eligible_latest_employee()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "AtCap,Employee",
                employeeEmail: "old-atcap@example.com",
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
                employeeName: "AtCap,Employee",
                employeeEmail: null,
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
                employeeName: "AtCap,Employee",
                employeeEmail: "latest-atcap@example.com",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030015",
                department: "ENVIRONMENTAL TOXICOLOGY",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Approaching,Employee",
                employeeEmail: "approaching@example.com",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 204m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 85m),
            CreateRecord(
                employeeId: "E003",
                employeeName: "Active,Employee",
                employeeEmail: "active@example.com",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 120m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 50m),
        };

        var result = AccrualOverviewCalculator.BuildNotificationCandidates(records);

        result.Should().HaveCount(2);
        result.Select(candidate => candidate.EmployeeId).Should().Equal("E001", "E002");

        var atCap = result.Single(candidate => candidate.EmployeeId == "E001");
        atCap.SnapshotAsOfDate.Should().Be(new DateTime(2026, 3, 31));
        atCap.EmployeeAsOfDate.Should().Be(new DateTime(2026, 3, 31));
        atCap.EmployeeEmail.Should().Be("latest-atcap@example.com");
        atCap.Status.Should().Be(AccrualNotificationStatus.AtCap);
        atCap.EmployeeGroup.Should().Be(AccrualEmployeeGroup.FacultyAcademic);
        atCap.BalanceHours.Should().Be(384m);
        atCap.CapHours.Should().Be(384m);
        atCap.PctOfCap.Should().Be(100m);
        atCap.LostCostMonth.Should().Be(1759.68m);

        var approaching = result.Single(candidate => candidate.EmployeeId == "E002");
        approaching.Status.Should().Be(AccrualNotificationStatus.ApproachingCap);
        approaching.EmployeeGroup.Should().Be(AccrualEmployeeGroup.Staff);
        approaching.EmployeeEmail.Should().Be("approaching@example.com");
        approaching.LostCostMonth.Should().Be(0m);
    }

    [Fact]
    public void BuildNotificationCandidates_uses_most_recent_non_empty_email_from_employee_history()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Email,Employee",
                employeeEmail: "first@example.com",
                asOfDate: new DateTime(2026, 1, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 340m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 88.5m),
            CreateRecord(
                employeeId: "E001",
                employeeName: "Email,Employee",
                employeeEmail: " latest@example.com ",
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
                employeeName: "Email,Employee",
                employeeEmail: "",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.BuildNotificationCandidates(records);

        result.Should().ContainSingle();
        result[0].EmployeeEmail.Should().Be("latest@example.com");
    }

    [Fact]
    public void BuildNotificationCandidates_maps_employee_groups_from_normalized_classifications()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateRecord(
                employeeId: "E001",
                employeeName: "Faculty,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030090",
                department: "NUTRITION",
                employeeClassDescription: "Academic: Faculty",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 0m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E002",
                employeeName: "Staff,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Staff: Career",
                calculatedBal: 240m,
                accrualLimit: 240m,
                accrualHours: 10m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E003",
                employeeName: "Senior Manager,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Senior Management Group",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
            CreateRecord(
                employeeId: "E004",
                employeeName: "Unknown,Employee",
                asOfDate: new DateTime(2026, 3, 31),
                departmentCode: "030003",
                department: "PLANT SCIENCES",
                employeeClassDescription: "Mystery Classification",
                calculatedBal: 384m,
                accrualLimit: 384m,
                accrualHours: 16m,
                accrualPercentage: 100m),
        };

        var result = AccrualOverviewCalculator.BuildNotificationCandidates(records);

        result.Should().Contain(candidate =>
            candidate.EmployeeId == "E001" &&
            candidate.Classification == "FY Faculty" &&
            candidate.EmployeeGroup == AccrualEmployeeGroup.FacultyAcademic);
        result.Should().Contain(candidate =>
            candidate.EmployeeId == "E002" &&
            candidate.Classification == "PSS" &&
            candidate.EmployeeGroup == AccrualEmployeeGroup.Staff);
        result.Should().Contain(candidate =>
            candidate.EmployeeId == "E003" &&
            candidate.Classification == "MSP" &&
            candidate.EmployeeGroup == AccrualEmployeeGroup.Staff);
        result.Should().Contain(candidate =>
            candidate.EmployeeId == "E004" &&
            candidate.Classification == "Mystery Classification" &&
            candidate.EmployeeGroup == AccrualEmployeeGroup.Staff);
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
            employee.LostCostMonth == 719.93m);
        result.Employees.Should().ContainSingle(employee =>
            employee.EmployeeId == "E002" &&
            employee.AccrualHoursPerMonth == 14m &&
            employee.LostCostMonth == 687.05m);
        result.LostCostMonth.Should().Be(1406.98m);
        result.AtCapCount.Should().Be(2);
    }

    [Fact]
    public void Usage_history_keeps_positive_period_before_later_zero_usage_and_duplicate_positions()
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 8, 31), hoursTaken: 4m, accrualHours: 12m),
            CreateUsageRecord(new DateTime(2026, 9, 12), hoursTaken: 8m, accrualHours: 12m),
            CreateUsageRecord(new DateTime(2026, 9, 12), hoursTaken: 8m, accrualHours: 12m, position: "P002"),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: 0m, accrualHours: 0m),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: 0m, accrualHours: 0m, position: "P002"),
        };

        var detail = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!;
        var employee = detail.Employees.Should().ContainSingle().Subject;
        employee.LastVacationDate.Should().Be(new DateTime(2026, 9, 12));
        // Two observed months average six hours of usage. (240 - 200) / (12 - 6) rounds to seven.
        employee.MonthsToCap.Should().Be(7);
        employee.AccrualHoursPerMonth.Should().Be(12m);
        employee.BalanceHours.Should().Be(200m);
        employee.CapHours.Should().Be(240m);
        detail.ApproachingCapCount.Should().Be(1);
        detail.LostCostMonth.Should().Be(0m);

        var candidate = AccrualOverviewCalculator.BuildNotificationCandidates(records).Should().ContainSingle().Subject;
        candidate.LastVacationDate.Should().Be(employee.LastVacationDate);
        candidate.MonthsToCap.Should().Be(employee.MonthsToCap);
    }

    [Fact]
    public void Usage_history_sums_distinct_periods_once_without_summing_accrual_awards()
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 9, 5), hoursTaken: 4m, accrualHours: 10m),
            CreateUsageRecord(new DateTime(2026, 9, 5), hoursTaken: 4m, accrualHours: 10m, position: "P002"),
            CreateUsageRecord(new DateTime(2026, 9, 19), hoursTaken: 8m, accrualHours: 16m),
            CreateUsageRecord(new DateTime(2026, 9, 19), hoursTaken: 8m, accrualHours: 16m, position: "P002"),
            CreateUsageRecord(new DateTime(2026, 9, 30), hoursTaken: 0m, accrualHours: 0m),
        };

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        employee.LastVacationDate.Should().Be(new DateTime(2026, 9, 19));
        employee.AccrualHoursPerMonth.Should().Be(16m);
        // The source's latest positive award remains the accrual estimate; monthly usage is 4 + 8.
        employee.MonthsToCap.Should().Be(10);
        var reordered = AccrualOverviewCalculator.BuildDepartmentDetail(records.Reverse().ToArray(), "TEST")!;
        reordered.Employees.Single().Should().BeEquivalentTo(employee);
    }

    [Fact]
    public void Usage_history_averages_six_monthly_totals_rather_than_six_periods()
    {
        var records = new List<EmployeeAccrualBalanceRecord>
        {
            CreateUsageRecord(new DateTime(2026, 3, 31), hoursTaken: 120m),
        };
        for (var month = 4; month <= 9; month++)
        {
            records.Add(CreateUsageRecord(new DateTime(2026, month, 12), hoursTaken: 2m));
            records.Add(CreateUsageRecord(new DateTime(2026, month, 26), hoursTaken: 4m));
        }

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        // March is outside the last six recorded months. Each remaining month has six usage hours.
        employee.MonthsToCap.Should().Be(4);
        employee.LastVacationDate.Should().Be(new DateTime(2026, 9, 26));
    }

    [Fact]
    public void Usage_history_averages_only_available_months_without_inventing_zero_usage()
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 1, 31), hoursTaken: 20m),
            CreateUsageRecord(new DateTime(2026, 7, 31), hoursTaken: 4m),
            CreateUsageRecord(new DateTime(2026, 9, 12), hoursTaken: 0m),
        };

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        // Preserve the existing observed-month contract, including the partial current month.
        employee.MonthsToCap.Should().Be(5);
        employee.LastVacationDate.Should().Be(new DateTime(2026, 7, 31));
    }

    [Fact]
    public void Usage_history_finds_last_vacation_before_the_projection_averaging_window()
    {
        var records = Enumerable.Range(3, 7)
            .Select(month => CreateUsageRecord(
                new DateTime(2026, month, DateTime.DaysInMonth(2026, month)),
                hoursTaken: month == 3 ? 8m : 0m))
            .ToArray();

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        employee.LastVacationDate.Should().Be(new DateTime(2026, 3, 31));
        employee.MonthsToCap.Should().Be(3);
    }

    [Fact]
    public void Usage_history_preserves_signed_usage_corrections_and_positive_reporting_date()
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 9, 12), hoursTaken: 8m),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: -8m),
        };

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        employee.LastVacationDate.Should().Be(new DateTime(2026, 9, 12));
        employee.MonthsToCap.Should().Be(3);
    }

    [Fact]
    public void Usage_history_preserves_negative_corrections_with_null_duplicate_positions()
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 9, 12), hoursTaken: 8m),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: -8m),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: null, position: "P002"),
        };

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        employee.LastVacationDate.Should().Be(new DateTime(2026, 9, 12));
        employee.MonthsToCap.Should().Be(3);

        var candidate = AccrualOverviewCalculator.BuildNotificationCandidates(records).Single();
        candidate.MonthsToCap.Should().Be(employee.MonthsToCap);
        candidate.LastVacationDate.Should().Be(employee.LastVacationDate);
    }

    [Fact]
    public void Usage_history_treats_all_null_position_usage_as_zero()
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: null),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: null, position: "P002"),
        };

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        employee.LastVacationDate.Should().BeNull();
        employee.MonthsToCap.Should().Be(3);
    }

    [Fact]
    public void Usage_history_with_no_usage_or_positive_accrual_uses_cap_fallback()
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 9, 12), hoursTaken: null, accrualHours: null),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: 0m, accrualHours: 0m),
        };

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        employee.LastVacationDate.Should().BeNull();
        employee.AccrualHoursPerMonth.Should().Be(10m);
        employee.MonthsToCap.Should().Be(4);
    }

    [Theory]
    [InlineData(200, 0, 0, null)]
    [InlineData(240, 240, 20, 0)]
    [InlineData(250, 240, 20, 0)]
    [InlineData(200, 240, 16, null)]
    [InlineData(200, 240, 20, null)]
    [InlineData(232, 240, 0, 1)]
    public void Usage_history_preserves_cap_and_nonpositive_net_accrual_rules(
        int balance, int cap, int usage, int? expectedMonths)
    {
        var records = new[]
        {
            CreateUsageRecord(new DateTime(2026, 9, 12), hoursTaken: usage, balance: balance, cap: cap),
            CreateUsageRecord(new DateTime(2026, 9, 26), hoursTaken: 0m, accrualHours: 0m, balance: balance, cap: cap),
        };

        var employee = AccrualOverviewCalculator.BuildDepartmentDetail(records, "TEST")!.Employees.Single();
        employee.MonthsToCap.Should().Be(expectedMonths);
    }

    private static EmployeeAccrualBalanceRecord CreateUsageRecord(
        DateTime date,
        decimal? hoursTaken,
        decimal? accrualHours = 16m,
        string position = "P001",
        decimal balance = 200m,
        decimal cap = 240m)
    {
        return new EmployeeAccrualBalanceRecord
        {
            EmployeeId = "SYNTHETIC-001",
            EmployeeName = "Example Employee",
            EmployeeEmail = "example@example.invalid",
            EmployeeClassDescription = "Staff: Career",
            PositionNumber = position,
            AsOfDate = date,
            HoursTaken = hoursTaken,
            AccrualHours = accrualHours,
            CalculatedBal = balance,
            AccrualLimit = cap,
            Level5Dept = "TEST",
            Level5DeptDesc = "Example Department",
            TypeLabel = "Vacation",
        };
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
        string? employeeEmail = null,
        decimal? hoursTaken = null,
        decimal? hourlyRateFTE = null)
    {
        return new EmployeeAccrualBalanceRecord
        {
            AccrualHours = accrualHours,
            AccrualLimit = accrualLimit,
            AccrualPercentage = accrualPercentage,
            AsOfDate = asOfDate,
            CalculatedBal = calculatedBal,
            EmployeeClassDescription = employeeClassDescription,
            EmployeeEmail = employeeEmail,
            EmployeeId = employeeId,
            EmployeeName = employeeName,
            HourlyRateFTE = hourlyRateFTE,
            HoursTaken = hoursTaken,
            Level5Dept = departmentCode,
            Level5DeptDesc = department,
            TypeLabel = "Vacation",
        };
    }
}
