using System.Net;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Identity.Web;
using Server.Controllers;
using Server.Tests;
using server.core.Data;
using server.core.Domain;

namespace server.tests.Controllers;

public sealed class AccountControllerTests
{
    [Fact]
    public async Task Login_renders_chooser_in_dev_loopback()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var controller = CreateController(ctx, remoteIp: IPAddress.Loopback);

        var result = await controller.Login(returnUrl: "/x", asOption: null);

        var content = result.Should().BeOfType<ContentResult>().Which;
        content.ContentType.Should().Be("text/html");
        content.Content.Should().Contain("Login as PI (esspang@ucdavis.edu)");
        content.Content.Should().Contain("Login as PM (kkolson@ucdavis.edu)");
        content.Content.Should().Contain("Login as Accrual Viewer (local dev)");
        content.Content.Should().Contain("Login as self (Entra)");
    }

    [Fact]
    public async Task Login_pi_signs_in_with_cookie_and_redirects()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var (controller, auth, piUserId, _, _) = CreateControllerWithUsers(ctx, remoteIp: IPAddress.Loopback);

        var result = await controller.Login(returnUrl: "/x", asOption: "pi");

        result.Should().BeOfType<RedirectResult>().Which.Url.Should().Be("/x");

        auth.SignedInScheme.Should().Be(CookieAuthenticationDefaults.AuthenticationScheme);
        auth.SignedInPrincipal.Should().NotBeNull();
        auth.SignedInPrincipal!.FindFirst(ClaimConstants.ObjectId)!.Value.Should().Be(piUserId.ToString());
        auth.SignedInPrincipal.FindFirst("kerberos")!.Value.Should().Be("esspang");
    }

    [Fact]
    public async Task Login_pm_signs_in_with_cookie_and_redirects()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var (controller, auth, _, pmUserId, _) = CreateControllerWithUsers(ctx, remoteIp: IPAddress.Loopback);

        var result = await controller.Login(returnUrl: "/x", asOption: "pm");

        result.Should().BeOfType<RedirectResult>().Which.Url.Should().Be("/x");

        auth.SignedInScheme.Should().Be(CookieAuthenticationDefaults.AuthenticationScheme);
        auth.SignedInPrincipal.Should().NotBeNull();
        auth.SignedInPrincipal!.FindFirst(ClaimConstants.ObjectId)!.Value.Should().Be(pmUserId.ToString());
        auth.SignedInPrincipal.FindFirst("kerberos")!.Value.Should().Be("kkolson");
    }

    [Fact]
    public async Task Login_accrual_signs_in_with_seeded_dev_user()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var (controller, auth, _, _, accrualUserId) = CreateControllerWithUsers(ctx, remoteIp: IPAddress.Loopback);

        var result = await controller.Login(returnUrl: "/x", asOption: "accrual");

        result.Should().BeOfType<RedirectResult>().Which.Url.Should().Be("/x");

        auth.SignedInScheme.Should().Be(CookieAuthenticationDefaults.AuthenticationScheme);
        auth.SignedInPrincipal.Should().NotBeNull();
        auth.SignedInPrincipal!.FindFirst(ClaimConstants.ObjectId)!.Value.Should().Be(accrualUserId.ToString());
        auth.SignedInPrincipal.FindFirst("kerberos")!.Value.Should().Be(DevelopmentSeedData.AccrualViewerKerberos);
        auth.SignedInPrincipal.FindAll(ClaimTypes.Role).Select(c => c.Value)
            .Should().ContainSingle()
            .Which.Should().Be(Role.Names.AccrualViewer);
    }

    [Fact]
    public async Task Login_self_challenges_oidc()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var controller = CreateController(ctx, remoteIp: IPAddress.Loopback);

        var result = await controller.Login(returnUrl: "/x", asOption: "self");

        var challenge = result.Should().BeOfType<ChallengeResult>().Which;
        challenge.AuthenticationSchemes.Should().Contain(OpenIdConnectDefaults.AuthenticationScheme);
    }

    [Fact]
    public async Task Login_non_loopback_disables_chooser_and_challenges_oidc()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();

        var controller = CreateController(ctx, remoteIp: IPAddress.Parse("8.8.8.8"));

        var result = await controller.Login(returnUrl: "/x", asOption: null);

        var challenge = result.Should().BeOfType<ChallengeResult>().Which;
        challenge.AuthenticationSchemes.Should().Contain(OpenIdConnectDefaults.AuthenticationScheme);
    }

    private static AccountController CreateController(AppDbContext ctx, IPAddress remoteIp)
    {
        var auth = new FakeAuthenticationService();

        var services = new ServiceCollection();
        services.AddSingleton<IAuthenticationService>(auth);
        var sp = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = sp };
        httpContext.Connection.RemoteIpAddress = remoteIp;

        return new AccountController(new FakeWebHostEnvironment(), ctx)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static (AccountController Controller, FakeAuthenticationService Auth, Guid PiUserId, Guid PmUserId, Guid AccrualUserId)
        CreateControllerWithUsers(AppDbContext ctx, IPAddress remoteIp)
    {
        var testRole = new Role { Name = "TestRole" };
        var accrualViewerRole = new Role { Name = Role.Names.AccrualViewer };

        var pi = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "esspang",
            IamId = "IAM-PI",
            EmployeeId = "E-PI",
            DisplayName = "Erin Spang",
            Email = "esspang@ucdavis.edu",
        };

        var pm = new User
        {
            Id = Guid.NewGuid(),
            Kerberos = "kkolson",
            IamId = "IAM-PM",
            EmployeeId = "E-PM",
            DisplayName = "K Kolson",
            Email = "kkolson@ucdavis.edu",
        };

        var accrual = new User
        {
            Id = DevelopmentSeedData.AccrualViewerUserId,
            Kerberos = DevelopmentSeedData.AccrualViewerKerberos,
            IamId = DevelopmentSeedData.AccrualViewerIamId,
            EmployeeId = DevelopmentSeedData.AccrualViewerEmployeeId,
            DisplayName = DevelopmentSeedData.AccrualViewerDisplayName,
            Email = DevelopmentSeedData.AccrualViewerEmail,
        };

        ctx.Roles.Add(testRole);
        ctx.Roles.Add(accrualViewerRole);
        ctx.Users.Add(pi);
        ctx.Users.Add(pm);
        ctx.Users.Add(accrual);
        ctx.SaveChanges();

        ctx.Permissions.Add(new Permission { UserId = pi.Id, RoleId = testRole.Id });
        ctx.Permissions.Add(new Permission { UserId = pm.Id, RoleId = testRole.Id });
        ctx.Permissions.Add(new Permission { UserId = accrual.Id, RoleId = accrualViewerRole.Id });
        ctx.SaveChanges();

        var auth = new FakeAuthenticationService();

        var services = new ServiceCollection();
        services.AddSingleton<IAuthenticationService>(auth);
        var sp = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = sp };
        httpContext.Connection.RemoteIpAddress = remoteIp;

        var controller = new AccountController(new FakeWebHostEnvironment(), ctx)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };

        return (controller, auth, pi.Id, pm.Id, accrual.Id);
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

    private sealed class FakeAuthenticationService : IAuthenticationService
    {
        public string? SignedInScheme { get; private set; }
        public ClaimsPrincipal? SignedInPrincipal { get; private set; }

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
            throw new NotImplementedException();
        }
    }
}
