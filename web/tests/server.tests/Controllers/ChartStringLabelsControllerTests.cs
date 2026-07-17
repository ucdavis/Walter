using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Server.Controllers;
using Server.Tests;
using server.core.Data;
using server.core.Domain;

namespace server.tests.Controllers;

public sealed class ChartStringLabelsControllerTests
{
    [Fact]
    public async Task Upsert_rejects_all_empty_segments()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        var result = await controller.UpsertAsync(
            new ChartStringLabelsController.UpsertLabelRequest(null, "", "  ", null, null, null, "some text"),
            CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
        ctx.ChartStringLabels.Should().BeEmpty();
    }

    [Fact]
    public async Task Upsert_creates_then_updates_then_deletes()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        var create = await controller.UpsertAsync(
            new ChartStringLabelsController.UpsertLabelRequest(null, "13U00", null, null, null, null, "summer employment 2026"),
            CancellationToken.None);
        create.Should().BeOfType<OkObjectResult>();
        ctx.ChartStringLabels.Should().ContainSingle(l => l.Fund == "13U00" && l.Text == "summer employment 2026");

        var update = await controller.UpsertAsync(
            new ChartStringLabelsController.UpsertLabelRequest(null, "13U00", null, null, null, null, "updated"),
            CancellationToken.None);
        update.Should().BeOfType<OkObjectResult>();
        ctx.ChartStringLabels.Should().ContainSingle(l => l.Fund == "13U00" && l.Text == "updated");

        var delete = await controller.UpsertAsync(
            new ChartStringLabelsController.UpsertLabelRequest(null, "13U00", null, null, null, null, "  "),
            CancellationToken.None);
        delete.Should().BeOfType<NoContentResult>();
        ctx.ChartStringLabels.Should().BeEmpty();
    }

    [Fact]
    public async Task Upsert_treats_different_segment_combinations_as_distinct()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);

        await controller.UpsertAsync(
            new ChartStringLabelsController.UpsertLabelRequest(null, "13U00", null, null, null, null, "fund only"),
            CancellationToken.None);
        await controller.UpsertAsync(
            new ChartStringLabelsController.UpsertLabelRequest("ADNO001", "13U00", null, null, null, null, "dept and fund"),
            CancellationToken.None);

        ctx.ChartStringLabels.Should().HaveCount(2);
    }

    [Fact]
    public async Task Get_returns_the_shared_layer()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var controller = MakeController(ctx);
        await controller.UpsertAsync(
            new ChartStringLabelsController.UpsertLabelRequest(null, "13U00", null, null, null, null, "summer employment 2026"),
            CancellationToken.None);

        var result = await controller.GetAsync(CancellationToken.None);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Which;
        var labels = ok.Value.Should().BeAssignableTo<IReadOnlyList<ChartStringLabelsController.LabelResponse>>().Which;
        labels.Should().ContainSingle(l => l.Fund == "13U00" && l.Text == "summer employment 2026");
    }

    private static ChartStringLabelsController MakeController(AppDbContext ctx)
    {
        return new ChartStringLabelsController(ctx)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: [Role.Names.DepartmentViewer]),
                },
            },
        };
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
    }
}
