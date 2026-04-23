using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using server.core.Data;

namespace Server.Controllers;

[AllowAnonymous]
public sealed class AccountController : Controller
{
    private static readonly HtmlEncoder HtmlEncoder = HtmlEncoder.Default;

    private readonly IWebHostEnvironment _env;
    private readonly AppDbContext _dbContext;

    public AccountController(IWebHostEnvironment env, AppDbContext dbContext)
    {
        _env = env;
        _dbContext = dbContext;
    }

    [HttpGet("login")]
    [ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> Login([FromQuery] string? returnUrl, [FromQuery(Name = "as")] string? asOption)
    {
        var safeReturnUrl = NormalizeReturnUrl(returnUrl);

        // In non-local/non-dev environments, do regular login flow:
        // unauthenticated -> OIDC challenge, authenticated -> redirect to return URL.
        if (!IsDevLoopback(HttpContext))
        {
            if (User.Identity?.IsAuthenticated == true)
            {
                return Redirect(safeReturnUrl);
            }

            return Challenge(
                new AuthenticationProperties { RedirectUri = safeReturnUrl },
                OpenIdConnectDefaults.AuthenticationScheme);
        }

        // Dev + loopback: show chooser unless explicitly requested.
        var normalizedAs = asOption?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedAs))
        {
            return RenderChooserHtml(safeReturnUrl, error: null);
        }

        if (normalizedAs == "self")
        {
            // Redirect to OIDC challenge for self login
            return Challenge(
                new AuthenticationProperties { RedirectUri = safeReturnUrl },
                OpenIdConnectDefaults.AuthenticationScheme);
        }

        if (normalizedAs == "pi")
        {
            return await SignInAsUserAsync(
                email: "esspang@ucdavis.edu",
                kerberosFallback: "esspang",
                safeReturnUrl: safeReturnUrl);
        }

        if (normalizedAs == "pm")
        {
            return await SignInAsUserAsync(
                email: "kkolson@ucdavis.edu",
                kerberosFallback: "kkolson",
                safeReturnUrl: safeReturnUrl);
        }

        if (normalizedAs == "accrual")
        {
            return await SignInAsUserAsync(
                email: DevelopmentSeedData.AccrualViewerEmail,
                kerberosFallback: DevelopmentSeedData.AccrualViewerKerberos,
                safeReturnUrl: safeReturnUrl);
        }

