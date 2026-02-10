using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using Server.Controllers;
using Server.Tests;
using server.Helpers;
using server.core.Data;

namespace server.tests.Controllers;

public sealed class SearchControllerTests
{
    [Fact]
    public async Task GetCatalog_excludes_accruals_report_when_not_authorized()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(ctx, authorizationService, roles: []);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().NotContain("accruals");
    }

    [Fact]
    public async Task GetCatalog_includes_accruals_report_when_user_has_accrual_viewer_role()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(ctx, authorizationService, roles: [server.core.Domain.Role.Names.AccrualViewer]);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().Contain("accruals");
    }

    [Fact]
    public async Task GetCatalog_includes_accruals_report_when_user_is_admin()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = CreateController(ctx, authorizationService, roles: [server.core.Domain.Role.Names.Admin]);

        var result = await controller.GetCatalog(CancellationToken.None);

        var catalog = result.Should().BeOfType<OkObjectResult>().Which.Value
            .Should().BeOfType<SearchController.SearchCatalog>().Which;

        catalog.Reports.Select(r => r.Id).Should().Contain("accruals");
    }

    private static IAuthorizationService CreateAuthorizationService()
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddDebug().SetMinimumLevel(LogLevel.Trace));
        services.AddAuthorizationPolicies();
        var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IAuthorizationService>();
    }

    private static SearchController CreateController(
        AppDbContext ctx,
        IAuthorizationService authorizationService,
        IReadOnlyList<string> roles)
    {
        var httpContext = new DefaultHttpContext
        {
            User = CreateUser(roles),
        };

        return new SearchController(
            new FakeWebHostEnvironment(),
            ctx,
            new FakeFinancialApiService(),
            authorizationService)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private sealed class FakeWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "server.tests";
        public IFileProvider WebRootFileProvider { get; set; } = null!;
        public string WebRootPath { get; set; } = "";
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private sealed class FakeFinancialApiService : server.Services.IFinancialApiService
    {
        public AggieEnterpriseApi.IAggieEnterpriseClient GetClient()
        {
            throw new NotImplementedException("Not needed for GetCatalog tests.");
        }
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
    }
}
