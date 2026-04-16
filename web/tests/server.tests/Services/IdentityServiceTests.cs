using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Ietws;
using Microsoft.Extensions.Options;
using server.core.Services;

namespace server.tests.Services;

public sealed class IdentityServiceTests
{
    [Fact]
    public async Task GetKerberosByIamId_returns_user_id_from_kerberos_response()
    {
        var responsePayload = new KerberosResults
        {
            ResponseStatus = 200,
            ResponseData = new ResponseData<KerberosResult>
            {
                Results =
                [
                    new KerberosResult
                    {
                        IamId = "IAM-123",
                        UserId = "guser",
                    },
                ],
            },
        };

        using var httpClient = new HttpClient(new StubHttpMessageHandler(_ => CreateJsonResponse(responsePayload)))
        {
            BaseAddress = new Uri("https://iam.example"),
        };

        var service = new IdentityService(
            httpClient,
            Options.Create(new IamSettings { ApiKey = "test-api-key" }));

        var kerberos = await service.GetKerberosByIamId("IAM-123");

        kerberos.Should().Be("guser");
    }

    private static HttpResponseMessage CreateJsonResponse<T>(T payload)
    {
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json"),
        };
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responseFactory;

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory)
        {
            _responseFactory = responseFactory;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(_responseFactory(request));
        }
    }
}
