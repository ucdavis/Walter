using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Server.Tests;
using server.core.Domain;
using server.core.Models;

namespace server.tests.Controllers;

public sealed partial class ProjectionsControllerTests
{
    [Theory]
    [InlineData("id-zero")]
    [InlineData("duplicate-id")]
    [InlineData("kind")]
    [InlineData("description")]
    [InlineData("category")]
    [InlineData("salary")]
    [InlineData("fringe")]
    [InlineData("start-day")]
    [InlineData("end-day")]
    [InlineData("reversed-months")]
    [InlineData("one-time-end")]
    [InlineData("null-expense")]
    [InlineData("null-override")]
    [InlineData("override-category")]
    [InlineData("override-salary")]
    [InlineData("override-fringe")]
    [InlineData("override-equipment")]
    [InlineData("duplicate-override")]
    public async Task Create_save_and_duplicate_reject_invalid_expenses_without_mutating_a_saved_plan(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var stored = await StoreCapturedPlanAsync(ctx);
        var before = JsonSerializer.Serialize(stored);
        var draft = Draft(stored);
        var source = draft.FundingSources.Single();
        var expense = source.Expenses.Single();
        expense.Kind = ProjectionExpenseKind.Monthly;
        switch (invalid)
        {
            case "id-zero": expense.Id = 0; break;
            case "duplicate-id": source.Expenses.Add(expense); break;
            case "kind": expense.Kind = (ProjectionExpenseKind)99; break;
            case "description": expense.Description = "  "; break;
            case "category": expense.ExpenditureCategory = ""; break;
            case "salary": expense.ExpenditureCategory = " 01 - Salaries and Wages"; break;
            case "fringe": expense.ExpenditureCategory = "02-Fringe Benefits"; break;
            case "start-day": expense.StartMonth = new(2026, 6, 2); break;
            case "end-day": expense.EndMonth = new(2026, 6, 30); break;
            case "reversed-months": expense.EndMonth = expense.StartMonth.AddMonths(-1); break;
            case "one-time-end": expense.Kind = ProjectionExpenseKind.OneTime; expense.EndMonth = expense.StartMonth; break;
            case "null-expense": source.Expenses.Add(null!); break;
            case "null-override": source.HistoricalExpenseOverrides.Add(null!); break;
            case "override-category": source.HistoricalExpenseOverrides.Single().ExpenditureCategory = " "; break;
            case "override-salary": source.HistoricalExpenseOverrides.Single().ExpenditureCategory = "01"; break;
            case "override-fringe": source.HistoricalExpenseOverrides.Single().ExpenditureCategory = "02 Fringe Benefits"; break;
            case "override-equipment": source.HistoricalExpenseOverrides.Single().ExpenditureCategory = "04 - Equipment and Facilities"; break;
            case "duplicate-override": source.HistoricalExpenseOverrides.Add(new() { ExpenditureCategory = $" {Supplies} ", Amount = 0 }); break;
        }
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());
        var snapshot = new ProjectionDraft(draft.Name, draft.HistoryMonths, stored.SeededAt, draft.FundingSources, draft.Appointments);

        (await controller.Create(PiIam, new(snapshot, Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Save(stored.Id, draft, default)).Should().BeOfType<BadRequestObjectResult>();
        JsonSerializer.Serialize(stored).Should().Be(before);
        ctx.ChangeTracker.HasChanges().Should().BeFalse();

        stored.FundingSources = draft.FundingSources;
        await ctx.SaveChangesAsync();
        (await controller.Duplicate(stored.Id, new("Invalid copy", Guid.NewGuid()), default)).Should().BeOfType<BadRequestObjectResult>();
        ctx.Projections.Should().ContainSingle();
    }

    [Fact]
    public async Task Signed_expenses_and_overrides_round_trip_with_source_local_ids_and_without_selected_window_history()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var request = NewPlanRequest();
        var source = request.Draft!.FundingSources.Single();
        source.HistoricalExpenseOverrides =
        [
            new() { ExpenditureCategory = Supplies, Amount = 20 },
            new() { ExpenditureCategory = "06 - Travel", Amount = 0 },
            new() { ExpenditureCategory = "08 - Fellowship & Scholarships", Amount = -25.50m },
        ];
        source.Expenses =
        [
            new() { Id = 1, Kind = ProjectionExpenseKind.Monthly, Description = "Supplies credit", ExpenditureCategory = Supplies, Amount = -25.50m, StartMonth = new(2026, 1, 1), EndMonth = new(2026, 2, 1) },
            new() { Id = 2, Kind = ProjectionExpenseKind.Monthly, Description = "Disabled monthly expense", ExpenditureCategory = Supplies, Amount = 0, StartMonth = new(2026, 1, 1) },
            new() { Id = 3, Kind = ProjectionExpenseKind.OneTime, Description = "Equipment", ExpenditureCategory = "04 - Equipment and Facilities", Amount = 250, StartMonth = new(2026, 1, 1) },
        ];
        var other = NewTaskSource();
        other.Expenses.Add(new() { Id = 1, Kind = ProjectionExpenseKind.OneTime, Description = "Travel credit", ExpenditureCategory = "06 - Travel", Amount = -50, StartMonth = new(2027, 2, 1) });
        request.Draft.FundingSources.Add(other);
        var expected = JsonSerializer.Serialize(request.Draft.FundingSources);
        var controller = CreateController(ctx, financialViewer: true, dataSource: UnavailableProjectionData());

        var created = Document(await controller.Create(PiIam, request, default));
        var saved = Document(await controller.Save(created.Id, Draft(created, 3), default));
        ctx.ChangeTracker.Clear();
        var reopened = Document(await controller.Get(saved.Id, default));
        JsonSerializer.Serialize(reopened.FundingSources).Should().Be(expected);
        var duplicate = Document(await controller.Duplicate(reopened.Id, new("Expense alternative", Guid.NewGuid()), default));
        JsonSerializer.Serialize(duplicate.FundingSources).Should().Be(expected);

        var restored = Draft(reopened);
        restored.FundingSources.Single(s => s.Id == source.Id).HistoricalExpenseOverrides.RemoveAt(0);
        var restoredPlan = Document(await controller.Save(reopened.Id, restored, default));
        restoredPlan.FundingSources.Single(s => s.Id == source.Id).Expenses.Should().BeEquivalentTo(source.Expenses);
        duplicate.FundingSources.Single(s => s.Id == source.Id).HistoricalExpenseOverrides.Should().HaveCount(3);
    }
}
