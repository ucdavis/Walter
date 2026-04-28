using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Controllers;
using Server.Tests;
using server.core.Data;
using server.core.Domain;

namespace server.tests.Controllers;

public sealed class NotificationControllerTests
{
    [Fact]
    public async Task Get_returns_seeded_singleton_disabled_by_default()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var controller = new NotificationController(ctx);

        var result = await controller.Get(CancellationToken.None);

        var payload = result.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<NotificationController.NotificationResponse>().Which;

        payload.Enabled.Should().BeFalse();
        payload.Message.Should().Be("");
    }

    [Fact]
    public async Task Get_returns_persisted_message()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var seed = await ctx.Notifications.SingleAsync(n => n.Id == Notification.SingletonId);
        seed.Enabled = true;
        seed.Message = "Heads up";
        seed.UpdatedOn = new DateTime(2026, 4, 1, 12, 0, 0, DateTimeKind.Utc);
        await ctx.SaveChangesAsync();

        var controller = new NotificationController(ctx);

        var result = await controller.Get(CancellationToken.None);

        var payload = result.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<NotificationController.NotificationResponse>().Which;

        payload.Enabled.Should().BeTrue();
        payload.Message.Should().Be("Heads up");
        payload.UpdatedOn.Should().Be(new DateTime(2026, 4, 1, 12, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public async Task Update_persists_message_and_stamps_audit_fields()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var controller = CreateController(ctx, identityName: "admin@ucdavis.edu");

        var before = DateTime.UtcNow;

        var result = await controller.Update(
            new NotificationController.UpdateNotificationRequest(true, "Hello world"),
            CancellationToken.None);

        var payload = result.Result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<NotificationController.NotificationResponse>().Which;

        payload.Enabled.Should().BeTrue();
        payload.Message.Should().Be("Hello world");

        var saved = ctx.Notifications.Single(n => n.Id == Notification.SingletonId);
        saved.Enabled.Should().BeTrue();
        saved.Message.Should().Be("Hello world");
        saved.UpdatedBy.Should().Be("admin@ucdavis.edu");
        saved.UpdatedOn.Should().BeOnOrAfter(before);
    }

    [Fact]
    public async Task Update_rejects_message_above_max_length()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var controller = CreateController(ctx, identityName: "admin@ucdavis.edu");

        var result = await controller.Update(
            new NotificationController.UpdateNotificationRequest(true, new string('x', 2001)),
            CancellationToken.None);

        result.Result.Should().BeOfType<BadRequestObjectResult>();

        var saved = ctx.Notifications.Single(n => n.Id == Notification.SingletonId);
        saved.Enabled.Should().BeFalse();
        saved.Message.Should().Be("");
    }

    private static NotificationController CreateController(AppDbContext ctx, string identityName)
    {
        var controller = new NotificationController(ctx);
        var identity = new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.Name, identityName) },
            authenticationType: "Test");
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) },
        };
        return controller;
    }
}
