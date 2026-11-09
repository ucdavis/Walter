using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;
using server.core.Domain;
using server.Helpers;

namespace Server.Demo;

/// <summary>A fictional persona bound to the real authenticated presenter, without persisting a Walter user.</summary>
public sealed class DemoRequestContext(
    IHttpContextAccessor accessor,
    IDataProtectionProvider protectionProvider,
    IOptions<DemoOptions> options,
    IHostEnvironment environment,
    TimeProvider clock)
{
    public const string CookieName = "Walter.Presentation";
    public const string ContextHeader = "X-Walter-Presentation";
    private readonly IDataProtector _protector = protectionProvider.CreateProtector("Walter.Presentation.v1");
    private bool _resolved;
    private string? _profile;

    private HttpContext Http => accessor.HttpContext ?? throw new InvalidOperationException("A presentation requires an HTTP request.");

    public bool HasSession => Http.Request.Cookies.ContainsKey(CookieName);
    public bool IsActive => Profile is not null;
    public string? Profile { get { Resolve(); return _profile; } }
    public User? PresentationUser => Profile is { } profile ? DemoDataSet.GetProfile(profile) : null;
    public string ResponseContext => IsActive ? $"demo:{Profile}" : HasSession ? "invalid" : "normal";

    public bool CanStart
    {
        get
        {
            if (!options.Value.Enabled ||
                !(environment.IsDevelopment() || environment.IsStaging() || environment.IsEnvironment("Test")) ||
                Http.User.Identity?.IsAuthenticated != true || Http.User.GetEmulatingUser() is not null)
                return false;

            var presenterId = GetPresenterId();
            return presenterId is not null && (environment.IsDevelopment() ||
                options.Value.AllowedPresenterIds.Any(id => Guid.TryParse(id, out var allowed) && allowed == presenterId));
        }
    }

    /// <summary>Starts a fixed fictional persona while leaving the authentication cookie and database untouched.</summary>
    public bool Start(string profile)
    {
        if (!CanStart || DemoDataSet.GetProfile(profile) is null || (HasSession && !IsActive))
            return false;

        var expires = clock.GetUtcNow().AddHours(8);
        var payload = string.Join('|', GetPresenterId()!.Value.ToString("D"), profile,
            expires.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture));
        Http.Response.Cookies.Append(CookieName, _protector.Protect(payload), CookieSettings());
        return true;
    }

    /// <summary>Explicit recovery remains available when a presentation has expired or its configuration was disabled.</summary>
    public void Stop() => Http.Response.Cookies.Delete(CookieName, CookieSettings());

    /// <summary>Invalid presentation state must never silently select live reporting services.</summary>
    private void Resolve()
    {
        if (_resolved) return;
        _resolved = true;
        if (!HasSession || !CanStart) return;

        try
        {
            var parts = _protector.Unprotect(Http.Request.Cookies[CookieName]!).Split('|');
            if (parts.Length == 3 && Guid.TryParse(parts[0], out var presenter) && presenter == GetPresenterId() &&
                long.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var expires) &&
                expires > clock.GetUtcNow().ToUnixTimeSeconds() && DemoDataSet.GetProfile(parts[1]) is not null)
                _profile = parts[1];
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException)
        {
            // Retain the invalid marker until the presenter explicitly exits; do not fall back to real data.
        }
    }

    private Guid? GetPresenterId()
    {
        try { return Http.User.GetUserId(); }
        catch (InvalidOperationException) { return null; }
    }

    private CookieOptions CookieSettings() => new()
    {
        HttpOnly = true,
        Secure = Http.Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        IsEssential = true,
        // Keep a session cookie even after the protected payload expires, so expiry cannot expose live data.
        Expires = null,
    };
}
