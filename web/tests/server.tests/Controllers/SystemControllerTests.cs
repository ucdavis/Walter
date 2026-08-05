using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;
using Server.Controllers;
using Server.Services;
using Server.Tests;
using server.Helpers;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;

namespace server.tests.Controllers;

public class SystemControllerTests
{
    [Fact]
    public void GetRumConfig_returns_public_config_with_defaults()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var rumOptions = new RumOptions
        {
            Enabled = true,
            ServerUrl = "https://elastic.example",
        };

        var (controller, _) = CreateController(ctx, rumOptions, Environments.Development);
        controller.ControllerContext.HttpContext.Request.Scheme = "https";
        controller.ControllerContext.HttpContext.Request.Host = new HostString("walter.local");

        var result = controller.GetRumConfig();

        result.Result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().BeEquivalentTo(new
            {
                Enabled = true,
                Environment = Environments.Development,
                ServerUrl = "https://elastic.example",
                ServiceName = "walter-web",
                ServiceVersion = AppVersionHelper.ResolveServiceVersion(),
                TransactionSampleRate = 1d,
            });
    }

    [Fact]
    public void GetRumConfig_clamps_and_parses_sample_rate_and_uses_configured_origins()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var rumOptions = new RumOptions
        {
            Enabled = true,
            Environment = "staging",
            ServerUrl = "https://elastic.example",
            ServiceName = "walter-rum",
            ServiceVersion = "9.9.9",
            TransactionSampleRate = "1.5",
        };

        var (controller, _) = CreateController(ctx, rumOptions, Environments.Production);
        controller.ControllerContext.HttpContext.Request.Scheme = "https";
        controller.ControllerContext.HttpContext.Request.Host = new HostString("walter.example");

        var result = controller.GetRumConfig();

        result.Result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().BeEquivalentTo(new
            {
                Enabled = true,
                Environment = "staging",
                ServerUrl = "https://elastic.example",
                ServiceName = "walter-rum",
                ServiceVersion = "9.9.9",
                TransactionSampleRate = 1d,
            });
    }

    [Fact]
    public void GetRumConfig_disables_payload_when_server_url_is_missing_and_falls_back_for_invalid_sample_rate()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var rumOptions = new RumOptions
        {
            Enabled = true,
            TransactionSampleRate = "not-a-number",
        };

        var (controller, _) = CreateController(ctx, rumOptions, Environments.Production);
        controller.ControllerContext.HttpContext.Request.Scheme = "https";
        controller.ControllerContext.HttpContext.Request.Host = new HostString("walter.example");

        var result = controller.GetRumConfig();

        result.Result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().BeEquivalentTo(new
            {
                Enabled = false,
                Environment = Environments.Production,
                ServerUrl = string.Empty,
                ServiceName = "walter-web",
                ServiceVersion = AppVersionHelper.ResolveServiceVersion(),
                TransactionSampleRate = 0.2d,
            });
    }

    [Fact]
    public void GetRumConfig_falls_back_when_sample_rate_is_nan()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var rumOptions = new RumOptions
        {
            Enabled = true,
            ServerUrl = "https://elastic.example",
            TransactionSampleRate = "NaN",
        };

        var (controller, _) = CreateController(ctx, rumOptions, Environments.Production);
        controller.ControllerContext.HttpContext.Request.Scheme = "https";
        controller.ControllerContext.HttpContext.Request.Host = new HostString("walter.example");

        var result = controller.GetRumConfig();

        result.Result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().BeEquivalentTo(new
            {
                Enabled = true,
                Environment = Environments.Production,
                ServerUrl = "https://elastic.example",
                ServiceName = "walter-web",
                ServiceVersion = AppVersionHelper.ResolveServiceVersion(),
                TransactionSampleRate = 0.2d,
            });
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(false, false)]
    public void GetFeatures_reflects_the_configured_flags(bool burndownEnabled, bool expenditureProgressEnabled)
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var (controller, _) = CreateController(
            ctx,
            featureFlags: new FeatureFlagOptions
            {
                BurndownEnabled = burndownEnabled,
                ExpenditureProgressEnabled = expenditureProgressEnabled,
            });

        var result = controller.GetFeatures();

        result.Result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().BeEquivalentTo(new ClientFeatures(burndownEnabled, expenditureProgressEnabled));
    }

    [Fact]
    public async Task Emulate_accepts_guid_identifier()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "jdoe",
            IamId = "123456789",
            EmployeeId = "E12345",
            DisplayName = "John Doe",
            Email = "jdoe@example.com",
        };

        var role = new Role { Name = "TestRole" };

        ctx.Users.Add(user);
        ctx.Roles.Add(role);
        await ctx.SaveChangesAsync();

        ctx.Permissions.Add(new Permission { UserId = user.Id, RoleId = role.Id });
        await ctx.SaveChangesAsync();

        var (controller, auth) = CreateController(ctx);

        var result = await controller.Emulate(user.Id.ToString());

        result.Should().BeOfType<RedirectResult>().Which.Url.Should().Be("/");
        auth.SignedInScheme.Should().Be(CookieAuthenticationDefaults.AuthenticationScheme);

        auth.SignedInPrincipal.Should().NotBeNull();
        auth.SignedInPrincipal!.FindFirst(ClaimConstants.ObjectId)!.Value.Should().Be(user.Id.ToString());
        auth.SignedInPrincipal.FindFirst(ClaimTypes.Name)!.Value.Should().Be(user.DisplayName);
        auth.SignedInPrincipal.FindFirst(ClaimTypes.Email)!.Value.Should().Be(user.Email);
        auth.SignedInPrincipal.FindFirst("kerberos")!.Value.Should().Be(user.Kerberos);
        auth.SignedInPrincipal.FindAll(ClaimTypes.Role).Select(c => c.Value).Should().Contain(role.Name);
    }

    [Fact]
    public async Task Emulate_accepts_employeeId_identifier()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "jdoe",
            IamId = "123456789",
            EmployeeId = "E12345",
            DisplayName = "John Doe",
            Email = "jdoe@example.com",
        };

        var role = new Role { Name = "TestRole" };

        ctx.Users.Add(user);
        ctx.Roles.Add(role);
        await ctx.SaveChangesAsync();

        ctx.Permissions.Add(new Permission { UserId = user.Id, RoleId = role.Id });
        await ctx.SaveChangesAsync();

        var (controller, auth) = CreateController(ctx);

        var result = await controller.Emulate(user.EmployeeId);

        result.Should().BeOfType<RedirectResult>().Which.Url.Should().Be("/");
        auth.SignedInScheme.Should().Be(CookieAuthenticationDefaults.AuthenticationScheme);

        auth.SignedInPrincipal.Should().NotBeNull();
        auth.SignedInPrincipal!.FindFirst(ClaimConstants.ObjectId)!.Value.Should().Be(user.Id.ToString());
    }

    [Fact]
    public async Task Emulate_returns_not_found_when_missing_guid_user_cannot_be_provisioned()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var targetUserId = Guid.NewGuid();
        var graphService = new FakeGraphService();
        var profileOrchestrator = new FakeUserProfileOrchestrator(ctx);
        var (controller, _) = CreateController(
            ctx,
            graphService: graphService,
            profileOrchestrator: profileOrchestrator);

        var result = await controller.Emulate(targetUserId.ToString());

        result.Should().BeOfType<NotFoundObjectResult>();
        graphService.GetByIdCallCount.Should().Be(1);
        profileOrchestrator.CallCount.Should().Be(0);
    }

    [Fact]
    public async Task Emulate_provisions_missing_guid_user()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var targetUserId = Guid.NewGuid();
        var graphService = new FakeGraphService(
            new GraphUserProfile(targetUserId.ToString(), "Never Logged In", "new@example.com", "IAM-NEW"));
        var profileOrchestrator = new FakeUserProfileOrchestrator(ctx);
        var (controller, auth) = CreateController(
            ctx,
            graphService: graphService,
            profileOrchestrator: profileOrchestrator);

        var result = await controller.Emulate(targetUserId.ToString());

        result.Should().BeOfType<RedirectResult>().Which.Url.Should().Be("/");
        graphService.GetByIdCallCount.Should().Be(1);
        profileOrchestrator.CallCount.Should().Be(1);
        profileOrchestrator.Principal!.FindFirst(server.Helpers.ClaimsPrincipalExtensions.IamIdClaimType)!
            .Value.Should().Be("IAM-NEW");
        auth.SignedInPrincipal!.FindFirst(ClaimConstants.ObjectId)!.Value.Should().Be(targetUserId.ToString());
        (await ctx.Users.SingleAsync()).Id.Should().Be(targetUserId);
    }

    [Fact]
    public async Task Emulate_provisions_missing_employee_id_user()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var targetUserId = Guid.NewGuid();
        var person = new SearchablePersonRecord
        {
            IamId = "IAM-EMP",
            EmployeeId = "E54321",
            Name = "Employee Target",
            Email = "employee@example.com",
        };
        var datamartService = new FakeDatamartService(person);
        var graphService = new FakeGraphService(
            new GraphUserProfile(targetUserId.ToString(), person.Name, person.Email, IamId: null));
        var profileOrchestrator = new FakeUserProfileOrchestrator(ctx, employeeId: person.EmployeeId);
        var (controller, auth) = CreateController(
            ctx,
            graphService: graphService,
            datamartService: datamartService,
            profileOrchestrator: profileOrchestrator);

        var result = await controller.Emulate(person.EmployeeId);

        result.Should().BeOfType<RedirectResult>().Which.Url.Should().Be("/");
        datamartService.GetByEmployeeIdCallCount.Should().Be(1);
        graphService.FindByEmailCallCount.Should().Be(1);
        profileOrchestrator.Principal!.FindFirst(server.Helpers.ClaimsPrincipalExtensions.IamIdClaimType)!
            .Value.Should().Be(person.IamId);
        auth.SignedInPrincipal!.FindFirst(ClaimConstants.ObjectId)!.Value.Should().Be(targetUserId.ToString());
    }

    private static (SystemController Controller, FakeAuthenticationService Auth) CreateController(
        AppDbContext ctx,
        RumOptions? rumOptions = null,
        string environmentName = "Development",
        FeatureFlagOptions? featureFlags = null,
        IGraphService? graphService = null,
        IDatamartService? datamartService = null,
        IUserProfileOrchestrator? profileOrchestrator = null)
    {
        var auth = new FakeAuthenticationService();

        var services = new ServiceCollection();
        services.AddSingleton<IAuthenticationService>(auth);
        var sp = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = sp };

        var userService = new UserService(NullLogger<UserService>.Instance, ctx);
        var controller = new SystemController(
            userService,
            graphService ?? new FakeGraphService(),
            datamartService ?? new FakeDatamartService(),
            profileOrchestrator ?? new FakeUserProfileOrchestrator(ctx),
            Options.Create(rumOptions ?? new RumOptions()),
            Options.Create(featureFlags ?? new FeatureFlagOptions()),
            new FakeHostEnvironment { EnvironmentName = environmentName })
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };

        return (controller, auth);
    }

    private sealed class FakeGraphService : IGraphService
    {
        private readonly GraphUserProfile? _profile;

        public FakeGraphService(GraphUserProfile? profile = null)
        {
            _profile = profile;
        }

        public int GetByIdCallCount { get; private set; }
        public int FindByEmailCallCount { get; private set; }

        public Task<GraphUserPhoto?> GetMePhotoAsync(
            ClaimsPrincipal principal,
            CancellationToken cancellationToken = default)
            => throw new NotImplementedException();

        public Task<IReadOnlyList<GraphUserSearchResult>> SearchUsersAsync(
            ClaimsPrincipal principal,
            string query,
            CancellationToken cancellationToken = default)
            => throw new NotImplementedException();

        public Task<GraphUserProfile?> FindUserByEmailAsync(
            ClaimsPrincipal principal,
            string email,
            CancellationToken cancellationToken = default)
        {
            FindByEmailCallCount++;
            return Task.FromResult(
                string.Equals(_profile?.Email, email, StringComparison.OrdinalIgnoreCase) ? _profile : null);
        }

        public Task<GraphUserProfile?> GetUserProfileAsync(
            ClaimsPrincipal principal,
            string userObjectId,
            CancellationToken cancellationToken = default)
        {
            GetByIdCallCount++;
            return Task.FromResult(
                string.Equals(_profile?.Id, userObjectId, StringComparison.OrdinalIgnoreCase) ? _profile : null);
        }
    }

    private sealed class FakeDatamartService : IDatamartService
    {
        private readonly SearchablePersonRecord? _person;

        public FakeDatamartService(SearchablePersonRecord? person = null)
        {
            _person = person;
        }

        public int GetByEmployeeIdCallCount { get; private set; }

        public Task<IReadOnlyList<SearchablePersonRecord>> SearchPeopleAsync(
            string query,
            int limit,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<SearchablePersonRecord?> GetSearchablePersonByIamIdAsync(
            string iamId,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmployeeIdAsync(
            string employeeId,
            CancellationToken ct = default)
        {
            GetByEmployeeIdCallCount++;
            return Task.FromResult(
                string.Equals(_person?.EmployeeId, employeeId, StringComparison.OrdinalIgnoreCase) ? _person : null);
        }

        public Task<IReadOnlyList<SearchablePersonRecord>> GetSearchablePeopleByEmployeeIdsAsync(
            IEnumerable<string> employeeIds,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<SearchablePersonRecord?> GetSearchablePersonByEmailAsync(
            string email,
            CancellationToken ct = default)
        {
            return Task.FromResult(
                string.Equals(_person?.Email, email, StringComparison.OrdinalIgnoreCase) ? _person : null);
        }

        public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
            DateTime startDate,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<IReadOnlyList<FacultyPortfolioRecord>> GetFacultyPortfolioAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<IReadOnlyList<PositionBudgetRecord>> GetPositionBudgetsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<IReadOnlyList<GLPPMReconciliationRecord>> GetGLPPMReconciliationAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<IReadOnlyList<GLTransactionRecord>> GetGLTransactionListingsAsync(
            IEnumerable<string> projectNumbers,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<ProjectProjectionResult> GetProjectProjectionAsync(
            string projectNumber,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<IReadOnlyList<DepartmentBalanceRow>> GetGlBalanceSummaryAsync(
            DepartmentBalancesQuery query,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();

        public Task<IReadOnlyList<DepartmentBalanceOption>> GetGlBalanceFilterOptionsAsync(
            DepartmentBalancesOptionsQuery query,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
            => throw new NotImplementedException();
    }

    private sealed class FakeUserProfileOrchestrator : IUserProfileOrchestrator
    {
        private readonly AppDbContext _dbContext;
        private readonly string _employeeId;

        public FakeUserProfileOrchestrator(AppDbContext dbContext, string employeeId = "E12345")
        {
            _dbContext = dbContext;
            _employeeId = employeeId;
        }

        public int CallCount { get; private set; }
        public ClaimsPrincipal? Principal { get; private set; }

        public async Task<UserProfileData> EnsureUserProfileAsync(
            Guid userId,
            string userObjectId,
            ClaimsPrincipal principal,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            Principal = principal;

            var profile = new UserProfileData
            {
                UserId = userId,
                Kerberos = "provisioned",
                IamId = principal.FindFirst(server.Helpers.ClaimsPrincipalExtensions.IamIdClaimType)!.Value,
                EmployeeId = _employeeId,
                DisplayName = "Provisioned User",
                Email = principal.FindFirst("preferred_username")?.Value,
            };

            var userService = new UserService(NullLogger<UserService>.Instance, _dbContext);
            await userService.CreateOrUpdateUserAsync(profile, cancellationToken);
            return profile;
        }
    }

    private sealed class FakeAuthenticationService : IAuthenticationService
    {
        public string? SignedInScheme { get; private set; }
        public ClaimsPrincipal? SignedInPrincipal { get; private set; }
        public bool SignedOut { get; private set; }

        public Task<AuthenticateResult> AuthenticateAsync(HttpContext context, string? scheme)
        {
            throw new NotImplementedException();
        }

        public Task ChallengeAsync(HttpContext context, string? scheme, AuthenticationProperties? properties)
        {
            throw new NotImplementedException();
        }

        public Task ForbidAsync(HttpContext context, string? scheme, AuthenticationProperties? properties)
        {
            throw new NotImplementedException();
        }

        public Task SignInAsync(
            HttpContext context,
            string? scheme,
            ClaimsPrincipal principal,
            AuthenticationProperties? properties)
        {
            SignedInScheme = scheme;
            SignedInPrincipal = principal;
            return Task.CompletedTask;
        }

        public Task SignOutAsync(HttpContext context, string? scheme, AuthenticationProperties? properties)
        {
            SignedOut = true;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "server.tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            null!;
    }
}
