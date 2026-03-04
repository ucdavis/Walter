using System.Security.Claims;
using AggieEnterpriseApi;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Server.Controllers;
using Server.Services;
using server.Helpers;
using server.Models;
using server.Services;
using Server.Tests;
using server.core.Data;

namespace server.tests.Controllers;

public sealed class ProjectControllerTests
{
    [Fact]
    public async Task GetManagedFaculty_returns_empty_array_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new FakeWebHostEnvironment(),
            new ThrowingFinancialApiService(),
            new ThrowingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetManagedFaculty("1000", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        ok.Value.Should().BeAssignableTo<IEnumerable<object>>().Which.Should().BeEmpty();
    }

    private static IAuthorizationService CreateAuthorizationService()
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddDebug().SetMinimumLevel(LogLevel.Trace));
        services.AddAuthorizationPolicies();
        var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IAuthorizationService>();
    }

    private static ClaimsPrincipal CreateUser(IReadOnlyList<string> roles)
    {
        var claims = roles.Select(r => new Claim(ClaimTypes.Role, r)).ToList();
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        return new ClaimsPrincipal(identity);
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

    private sealed class ThrowingFinancialApiService : IFinancialApiService
    {
        public IAggieEnterpriseClient GetClient()
        {
            throw new InvalidOperationException("Financial API should not be called for unauthorized users.");
        }
    }

    private sealed class ThrowingDatamartService : IDatamartService
    {
        public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }
    }
}
