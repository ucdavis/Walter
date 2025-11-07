using Azure.Core;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Graph;
using Microsoft.Identity.Web;
using Microsoft.Extensions.Logging;

namespace Server.Services;

public interface IEntraUserAttributeService
{
    Task UpdateClaimsAsync(ClaimsPrincipal? principal, CancellationToken cancellationToken = default);
}

public record EntraUserAttributes(string? Kerberos, string? IamId);

public class EntraUserAttributeService : IEntraUserAttributeService
{
    private const string KerberosClaimType = "urn:ucdavis:iam:kerberos";
    private const string IamIdClaimType = "urn:ucdavis:iam:iamid";

    internal static readonly string[] RequiredScopes = new[] { "User.Read.All" };

    private readonly ITokenAcquisition _tokenAcquisition;
    private readonly ILogger<EntraUserAttributeService> _logger;

    public EntraUserAttributeService(ITokenAcquisition tokenAcquisition, ILogger<EntraUserAttributeService> logger)
    {
        _tokenAcquisition = tokenAcquisition;
        _logger = logger;
    }

    public async Task UpdateClaimsAsync(ClaimsPrincipal? principal, CancellationToken cancellationToken = default)
    {
        if (principal?.Identity is not ClaimsIdentity identity)
        {
            _logger.LogWarning("Skipping attribute lookup because no claims identity was provided.");
            return;
        }

        var userKey = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userKey))
        {
            _logger.LogWarning("Skipping attribute lookup because the user principal lacks a NameIdentifier claim.");
            return;
        }

        var userObjectId = principal.FindFirstValue(ClaimConstants.ObjectId)
                           ?? principal.FindFirstValue(ClaimConstants.Oid)
                           ?? userKey;

        var attributes = await GetExtensionAttributesAsync(userObjectId, principal, cancellationToken);

        if (attributes?.Kerberos is { Length: > 0 } kerberos)
        {
            AddOrUpdateClaim(identity, KerberosClaimType, kerberos);
        }
        else
        {
            _logger.LogInformation("Kerberos (extension attribute 13) not available for user {UserId}", userKey);
        }

        if (attributes?.IamId is { Length: > 0 } iamId)
        {
            AddOrUpdateClaim(identity, IamIdClaimType, iamId);
        }
        else
        {
            _logger.LogInformation("IAMID (extension attribute 7) not available for user {UserId}", userKey);
        }
    }

    private async Task<EntraUserAttributes?> GetExtensionAttributesAsync(string userObjectId, ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userObjectId))
        {
            return null;
        }

        try
        {
            var graphClient = CreateGraphClient(principal);

            var user = await graphClient.Users[userObjectId]
                .GetAsync(requestConfiguration =>
                {
                    requestConfiguration.QueryParameters.Select = new[] { "id", "onPremisesExtensionAttributes" };
                }, cancellationToken);

            var extensions = user?.OnPremisesExtensionAttributes;
            if (extensions == null)
            {
                _logger.LogInformation("No extension attributes returned for user {UserObjectId}", userObjectId);
                return null;
            }

            return new EntraUserAttributes(
                Kerberos: extensions.ExtensionAttribute13,
                IamId: extensions.ExtensionAttribute7);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve extension attributes for user {UserObjectId}", userObjectId);
            return null;
        }
    }

    private GraphServiceClient CreateGraphClient(ClaimsPrincipal principal)
    {
        var credential = new TokenAcquisitionTokenCredential(_tokenAcquisition, _logger, principal);
        return new GraphServiceClient(credential, RequiredScopes);
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
                var options = new TokenAcquisitionOptions
                {
                    CancellationToken = cancellationToken
                };

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
    private static void AddOrUpdateClaim(ClaimsIdentity identity, string claimType, string value)
    {
        var existing = identity.FindFirst(claimType);
        if (existing != null)
        {
            identity.RemoveClaim(existing);
        }

        identity.AddClaim(new Claim(claimType, value));
    }
}
