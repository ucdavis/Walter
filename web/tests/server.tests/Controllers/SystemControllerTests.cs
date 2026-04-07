using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
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

    private static (SystemController Controller, FakeAuthenticationService Auth) CreateController(
        AppDbContext ctx,
        RumOptions? rumOptions = null,
        string environmentName = "Development")
    {
        var auth = new FakeAuthenticationService();

        var services = new ServiceCollection();
        services.AddSingleton<IAuthenticationService>(auth);
        var sp = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = sp };

        var userService = new UserService(NullLogger<UserService>.Instance, ctx);
        var controller = new SystemController(
            userService,
            Options.Create(rumOptions ?? new RumOptions()),
            new FakeHostEnvironment { EnvironmentName = environmentName })
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };

        return (controller, auth);
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
