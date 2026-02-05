using Azure.Core;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Graph;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using Microsoft.Kiota.Abstractions;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Server.Services;

public interface IGraphService
{
    Task<GraphUserPhoto?> GetMePhotoAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default);
}

public sealed record GraphUserPhoto(byte[] Bytes, string ContentType);

public sealed class GraphService : IGraphService
{
    private static readonly string[] RequiredScopes = new[] { "User.Read.All" };

    private readonly ITokenAcquisition _tokenAcquisition;
    private readonly ILogger<GraphService> _logger;

    public GraphService(ITokenAcquisition tokenAcquisition, ILogger<GraphService> logger)
    {
        _tokenAcquisition = tokenAcquisition;
        _logger = logger;
    }

    public async Task<GraphUserPhoto?> GetMePhotoAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
    {
        var graphClient = CreateGraphClient(principal);

        try
        {
            var stream = await graphClient.Me.Photo.Content.GetAsync(cancellationToken: cancellationToken);
            if (stream is null)
            {
                return null;
            }

            await using (stream)
            {
                using var ms = new MemoryStream();
                await stream.CopyToAsync(ms, cancellationToken);
                var bytes = ms.ToArray();
                if (bytes.Length == 0)
                {
                    return null;
                }

                var contentType = GuessImageContentType(bytes) ?? "image/jpeg";
                return new GraphUserPhoto(bytes, contentType);
            }
        }
        catch (ApiException ex) when (ex.ResponseStatusCode == 404)
        {
            return null;
        }
        catch (MicrosoftIdentityWebChallengeUserException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for profile photo.");
            return null;
        }
        catch (MsalUiRequiredException ex)
        {
            _logger.LogInformation(ex, "User interaction required to acquire Graph token for profile photo.");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve current user's profile photo from Microsoft Graph.");
            throw;
        }
    }

    private GraphServiceClient CreateGraphClient(ClaimsPrincipal principal)
    {
        var credential = new TokenAcquisitionTokenCredential(_tokenAcquisition, _logger, principal);
        return new GraphServiceClient(credential, RequiredScopes);
    }

    private static string? GuessImageContentType(ReadOnlySpan<byte> bytes)
    {
        // JPEG: FF D8 FF
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            return "image/jpeg";
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (bytes.Length >= 8 &&
            bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 &&
            bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A)
        {
            return "image/png";
        }

        // GIF: GIF87a / GIF89a
        if (bytes.Length >= 6 &&
            bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38 &&
            (bytes[4] == 0x37 || bytes[4] == 0x39) && bytes[5] == 0x61)
        {
            return "image/gif";
        }

        // BMP: 42 4D
        if (bytes.Length >= 2 && bytes[0] == 0x42 && bytes[1] == 0x4D)
        {
            return "image/bmp";
        }

        // WebP: RIFF....WEBP
        if (bytes.Length >= 12 &&
            bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
            bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
        {
            return "image/webp";
        }

        return null;
    }

    private sealed class TokenAcquisitionTokenCredential : TokenCredential
    {
        private readonly ITokenAcquisition _tokenAcquisition;
        private readonly ILogger _logger;
        private readonly ClaimsPrincipal _principal;

        public TokenAcquisitionTokenCredential(ITokenAcquisition tokenAcquisition, ILogger logger, ClaimsPrincipal principal)
        {
            _tokenAcquisition = tokenAcquisition;
            _logger = logger;
            _principal = principal;
        }

        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken)
        {
            return GetTokenAsync(requestContext, cancellationToken).GetAwaiter().GetResult();
        }

        public override async ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken)
        {
            var scopes = requestContext.Scopes is { Length: > 0 } ? requestContext.Scopes : RequiredScopes;
            try
            {
                var options = new TokenAcquisitionOptions { CancellationToken = cancellationToken };
                var accessToken = await _tokenAcquisition.GetAccessTokenForUserAsync(
                    scopes,
                    authenticationScheme: OpenIdConnectDefaults.AuthenticationScheme,
                    user: _principal,
                    tokenAcquisitionOptions: options);

                var expiresOn = TryGetExpiry(accessToken);
                return new AccessToken(accessToken, expiresOn);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to acquire Graph access token");
                throw;
            }
        }

        private static DateTimeOffset TryGetExpiry(string token)
        {
            try
            {
                var handler = new JwtSecurityTokenHandler();
                var securityToken = handler.ReadJwtToken(token);
                return securityToken.ValidTo;
            }
            catch
            {
                return DateTimeOffset.UtcNow.AddMinutes(5);
            }
        }
    }
}
