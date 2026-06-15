using System.Security.Claims;
using AggieEnterpriseApi;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Server.Controllers;
using Server.Services;
using server.core.Models;
using server.core.Services;
using server.Helpers;
using server.Services;
using Server.Tests;
using server.core.Data;
using server.core.Domain;

namespace server.tests.Controllers;

public sealed class ProjectControllerTests
{
    [Fact]
    public async Task GetManagedFaculty_returns_empty_array_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ThrowingFinancialApiService(),
            new ResolvingDatamartService(
                new SearchablePersonRecord
                {
                    IamId = "IAM-PM",
                    EmployeeId = "1000",
                    Name = "Project Manager",
                }),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new EmptyGLInclusionsService())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetManagedFaculty("IAM-PM", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        var envelope = ok.Value.Should().BeOfType<ProjectController.ManagedPisEnvelope>().Which;
        envelope.ProjectManager.Should().BeNull();
        envelope.Pis.Should().BeEmpty();
    }

    [Fact]
    public async Task GetByIamId_returns_forbid_for_unknown_iam_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ThrowingFinancialApiService(),
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new EmptyGLInclusionsService())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetByIamIdAsync("UNKNOWN-IAM", CancellationToken.None);

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetPersonnelForProjects_returns_forbid_for_unknown_iam_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ThrowingFinancialApiService(),
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new EmptyGLInclusionsService())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetPersonnelForProjects(
            CancellationToken.None,
            iamId: "UNKNOWN-IAM",
            projectCodes: "PROJ-001");

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetManagedFaculty_returns_empty_array_for_unknown_iam_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ThrowingFinancialApiService(),
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx),
            new EmptyGLInclusionsService())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetManagedFaculty("UNKNOWN-IAM", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        var envelope = ok.Value.Should().BeOfType<ProjectController.ManagedPisEnvelope>().Which;
        envelope.ProjectManager.Should().BeNull();
        envelope.Pis.Should().BeEmpty();
    }

    [Fact]
    public void Project_routes_do_not_expose_employee_id_lookup_contracts()
    {
        var templates = typeof(ProjectController)
            .GetMethods()
            .SelectMany(method => method.GetCustomAttributes(typeof(HttpGetAttribute), inherit: false))
            .Cast<HttpGetAttribute>()
            .Select(attribute => attribute.Template)
            .Where(template => template is not null)
            .Select(template => template!)
            .ToArray();

        templates.Should().Contain("by-iam/{iamId}");
        templates.Should().Contain("managed/by-iam/{iamId}");
        templates.Should().OnlyContain(template =>
            !template.Contains("employeeId", StringComparison.OrdinalIgnoreCase));
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

    private sealed class EmptyGLInclusionsService : IGLReconciliationInclusionsService
    {
        public Task<IReadOnlyList<GLReconciliationInclusion>> GetInclusionsAsync(CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<GLReconciliationInclusion>>(Array.Empty<GLReconciliationInclusion>());

        public Task<GLReconciliationInclusion> AddInclusionAsync(string asn, string? note, string createdBy, CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<bool> RemoveInclusionAsync(string asn, CancellationToken ct = default)
            => throw new NotImplementedException();
    }

    private sealed class ThrowingFinancialApiService : IFinancialApiService
    {
        public IAggieEnterpriseClient GetClient()
        {
            throw new InvalidOperationException("Financial API should not be called for unauthorized users.");
        }
    }

    private sealed class ResolvingDatamartService : IDatamartService
    {
        private readonly SearchablePersonRecord? _person;

        public ResolvingDatamartService(SearchablePersonRecord? person = null)
        {
            _person = person;
        }

        public Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(
            string query,
            int limit,
            CancellationToken ct = default)
        {
            return Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(Array.Empty<SearchablePersonRecord>());
        }

        public Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(
            string iamId,
            CancellationToken ct = default)
        {
            return Task.FromResult(_person is not null &&
                string.Equals(iamId, _person.IamId, StringComparison.OrdinalIgnoreCase)
                ? _person
                : null);
        }

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(
            string employeeId,
            CancellationToken ct = default)
        {
            return Task.FromResult(_person is not null &&
                string.Equals(employeeId, _person.EmployeeId, StringComparison.OrdinalIgnoreCase)
                ? _person
                : null);
        }

        public Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(
            IEnumerable<string> employeeIds,
            CancellationToken ct = default)
        {
            return Task.FromResult<IReadOnlyList<SearchablePersonRecord>>(
                _person is not null && employeeIds.Contains(_person.EmployeeId, StringComparer.OrdinalIgnoreCase)
                    ? new[] { _person }
                    : Array.Empty<SearchablePersonRecord>());
        }

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(
            string email,
            CancellationToken ct = default)
        {
            return Task.FromResult<SearchablePersonRecord?>(null);
        }

        public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
            DateTime startDate,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            IEnumerable<string>? includedAsns = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }

        public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            IEnumerable<string>? includedAsns = null,
            CancellationToken ct = default)
        {
            throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }
    }
}
