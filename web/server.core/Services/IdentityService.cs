using System.Linq;
using Ietws;
using Microsoft.Extensions.Options;

namespace server.core.Services;

public interface IIdentityService
{
    Task<IamIdentity?> GetByIamId(string iamId);
}

public sealed class IdentityService : IIdentityService
{
    private readonly string _iamApiKey;

    public IdentityService(IOptions<IamSettings> iamSettings)
    {
        _iamApiKey = iamSettings.Value.ApiKey ?? string.Empty;
    }

    public async Task<IamIdentity?> GetByIamId(string iamId)
    {
        if (string.IsNullOrWhiteSpace(iamId))
        {
            throw new ArgumentException("IAM ID is required.", nameof(iamId));
        }

        if (string.IsNullOrWhiteSpace(_iamApiKey))
        {
            throw new InvalidOperationException("IAM API key is not configured.");
        }

        var client = new IetClient(_iamApiKey);
        var iamResponse = await client.People.Get(iamId);

        var results = iamResponse.ResponseData.Results;

        if (results.Length == 0)
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
