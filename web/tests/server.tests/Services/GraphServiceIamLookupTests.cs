using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Graph;
using Microsoft.Kiota.Abstractions.Authentication;
using Server.Services;

namespace server.tests.Services;

public sealed class GraphServiceIamLookupTests
{
    private const string IamId = "1000000123";

    [Fact]
    public async Task Exact_iam_lookup_accepts_ad3_mail_but_rejects_disabled_guest_and_mismatched_accounts()
    {
        var eligibleId = Guid.NewGuid().ToString();
        using var handler = new GraphHandler(Page(null,
            Account(Guid.NewGuid().ToString(), enabled: false),
            Account(Guid.NewGuid().ToString(), type: "Guest"),
            Account(Guid.NewGuid().ToString(), iamId: "different"),
            Account(Guid.NewGuid().ToString(), enabled: null),
            Account(eligibleId)));
        using var httpClient = new HttpClient(handler);
        var client = new GraphServiceClient(httpClient, new AnonymousAuthenticationProvider());

        var results = await GraphService.FindEligibleUsersByIamIdAsync(client, IamId);

        results.Should().ContainSingle().Which.Id.Should().Be(eligibleId);
        results[0].Email.Should().Be("alias@ad3.ucdavis.edu");
        results[0].IamId.Should().Be(IamId);
        handler.Requests.Should().ContainSingle();
        var uri = Uri.UnescapeDataString(handler.Requests[0].Uri);
        uri.Should().Contain("$filter=onPremisesExtensionAttributes/extensionAttribute7 eq '1000000123'");
        uri.Should().Contain("$count=true");
        handler.Requests[0].Consistency.Should().Be("eventual");
    }

    [Fact]
    public async Task Lookup_detects_ambiguity_on_later_page_instead_of_selecting_first_account()
    {
        var firstId = Guid.NewGuid().ToString();
        var secondId = Guid.NewGuid().ToString();
        const string next = "https://graph.microsoft.com/v1.0/users?$skiptoken=next";
        using var handler = new GraphHandler(Page(next, Account(firstId)), Page(null, Account(firstId), Account(secondId)));
        using var httpClient = new HttpClient(handler);
        var client = new GraphServiceClient(httpClient, new AnonymousAuthenticationProvider());

        var results = await GraphService.FindEligibleUsersByIamIdAsync(client, IamId);

        results.Select(p => p.Id).Should().Equal(firstId, secondId);
        handler.Requests.Should().HaveCount(2);
        handler.Requests[1].Uri.Should().Be(next);
        handler.Requests[1].Consistency.Should().Be("eventual");
    }

    [Fact]
    public async Task Lookup_continues_past_ineligible_first_page()
    {
        var eligibleId = Guid.NewGuid().ToString();
        using var handler = new GraphHandler(
            Page("https://graph.microsoft.com/v1.0/users?$skiptoken=next", Account(Guid.NewGuid().ToString(), enabled: false)),
            Page(null, Account(eligibleId)));
        using var httpClient = new HttpClient(handler);
        var results = await GraphService.FindEligibleUsersByIamIdAsync(
            new GraphServiceClient(httpClient, new AnonymousAuthenticationProvider()), IamId);
        results.Should().ContainSingle().Which.Id.Should().Be(eligibleId);
    }

    [Fact]
    public async Task Lookup_returns_no_match_when_only_ineligible_accounts_exist()
    {
        using var handler = new GraphHandler(Page(null, Account(Guid.NewGuid().ToString(), type: "Guest")));
        using var httpClient = new HttpClient(handler);
        var results = await GraphService.FindEligibleUsersByIamIdAsync(
            new GraphServiceClient(httpClient, new AnonymousAuthenticationProvider()), IamId);
        results.Should().BeEmpty();
    }

    private static object Account(string id, bool? enabled = true, string type = "Member", string iamId = IamId) => new
    {
        id, displayName = "Campus Person", mail = "alias@ad3.ucdavis.edu", userPrincipalName = "person@ucdavis.edu",
        accountEnabled = enabled, userType = type, onPremisesExtensionAttributes = new { extensionAttribute7 = iamId },
    };

    private static string Page(string? nextLink, params object[] users) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["@odata.context"] = "https://graph.microsoft.com/v1.0/$metadata#users",
        ["@odata.nextLink"] = nextLink, ["value"] = users,
    });

    private sealed class GraphHandler(params string[] pages) : HttpMessageHandler
    {
        public List<(string Uri, string? Consistency)> Requests { get; } = [];
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var page = pages[Requests.Count];
            Requests.Add((request.RequestUri!.ToString(), request.Headers.TryGetValues("ConsistencyLevel", out var values) ? values.Single() : null));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(page, Encoding.UTF8, "application/json"),
            });
        }
    }
}
