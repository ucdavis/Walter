using FluentAssertions;
using server.core.Data;
using server.core.Services;
using Server.Tests;

namespace server.tests.Services;

public sealed class GLReconciliationInclusionsServiceTests
{
    [Fact]
    public async Task GetInclusionsAsync_returns_empty_when_none()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        var result = await svc.GetInclusionsAsync();

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task AddInclusionAsync_persists_and_returns_inclusion()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);
        var userId = Guid.NewGuid().ToString();

        var result = await svc.AddInclusionAsync("173421", "test note", userId);

        result.AccountingSequenceNumber.Should().Be("173421");
        result.Note.Should().Be("test note");
        result.CreatedBy.Should().Be(userId);
        result.CreatedOnUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));

        ctx.GLReconciliationInclusions.Should().ContainSingle(x => x.AccountingSequenceNumber == "173421");
    }

    [Fact]
    public async Task AddInclusionAsync_rejects_non_numeric_asn()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        Func<Task> act = () => svc.AddInclusionAsync("ABC123", null, "user-id");

        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task AddInclusionAsync_rejects_empty_asn()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        Func<Task> act = () => svc.AddInclusionAsync("", null, "user-id");

        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task AddInclusionAsync_rejects_duplicate()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        await svc.AddInclusionAsync("173421", null, "user-id");
        Func<Task> act = () => svc.AddInclusionAsync("173421", "different note", "user-id");

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task RemoveInclusionAsync_returns_true_and_removes_entry()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        await svc.AddInclusionAsync("173421", null, "user-id");

        var removed = await svc.RemoveInclusionAsync("173421");

        removed.Should().BeTrue();
        ctx.GLReconciliationInclusions.Should().BeEmpty();
    }

    [Fact]
    public async Task RemoveInclusionAsync_returns_false_when_not_found()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        var removed = await svc.RemoveInclusionAsync("999999");

        removed.Should().BeFalse();
    }

    [Fact]
    public async Task GetInclusionsAsync_returns_entries_ordered_by_asn()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        await svc.AddInclusionAsync("999999", null, "user-id");
        await svc.AddInclusionAsync("100001", null, "user-id");

        var result = await svc.GetInclusionsAsync();

        result.Select(x => x.AccountingSequenceNumber).Should().BeInAscendingOrder();
    }

    [Fact]
    public async Task GetInclusionsAsync_orders_lexicographically_by_asn()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var svc = new GLReconciliationInclusionsService(ctx);

        await svc.AddInclusionAsync("9", null, "user-id");
        await svc.AddInclusionAsync("10", null, "user-id");
        await svc.AddInclusionAsync("100", null, "user-id");

        var result = await svc.GetInclusionsAsync();

        // Ordering is lexicographic (string PK) — "10" < "100" < "9"
        result.Select(x => x.AccountingSequenceNumber)
            .Should().ContainInOrder("10", "100", "9");
    }
}
