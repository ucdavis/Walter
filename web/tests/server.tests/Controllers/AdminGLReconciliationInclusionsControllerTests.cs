using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Web;
using Server.Controllers;
using server.core.Data;
using server.core.Services;
using Server.Tests;

namespace server.tests.Controllers;

public sealed class AdminGLReconciliationInclusionsControllerTests
{
    [Fact]
    public async Task GetInclusions_returns_empty_list_initially()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx);

        var result = await controller.GetInclusions(CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().BeEquivalentTo(Array.Empty<object>());
    }

    [Fact]
    public async Task AddInclusion_returns_created_entry()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var userId = Guid.NewGuid();
        var controller = CreateController(ctx, userId);

        var result = await controller.AddInclusion(
            new AdminGLReconciliationInclusionsController.AddInclusionRequest("173421", "test note"),
            CancellationToken.None);

        var statusResult = result.Should().BeOfType<ObjectResult>().Which;
        statusResult.StatusCode.Should().Be(201);
        var inclusion = statusResult.Value.Should().BeAssignableTo<server.core.Domain.GLReconciliationInclusion>().Which;
        inclusion.AccountingSequenceNumber.Should().Be("173421");
        inclusion.Note.Should().Be("test note");
        inclusion.CreatedBy.Should().Be(userId.ToString());
    }

    [Fact]
    public async Task AddInclusion_returns_400_for_non_numeric_asn()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx);

        var result = await controller.AddInclusion(
            new AdminGLReconciliationInclusionsController.AddInclusionRequest("NOTANUMBER", null),
            CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AddInclusion_returns_409_for_duplicate()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx);

        await controller.AddInclusion(
            new AdminGLReconciliationInclusionsController.AddInclusionRequest("173421", null),
            CancellationToken.None);

        var result = await controller.AddInclusion(
            new AdminGLReconciliationInclusionsController.AddInclusionRequest("173421", null),
            CancellationToken.None);

        result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task RemoveInclusion_returns_204_when_found()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx);

        await controller.AddInclusion(
            new AdminGLReconciliationInclusionsController.AddInclusionRequest("173421", null),
            CancellationToken.None);

        var result = await controller.RemoveInclusion("173421", CancellationToken.None);

        result.Should().BeOfType<NoContentResult>();
        ctx.GLReconciliationInclusions.Should().BeEmpty();
    }

    [Fact]
    public async Task RemoveInclusion_returns_404_when_not_found()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var controller = CreateController(ctx);

        var result = await controller.RemoveInclusion("999999", CancellationToken.None);

        result.Should().BeOfType<NotFoundResult>();
    }

    private static AdminGLReconciliationInclusionsController CreateController(
        AppDbContext ctx, Guid? userId = null)
    {
        var service = new GLReconciliationInclusionsService(ctx);
        var controller = new AdminGLReconciliationInclusionsController(service);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = CreateUser(userId ?? Guid.NewGuid()),
            },
        };

        return controller;
    }

    private static ClaimsPrincipal CreateUser(Guid userId)
    {
        var claims = new List<Claim>
        {
            new(ClaimConstants.ObjectId, userId.ToString()),
        };
        return new ClaimsPrincipal(new ClaimsIdentity(claims, authenticationType: "Test"));
    }
}
