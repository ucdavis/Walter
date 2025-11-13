using System.Linq;
using Ietws;
using Microsoft.Extensions.Options;

namespace server.core.Services;

public interface IIdentityService
{
    Task<IamIdentity?> GetByKerberos(string kerberosId);
}

public sealed class IdentityService : IIdentityService
{
    private readonly string _iamApiKey;

    public IdentityService(IOptions<IamSettings> iamSettings)
    {
        _iamApiKey = iamSettings.Value.ApiKey ?? string.Empty;
    }

    public async Task<IamIdentity?> GetByKerberos(string kerberosId)
    {
        if (string.IsNullOrWhiteSpace(kerberosId))
        {
            throw new ArgumentException("Kerberos ID is required.", nameof(kerberosId));
        }

        if (string.IsNullOrWhiteSpace(_iamApiKey))
        {
            throw new InvalidOperationException("IAM API key is not configured.");
        }

        var client = new IetClient(_iamApiKey);
        var kerbResponse = await client.Kerberos.Search(KerberosSearchField.userId, kerberosId);
        var results = kerbResponse.ResponseData.Results;

        if (results.Length == 0)
        {
            return null;
        }

        EnsureUniqueResult(results);

        var person = results.First();
        var iamId = person.IamId;
        var employeeId = person.EmployeeId;

        if (string.IsNullOrWhiteSpace(iamId) || string.IsNullOrWhiteSpace(employeeId))
        {
            throw new InvalidOperationException("IAM returned an incomplete record for Kerberos lookup.");
        }

        return new IamIdentity(iamId, employeeId, person.FullName);
    }

    private static void EnsureUniqueResult(KerberosResult[] results)
    {
        if (results.Length <= 1)
        {
            return;
        }

        var iamIds = results.Select(r => r.IamId).Distinct().ToArray();
        var kerbs = results.Select(r => r.UserId).Distinct().ToArray();

        if (iamIds.Length != 1 && kerbs.Length != 1)
        {
            throw new InvalidOperationException(
                $"IAM issue with non unique values for kerbs: {string.Join(',', kerbs)} IAM: {string.Join(',', iamIds)}");
        }
    }

}

public sealed record IamIdentity(string IamId, string EmployeeId, string FullName);

public sealed class IamSettings
{
    public string? ApiKey { get; set; }
}
