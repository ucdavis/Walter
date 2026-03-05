using FluentAssertions;
using Microsoft.Graph.Models;
using Server.Services;

namespace server.tests.Services;

public sealed class GraphServiceTests
{
    [Fact]
    public void BuildValidSearchResults_returns_empty_for_null_or_empty()
    {
        GraphService.BuildValidSearchResults(null).Should().BeEmpty();
        GraphService.BuildValidSearchResults([]).Should().BeEmpty();
    }

    [Fact]
    public void BuildValidSearchResults_filters_disabled_guest_and_ad3_users()
    {
        var users = new List<User>
        {
            new()
            {
                Id = "ok-1",
                DisplayName = "Alpha User",
                Mail = "alpha@ucdavis.edu",
                AccountEnabled = true,
                UserType = "Member",
            },
            new()
            {
                Id = "disabled",
                DisplayName = "Disabled User",
                Mail = "disabled@ucdavis.edu",
                AccountEnabled = false,
                UserType = "Member",
            },
            new()
            {
                Id = "guest",
                DisplayName = "Guest User",
                Mail = "guest@ucdavis.edu",
                AccountEnabled = true,
                UserType = "Guest",
            },
            new()
            {
                Id = "ad3-mail",
                DisplayName = "AD3 Mail",
                Mail = "someone@ad3.ucdavis.edu",
                AccountEnabled = true,
                UserType = "Member",
            },
            new()
            {
                Id = "ad3-upn",
                DisplayName = "AD3 UPN",
                UserPrincipalName = "upnuser@ad3.ucdavis.edu",
                AccountEnabled = true,
                UserType = "Member",
            },
            new()
            {
                Id = "ok-2",
                DisplayName = "Beta User",
                UserPrincipalName = "beta@ucdavis.edu",
                AccountEnabled = null,
                UserType = "Member",
            },
        };

        var results = GraphService.BuildValidSearchResults(users);

        results.Select(x => x.Id).Should().ContainInOrder("ok-1", "ok-2");
        results.Should().OnlyContain(x => !x.Email!.EndsWith("@ad3.ucdavis.edu", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void BuildValidSearchResults_dedupes_sorts_and_limits_to_five()
    {
        var users = new List<User>
        {
            new() { Id = "c", DisplayName = "Charlie", Mail = "charlie@ucdavis.edu", AccountEnabled = true, UserType = "Member" },
            new() { Id = "a", DisplayName = "Alpha", Mail = "alpha@ucdavis.edu", AccountEnabled = true, UserType = "Member" },
            new() { Id = "b", DisplayName = "Bravo", Mail = "bravo@ucdavis.edu", AccountEnabled = true, UserType = "Member" },
            new() { Id = "e", DisplayName = "Echo", Mail = "echo@ucdavis.edu", AccountEnabled = true, UserType = "Member" },
            new() { Id = "d", DisplayName = "Delta", Mail = "delta@ucdavis.edu", AccountEnabled = true, UserType = "Member" },
            new() { Id = "f", DisplayName = "Foxtrot", Mail = "foxtrot@ucdavis.edu", AccountEnabled = true, UserType = "Member" },
            new() { Id = "a", DisplayName = "Alpha Duplicate", Mail = "alpha-dup@ucdavis.edu", AccountEnabled = true, UserType = "Member" },
        };

        var results = GraphService.BuildValidSearchResults(users);

        results.Should().HaveCount(5);
        results.Select(x => x.Id).Should().ContainInOrder("a", "b", "c", "d", "e");
        results.First(x => x.Id == "a").Email.Should().Be("alpha@ucdavis.edu");
    }
}
