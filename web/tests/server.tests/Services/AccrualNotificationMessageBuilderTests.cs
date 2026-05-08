using System.Text.Json;
using FluentAssertions;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using Server.Tests;

namespace server.tests.Services;

public sealed class AccrualNotificationMessageBuilderTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void BuildEmployeeMessages_creates_employee_drafts_with_template_key_dedupe_key_and_payload()
    {
        var builder = new AccrualNotificationMessageBuilder();
        var runId = Guid.NewGuid();
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var candidate = new AccrualNotificationCandidate
        {
            AccrualHoursPerMonth = 10m,
            BalanceHours = 240m,
            CapHours = 240m,
            Classification = "PSS",
            Department = "PLANT SCIENCES",
            DepartmentCode = "030003",
            EmployeeAsOfDate = new DateTime(2026, 4, 30),
            EmployeeEmail = " staff.member@example.com ",
            EmployeeGroup = AccrualEmployeeGroup.Staff,
            EmployeeId = "E001",
            EmployeeName = "Staff Member",
            LastVacationDate = new DateTime(2026, 2, 28),
            MonthsToCap = 0,
            PctOfCap = 100m,
            SnapshotAsOfDate = new DateTime(2026, 4, 30),
            Status = AccrualNotificationStatus.AtCap,
        };

        var result = builder.BuildEmployeeMessages(runId, [candidate], now);

        result.Skipped.Should().BeEmpty();
        result.Messages.Should().ContainSingle();

        var message = result.Messages[0];
        message.RunId.Should().Be(runId);
        message.NotificationType.Should().Be(AccrualNotificationMessageBuilder.EmployeeNotificationType);
        message.RecipientType.Should().Be(OutboundMessage.RecipientTypes.Employee);
        message.RecipientEmail.Should().Be("staff.member@example.com");
        message.RecipientName.Should().Be("Staff Member");
        message.DedupeKey.Should().Be("accrual:employee:E001:2026-04-30");
        message.TemplateKey.Should().Be("accrual.employee.staff.v1");
        message.TemplateVersion.Should().Be(1);
        message.PayloadVersion.Should().Be(1);
        message.NotBeforeUtc.Should().Be(now);

        var payload = JsonSerializer.Deserialize<AccrualEmployeeNotificationPayload>(
            message.PayloadJson,
            JsonOptions);
        payload.Should().NotBeNull();
        payload!.EmployeeId.Should().Be("E001");
        payload.EmployeeName.Should().Be("Staff Member");
        payload.EmployeeGroup.Should().Be(nameof(AccrualEmployeeGroup.Staff));
        payload.Status.Should().Be(nameof(AccrualNotificationStatus.AtCap));
        payload.BalanceHours.Should().Be(240m);
        payload.LastVacationDate.Should().Be(new DateTime(2026, 2, 28));
    }

    [Theory]
    [InlineData(AccrualEmployeeGroup.FacultyAcademic, "accrual.employee.faculty-academic.v1")]
    [InlineData(AccrualEmployeeGroup.Staff, "accrual.employee.staff.v1")]
    [InlineData(AccrualEmployeeGroup.Generic, "accrual.employee.generic.v1")]
    public void BuildEmployeeMessages_chooses_template_key_by_employee_group(
        AccrualEmployeeGroup employeeGroup,
        string expectedTemplateKey)
    {
        var builder = new AccrualNotificationMessageBuilder();
        var candidate = CreateCandidate("E001", "person@example.com", employeeGroup);

        var result = builder.BuildEmployeeMessages(
            Guid.NewGuid(),
            [candidate],
            new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc));

        result.Messages.Should().ContainSingle();
        result.Messages[0].TemplateKey.Should().Be(expectedTemplateKey);
    }

    [Fact]
    public void BuildEmployeeMessages_skips_candidates_with_invalid_email()
    {
        var builder = new AccrualNotificationMessageBuilder();

        var result = builder.BuildEmployeeMessages(
            Guid.NewGuid(),
            [
                CreateCandidate("E001", null, AccrualEmployeeGroup.Staff),
                CreateCandidate("E002", "not-an-email", AccrualEmployeeGroup.Staff),
                CreateCandidate("E003", "valid@example.com", AccrualEmployeeGroup.Staff),
            ],
            new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc));

        result.Messages.Should().ContainSingle();
        result.Messages[0].RecipientEmail.Should().Be("valid@example.com");
        result.Skipped.Should().HaveCount(2);
        result.Skipped.Should().OnlyContain(skip =>
            skip.RecipientType == OutboundMessage.RecipientTypes.Employee &&
            skip.Reason == AccrualMessageSkipReasons.InvalidRecipientEmail);
        result.Skipped.Select(skip => skip.RecipientKey).Should().BeEquivalentTo(["E001", "E002"]);
    }

    [Fact]
    public void BuildViewerReportMessages_creates_viewer_report_drafts_with_payload()
    {
        var builder = new AccrualNotificationMessageBuilder();
        var runId = Guid.NewGuid();
        var viewerId = Guid.NewGuid();
        var now = new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc);
        var overview = CreateOverview();

        var result = builder.BuildViewerReportMessages(
            runId,
            overview,
            [new AccrualViewerRecipient(viewerId, " viewer@example.com ", "Viewer Person")],
            now);

        result.Skipped.Should().BeEmpty();
        result.Messages.Should().ContainSingle();

        var message = result.Messages[0];
        message.RunId.Should().Be(runId);
        message.NotificationType.Should().Be(AccrualNotificationMessageBuilder.ViewerReportNotificationType);
        message.RecipientType.Should().Be(OutboundMessage.RecipientTypes.AccrualViewer);
        message.RecipientEmail.Should().Be("viewer@example.com");
        message.RecipientName.Should().Be("Viewer Person");
        message.DedupeKey.Should().Be($"accrual:viewer-report:{viewerId}:2026-04-30");
        message.TemplateKey.Should().Be(AccrualNotificationMessageBuilder.ViewerReportTemplateKey);
        message.NotBeforeUtc.Should().Be(now);

        var payload = JsonSerializer.Deserialize<AccrualViewerReportPayload>(
            message.PayloadJson,
            JsonOptions);
        payload.Should().NotBeNull();
        payload!.SnapshotAsOfDate.Should().Be(new DateTime(2026, 4, 30));
        payload.AtCapCount.Should().Be(2);
        payload.ApproachingCapCount.Should().Be(3);
        payload.DepartmentBreakdown.Should().ContainSingle();
        payload.DepartmentBreakdown[0].DepartmentCode.Should().Be("030003");
    }

    [Fact]
    public void BuildViewerReportMessages_skips_recipients_with_invalid_email()
    {
        var builder = new AccrualNotificationMessageBuilder();
        var validViewerId = Guid.NewGuid();
        var invalidViewerId = Guid.NewGuid();

        var result = builder.BuildViewerReportMessages(
            Guid.NewGuid(),
            CreateOverview(),
            [
                new AccrualViewerRecipient(invalidViewerId, "", "Invalid Viewer"),
                new AccrualViewerRecipient(validViewerId, "valid@example.com", "Valid Viewer"),
            ],
            new DateTime(2026, 5, 7, 20, 0, 0, DateTimeKind.Utc));

        result.Messages.Should().ContainSingle();
        result.Messages[0].DedupeKey.Should().Be($"accrual:viewer-report:{validViewerId}:2026-04-30");
        result.Skipped.Should().ContainSingle(skip =>
            skip.RecipientType == OutboundMessage.RecipientTypes.AccrualViewer &&
            skip.RecipientKey == invalidViewerId.ToString() &&
            skip.Reason == AccrualMessageSkipReasons.InvalidRecipientEmail);
    }

    [Fact]
    public async Task AccrualViewerRecipientProvider_returns_only_active_explicit_accrual_viewers()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var accrualViewerRole = new Role { Name = Role.Names.AccrualViewer };
        var adminRole = new Role { Name = Role.Names.Admin };
        var activeViewer = CreateUser("activeviewer", "active.viewer@example.com", isActive: true);
        var inactiveViewer = CreateUser("inactiveviewer", "inactive.viewer@example.com", isActive: false);
        var adminOnly = CreateUser("adminonly", "admin.only@example.com", isActive: true);
        var viewerAdmin = CreateUser("vieweradmin", "viewer.admin@example.com", isActive: true);

        ctx.Roles.AddRange(accrualViewerRole, adminRole);
        ctx.Users.AddRange(activeViewer, inactiveViewer, adminOnly, viewerAdmin);
        await ctx.SaveChangesAsync();

        ctx.Permissions.AddRange(
            new Permission { UserId = activeViewer.Id, RoleId = accrualViewerRole.Id },
            new Permission { UserId = inactiveViewer.Id, RoleId = accrualViewerRole.Id },
            new Permission { UserId = adminOnly.Id, RoleId = adminRole.Id },
            new Permission { UserId = viewerAdmin.Id, RoleId = adminRole.Id },
            new Permission { UserId = viewerAdmin.Id, RoleId = accrualViewerRole.Id });
        await ctx.SaveChangesAsync();

        var provider = new AccrualViewerRecipientProvider(ctx);

        var result = await provider.GetActiveAccrualViewersAsync();

        result.Select(viewer => viewer.UserId).Should().BeEquivalentTo([activeViewer.Id, viewerAdmin.Id]);
        result.Should().Contain(viewer =>
            viewer.UserId == activeViewer.Id &&
            viewer.Email == "active.viewer@example.com" &&
            viewer.Name == "activeviewer");
        result.Should().Contain(viewer =>
            viewer.UserId == viewerAdmin.Id &&
            viewer.Email == "viewer.admin@example.com" &&
            viewer.Name == "vieweradmin");
    }

    private static AccrualNotificationCandidate CreateCandidate(
        string employeeId,
        string? email,
        AccrualEmployeeGroup employeeGroup)
    {
        return new AccrualNotificationCandidate
        {
            AccrualHoursPerMonth = 10m,
            BalanceHours = 240m,
            CapHours = 240m,
            Classification = employeeGroup == AccrualEmployeeGroup.Staff ? "PSS" : "FY Faculty",
            Department = "PLANT SCIENCES",
            DepartmentCode = "030003",
            EmployeeAsOfDate = new DateTime(2026, 4, 30),
            EmployeeEmail = email,
            EmployeeGroup = employeeGroup,
            EmployeeId = employeeId,
            EmployeeName = $"Employee {employeeId}",
            PctOfCap = 100m,
            SnapshotAsOfDate = new DateTime(2026, 4, 30),
            Status = AccrualNotificationStatus.AtCap,
        };
    }

    private static AccrualOverviewResponse CreateOverview()
    {
        return new AccrualOverviewResponse
        {
            AsOfDate = new DateTime(2026, 4, 30),
            ApproachingCapCount = 3,
            AtCapCount = 2,
            DepartmentBreakdown =
            [
                new AccrualDepartmentBreakdownRow
                {
                    ApproachingCapCount = 1,
                    AtCapCount = 2,
                    Department = "PLANT SCIENCES",
                    DepartmentCode = "030003",
                    Headcount = 12,
                    LostCostMonth = 1234.56m,
                    LostCostYtd = 4567.89m,
                },
            ],
            LostCostMonth = 1234.56m,
            LostCostYtd = 4567.89m,
            TotalDepartments = 1,
            TotalEmployees = 20,
            WasteRate = 12.3m,
            YtdMonthCount = 10,
        };
    }

    private static User CreateUser(string kerberos, string email, bool isActive)
    {
        return new User
        {
            Id = Guid.NewGuid(),
            Kerberos = kerberos,
            IamId = $"IAM-{kerberos}",
            EmployeeId = $"E-{kerberos}",
            DisplayName = kerberos,
            Email = email,
            IsActive = isActive,
        };
    }
}
