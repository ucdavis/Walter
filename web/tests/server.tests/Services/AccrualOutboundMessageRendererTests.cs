using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mjml.Net;
using Razor.Templating.Core;
using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.tests.Services;

public sealed class AccrualOutboundMessageRendererTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task RenderAsync_renders_staff_employee_template_from_payload()
    {
        var renderer = CreateRenderer();
        var message = CreateEmployeeMessage(
            "accrual.employee.staff.v1",
            new AccrualEmployeeNotificationPayload
            {
                AccrualHoursPerMonth = 10m,
                BalanceHours = 240m,
                CapHours = 240m,
                Classification = "PSS",
                Department = "PLANT SCIENCES",
                DepartmentCode = "030003",
                EmployeeAsOfDate = new DateTime(2026, 4, 30),
                EmployeeGroup = nameof(AccrualEmployeeGroup.Staff),
                EmployeeId = "E001",
                EmployeeName = "Staff Member",
                LastVacationDate = new DateTime(2026, 2, 28),
                LostCostMonth = 500m,
                MonthsToCap = 0,
                PctOfCap = 100m,
                SnapshotAsOfDate = new DateTime(2026, 4, 30),
                Status = nameof(AccrualNotificationStatus.AtCap),
            });

        var rendered = await renderer.RenderAsync(message);

        rendered.Subject.Should().Be("Action Needed: Your Vacation Accrual is at 100% of Maximum");
        rendered.ReplyToEmail.Should().BeNull();
        rendered.ReplyToName.Should().BeNull();
        rendered.TextBody.Should().Contain("Dear **Staff Member**,");
        rendered.TextBody.Should().Contain("You will not accrue additional hours until your balance falls below the cap");
        rendered.TextBody.Should().Contain("Hours to Take");
        rendered.TextBody.Should().Contain("$500");
        rendered.TextBody.Should().Contain("Open TRS Time Reporting");
        rendered.TextBody.Should().Contain("https://trs.ucdavis.edu/");
        rendered.TextBody.Should().Contain("of 240 hrs");
        rendered.HtmlBody.Should().Contain("Walter");
        rendered.HtmlBody.Should().Contain("Dear <strong>Staff Member</strong>,");
        rendered.HtmlBody.Should().Contain("You will not accrue additional hours until your balance falls below the cap");
        rendered.HtmlBody.Should().Contain("Hours to Take");
        rendered.HtmlBody.Should().Contain("$500");
        rendered.HtmlBody.Should().Contain("Open TRS Time Reporting");
        rendered.HtmlBody.Should().Contain("https://trs.ucdavis.edu/");
        rendered.HtmlBody.Should().Contain("of 240 hrs");
        rendered.HtmlBody.Should().NotContain("<mjml");
    }

    [Fact]
    public async Task RenderAsync_sets_aggieservice_reply_to_for_faculty_employee_template_only()
    {
        var renderer = CreateRenderer();
        var facultyMessage = CreateEmployeeMessage(
            "accrual.employee.faculty-academic.v1",
            new AccrualEmployeeNotificationPayload
            {
                AccrualHoursPerMonth = 16m,
                BalanceHours = 384m,
                CapHours = 384m,
                Classification = "FY Faculty",
                EmployeeGroup = nameof(AccrualEmployeeGroup.FacultyAcademic),
                EmployeeId = "E001",
                EmployeeName = "Faculty Member",
                LostCostMonth = 1344m,
                PctOfCap = 100m,
                SnapshotAsOfDate = new DateTime(2026, 4, 30),
                Status = nameof(AccrualNotificationStatus.AtCap),
            },
            recipientName: "Faculty Member");

        var staffMessage = CreateEmployeeMessage(
            "accrual.employee.staff.v1",
            new AccrualEmployeeNotificationPayload
            {
                AccrualHoursPerMonth = 10m,
                BalanceHours = 236.9m,
                CapHours = 240m,
                Classification = "PSS",
                EmployeeGroup = nameof(AccrualEmployeeGroup.Staff),
                EmployeeId = "E002",
                EmployeeName = "Staff Member",
                LostCostMonth = 500m,
                PctOfCap = 98.7m,
                SnapshotAsOfDate = new DateTime(2026, 4, 30),
                Status = nameof(AccrualNotificationStatus.AtCap),
            },
            recipientName: "Staff Member");

        var facultyRendered = await renderer.RenderAsync(facultyMessage);
        var staffRendered = await renderer.RenderAsync(staffMessage);

        facultyRendered.ReplyToEmail.Should().Be("aggieservice@ucdavis.edu");
        facultyRendered.ReplyToName.Should().Be("AggieService");
        staffRendered.ReplyToEmail.Should().BeNull();
        staffRendered.ReplyToName.Should().BeNull();
    }

    [Fact]
    public async Task RenderAsync_html_encodes_employee_payload_values()
    {
        var renderer = CreateRenderer();
        var message = CreateEmployeeMessage(
            "accrual.employee.staff.v1",
            new AccrualEmployeeNotificationPayload
            {
                AccrualHoursPerMonth = 8m,
                BalanceHours = 200m,
                CapHours = 240m,
                Classification = "<script>alert('classification')</script>",
                Department = "PLANT <SCIENCES>",
                DepartmentCode = "030003",
                EmployeeAsOfDate = new DateTime(2026, 4, 30),
                EmployeeGroup = nameof(AccrualEmployeeGroup.Staff),
                EmployeeId = "E001",
                EmployeeName = "Employee <Unsafe>",
                PctOfCap = 83.3m,
                SnapshotAsOfDate = new DateTime(2026, 4, 30),
                Status = nameof(AccrualNotificationStatus.ApproachingCap),
            },
            recipientName: "Recipient <Unsafe>");

        var rendered = await renderer.RenderAsync(message);

        rendered.HtmlBody.Should().Contain("Recipient &lt;Unsafe&gt;");
        rendered.HtmlBody.Should().NotContain("Recipient <Unsafe>");
        rendered.HtmlBody.Should().NotContain("PLANT <SCIENCES>");
        rendered.HtmlBody.Should().NotContain("<script>alert('classification')</script>");
    }

    [Theory]
    [InlineData(
        "accrual.employee.faculty-academic.v1",
        nameof(AccrualEmployeeGroup.FacultyAcademic),
        "fiscal year academic appointee")]
    [InlineData(
        "accrual.employee.staff.v1",
        nameof(AccrualEmployeeGroup.Staff),
        "Open TRS Time Reporting")]
    public async Task RenderAsync_renders_each_employee_template_key(
        string templateKey,
        string employeeGroup,
        string expectedMessage)
    {
        var renderer = CreateRenderer();
        var message = CreateEmployeeMessage(
            templateKey,
            new AccrualEmployeeNotificationPayload
            {
                AccrualHoursPerMonth = 10m,
                BalanceHours = 220m,
                CapHours = 240m,
                Classification = employeeGroup,
                Department = "PLANT SCIENCES",
                DepartmentCode = "030003",
                EmployeeAsOfDate = new DateTime(2026, 4, 30),
                EmployeeGroup = employeeGroup,
                EmployeeId = "E001",
                EmployeeName = "Employee One",
                LostCostMonth = 500m,
                MonthsToCap = 2,
                PctOfCap = 91.7m,
                SnapshotAsOfDate = new DateTime(2026, 4, 30),
                Status = nameof(AccrualNotificationStatus.ApproachingCap),
            },
            recipientName: "Employee One");

        var rendered = await renderer.RenderAsync(message);

        rendered.Subject.Should().Be("Action Needed: Your Vacation Accrual is at 91.7% of Maximum");
        rendered.HtmlBody.Should().Contain(expectedMessage);
        rendered.TextBody.Should().Contain(expectedMessage);
    }

    [Fact]
    public async Task RenderAsync_renders_viewer_report_with_button_when_app_base_url_is_valid()
    {
        var renderer = CreateRenderer("https://walter.example.edu/root");
        var message = CreateViewerReportMessage(new AccrualViewerReportPayload
        {
            ApproachingCapCount = 3,
            AtCapCount = 2,
            DepartmentBreakdown =
            [
                new AccrualViewerReportDepartmentPayload
                {
                    ApproachingCapCount = 1,
                    AtCapCount = 2,
                    Department = "PLANT SCIENCES",
                    DepartmentCode = "030003",
                    Headcount = 4,
                    LostCostMonth = 1234.56m,
                    LostCostYtd = 4567.89m,
                },
                new AccrualViewerReportDepartmentPayload
                {
                    ApproachingCapCount = 2,
                    AtCapCount = 0,
                    Department = "NUTRITION",
                    DepartmentCode = "030090",
                    Headcount = 5,
                    LostCostMonth = 3456.78m,
                    LostCostYtd = 6789.01m,
                },
            ],
            LostCostMonth = 4691.34m,
            LostCostYtd = 11356.90m,
            SnapshotAsOfDate = new DateTime(2026, 4, 30),
            TotalDepartments = 2,
            TotalEmployees = 9,
            WasteRate = 12.3m,
            YtdMonthCount = 10,
        });

        var rendered = await renderer.RenderAsync(message);

        rendered.Subject.Should().Be("Monthly Vacation Accrual Report");
        rendered.TextBody.Should().Contain("Open report: https://walter.example.edu/root/accruals");
        rendered.HtmlBody.Should().Contain("Monthly Vacation Accrual Report");
        rendered.HtmlBody.Should().Contain("PLANT SCIENCES");
        rendered.HtmlBody.Should().Contain("$4,691");
        rendered.HtmlBody.Should().Contain("https://walter.example.edu/root/accruals");
        rendered.HtmlBody.Should().NotContain("<mjml");
    }

    [Fact]
    public async Task RenderAsync_omits_viewer_report_button_when_app_base_url_is_invalid()
    {
        var renderer = CreateRenderer("not-a-url");
        var message = CreateViewerReportMessage(new AccrualViewerReportPayload
        {
            SnapshotAsOfDate = new DateTime(2026, 4, 30),
        });

        var rendered = await renderer.RenderAsync(message);

        rendered.TextBody.Should().NotContain("Open report:");
        rendered.HtmlBody.Should().NotContain("Open Accrual Report");
    }

    [Fact]
    public async Task RenderAsync_fails_clearly_for_unsupported_template_key()
    {
        var renderer = CreateRenderer();
        var message = CreateViewerReportMessage(new AccrualViewerReportPayload
        {
            SnapshotAsOfDate = new DateTime(2026, 4, 30),
        });
        message.TemplateKey = "unknown.template";

        var act = () => renderer.RenderAsync(message);

        await act.Should()
            .ThrowAsync<InvalidOperationException>()
            .WithMessage("Unsupported outbound message template key 'unknown.template'.");
    }

    [Fact]
    public async Task RenderAsync_fails_clearly_for_unsupported_payload_version()
    {
        var renderer = CreateRenderer();
        var message = CreateViewerReportMessage(new AccrualViewerReportPayload
        {
            SnapshotAsOfDate = new DateTime(2026, 4, 30),
        });
        message.PayloadVersion = 2;

        var act = () => renderer.RenderAsync(message);

        await act.Should()
            .ThrowAsync<InvalidOperationException>()
            .WithMessage("Unsupported payload version '2' for template 'accrual.viewer-report.v1'.");
    }

    private static AccrualOutboundMessageRenderer CreateRenderer(string? appBaseUrl = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<MjmlRenderer>();
        services.AddRazorTemplating();
        services.AddScoped<INotificationRenderer, RazorMjmlNotificationRenderer>();
        services.AddOptions<AppOptions>().Configure(options =>
        {
            options.BaseUrl = appBaseUrl;
        });

        var provider = services.BuildServiceProvider();
        var notificationRenderer = provider.GetRequiredService<INotificationRenderer>();
        var options = provider.GetRequiredService<IOptions<AppOptions>>();
        return new AccrualOutboundMessageRenderer(notificationRenderer, options);
    }

    private static OutboundMessage CreateEmployeeMessage(
        string templateKey,
        AccrualEmployeeNotificationPayload payload,
        string recipientName = "Staff Member")
    {
        return new OutboundMessage
        {
            Channel = OutboundMessage.Channels.Email,
            CreatedUtc = new DateTime(2026, 5, 1, 12, 0, 0, DateTimeKind.Utc),
            DedupeKey = "accrual:employee:E001:2026-04-30",
            Id = 1,
            NotBeforeUtc = new DateTime(2026, 5, 1, 12, 0, 0, DateTimeKind.Utc),
            NotificationType = AccrualNotificationMessageBuilder.EmployeeNotificationType,
            PayloadJson = JsonSerializer.Serialize(payload, JsonOptions),
            PayloadVersion = 1,
            RecipientEmail = "employee@example.com",
            RecipientName = recipientName,
            RecipientType = OutboundMessage.RecipientTypes.Employee,
            RunId = Guid.NewGuid(),
            Status = OutboundMessage.Statuses.Pending,
            TemplateKey = templateKey,
            TemplateVersion = 1,
        };
    }

    private static OutboundMessage CreateViewerReportMessage(AccrualViewerReportPayload payload)
    {
        return new OutboundMessage
        {
            Channel = OutboundMessage.Channels.Email,
            CreatedUtc = new DateTime(2026, 5, 1, 12, 0, 0, DateTimeKind.Utc),
            DedupeKey = "accrual:viewer-report:user:2026-04-30",
            Id = 2,
            NotBeforeUtc = new DateTime(2026, 5, 1, 12, 0, 0, DateTimeKind.Utc),
            NotificationType = AccrualNotificationMessageBuilder.ViewerReportNotificationType,
            PayloadJson = JsonSerializer.Serialize(payload, JsonOptions),
            PayloadVersion = 1,
            RecipientEmail = "viewer@example.com",
            RecipientName = "Viewer Person",
            RecipientType = OutboundMessage.RecipientTypes.AccrualViewer,
            RunId = Guid.NewGuid(),
            Status = OutboundMessage.Statuses.Pending,
            TemplateKey = AccrualNotificationMessageBuilder.ViewerReportTemplateKey,
            TemplateVersion = 1,
        };
    }
}
