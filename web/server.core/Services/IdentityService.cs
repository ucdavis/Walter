using System.Linq;
using System.Net.Http;
using Ietws;
using Microsoft.Extensions.Options;

namespace server.core.Services;

public interface IIdentityService
{
    Task<IamIdentity?> GetByIamId(string iamId);
}

public sealed class IdentityService : IIdentityService
{
    private readonly IetClient _ietClient;

    public IdentityService(HttpClient httpClient, IOptions<IamSettings> iamSettings)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(iamSettings);

        var apiKey = iamSettings.Value.ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("IAM API key is not configured.");
        }

        _ietClient = new IetClient(httpClient, apiKey);
    }

    public async Task<IamIdentity?> GetByIamId(string iamId)
    {
        if (string.IsNullOrWhiteSpace(iamId))
        {
            throw new ArgumentException("IAM ID is required.", nameof(iamId));
        }

        var iamResponse = await _ietClient.People.Get(iamId);

        var results = iamResponse.ResponseData?.Results;

        if (results is null || results.Length == 0)
        {
            return null;
        }

        // should only be one result for a given IAM ID, so just take the first
        var person = results.First();
        return new IamIdentity(person.IamId, person.EmployeeId, person.FullName);
    }

}

public sealed record IamIdentity(string IamId, string EmployeeId, string FullName);

public sealed class IamSettings
{
    public string? ApiKey { get; set; }
}