        return RenderChooserHtml(
            safeReturnUrl,
            error: $"Unknown login option '{asOption}'.");
    }

    private bool IsDevLoopback(HttpContext ctx)
    {
        if (!_env.IsDevelopment())
        {
            return false;
        }

        var remoteIp = ctx.Connection.RemoteIpAddress;
        if (remoteIp is null)
        {
            return false;
        }

        // Prefer the first XFF IP only when the immediate connection is loopback. This avoids trusting spoofed headers
        // for non-local connections, while still supporting local proxies during dev.
        var effectiveIp = IPAddress.IsLoopback(remoteIp) ? ParseFirstForwardedFor(ctx) ?? remoteIp : remoteIp;

        return IPAddress.IsLoopback(effectiveIp);
    }

    private static IPAddress? ParseFirstForwardedFor(HttpContext ctx)
    {
        var xff = ctx.Request.Headers["X-Forwarded-For"].ToString();
        if (string.IsNullOrWhiteSpace(xff))
        {
            return null;
        }

        var first = xff.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault();

        return !string.IsNullOrWhiteSpace(first) && IPAddress.TryParse(first, out var parsed) ? parsed : null;
    }

    private static string NormalizeReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrWhiteSpace(returnUrl))
        {
            return "/";
        }

        var trimmed = returnUrl.Trim();

        if (!trimmed.StartsWith('/'))
        {
            return "/";
        }

        if (trimmed.StartsWith("//", StringComparison.Ordinal))
        {
            return "/";
        }

        return trimmed;
    }

    private ContentResult RenderChooserHtml(string safeReturnUrl, string? error)
    {
        // could do as react but keeping it simple for now
        var encodedReturnUrlParam = Uri.EscapeDataString(safeReturnUrl);
        var piHref = $"/login?as=pi&returnUrl={encodedReturnUrlParam}";
        var pmHref = $"/login?as=pm&returnUrl={encodedReturnUrlParam}";
        var accrualHref = $"/login?as=accrual&returnUrl={encodedReturnUrlParam}";
        var selfHref = $"/login?as=self&returnUrl={encodedReturnUrlParam}";

        var isAuthenticated = User.Identity?.IsAuthenticated == true;

        var sb = new StringBuilder();
        sb.AppendLine("<!doctype html>");
        sb.AppendLine("<html lang=\"en\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"utf-8\" />");
        sb.AppendLine("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />");
        sb.AppendLine("<title>Local Login</title>");
        sb.AppendLine(
            "<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:2rem;max-width:42rem;}a{display:inline-block;margin:.25rem 0;}code{background:#f5f5f5;padding:.1rem .25rem;border-radius:.25rem;}</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        sb.AppendLine("<h1>Local login</h1>");
        sb.AppendLine("<p>This page is only available when running locally in development.</p>");

        if (!string.IsNullOrWhiteSpace(error))
        {
            sb.Append("<p style=\"color:#b91c1c;\">");
            sb.Append(HtmlEncoder.Encode(error));
            sb.AppendLine("</p>");
        }

        if (isAuthenticated)
        {
            sb.Append("<p>Currently signed in as <code>");
            sb.Append(HtmlEncoder.Encode(User.Identity?.Name ?? "(unknown)"));
            sb.AppendLine("</code>.</p>");
            sb.Append("<p><a href=\"");
            sb.Append(HtmlEncoder.Encode(safeReturnUrl));
            sb.AppendLine("\">Continue</a></p>");
        }

        sb.AppendLine("<ul>");
        sb.Append("<li><a href=\"");
        sb.Append(HtmlEncoder.Encode(piHref));
        sb.AppendLine("\">Login as PI (esspang@ucdavis.edu)</a></li>");
        sb.Append("<li><a href=\"");
        sb.Append(HtmlEncoder.Encode(pmHref));
        sb.AppendLine("\">Login as PM (kkolson@ucdavis.edu)</a></li>");
        sb.Append("<li><a href=\"");
        sb.Append(HtmlEncoder.Encode(accrualHref));
        sb.AppendLine("\">Login as Accrual Viewer (local dev)</a></li>");
        sb.Append("<li><a href=\"");
        sb.Append(HtmlEncoder.Encode(selfHref));
        sb.AppendLine("\">Login as self (Entra)</a></li>");
        sb.AppendLine("</ul>");

        sb.AppendLine("</body>");
        sb.AppendLine("</html>");

        return Content(sb.ToString(), "text/html");
    }

    private async Task<IActionResult> SignInAsUserAsync(
        string email,
        string kerberosFallback,
        string safeReturnUrl)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var normalizedKerberos = kerberosFallback.Trim().ToLowerInvariant();

        var user = await _dbContext.Users
            .Include(u => u.Permissions)
                .ThenInclude(p => p.Role)
            .SingleOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == normalizedEmail);

        if (user is null)
        {
            user = await _dbContext.Users
                .Include(u => u.Permissions)
                    .ThenInclude(p => p.Role)
                .SingleOrDefaultAsync(u => u.Kerberos.ToLower() == normalizedKerberos);
        }

        if (user is null)
        {
            return RenderChooserHtml(safeReturnUrl, error: $"User '{email}' not found in the local database.");
        }

        var roles = user.Permissions
            .Where(p => p.Role != null)
            .Select(p => p.Role!.Name)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var resolvedEmail = user.Email ?? email;

        var claims = new List<Claim>
        {
            new(ClaimConstants.ObjectId, user.Id.ToString()),
            new(ClaimTypes.Name, user.DisplayName ?? user.Kerberos),
            new(ClaimTypes.Email, resolvedEmail),
            new("preferred_username", resolvedEmail),
            new("kerberos", user.Kerberos),
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);

        return Redirect(safeReturnUrl);
    }

}
