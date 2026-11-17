using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Server.Controllers;
using Server.Tests;
using server.core.Domain;

namespace server.tests.Controllers;

public sealed partial class ProjectionsControllerTests
{
    private const string SalaryBudget = "01 - Salaries and Wages";
    private const string FringeBudget = "02 - Fringe Benefits";

    private static List<ProjectionFundingSource> BudgetSources()
    {
        var imported = NewTaskSource();
        imported.ProjectType = "Sponsored";
        imported.CategoryAdjustments = [new() { ExpenditureCategory = SalaryBudget, Amount = -100 }, new() { ExpenditureCategory = FringeBudget, Amount = 100 }];
        return [imported,
            new() { Id = 2, Name = "Initial pool", SourceKind = ProjectionSourceKind.Planned, PlannedBudgetMode = ProjectionPlannedBudgetMode.GeneralPool, InitialPlannedBalance = 5000, BalanceAdjustment = -250, CapturedAt = SourceCapture, StartDate = new(2026, 12, 1) },
            new() { Id = 3, Name = "Initial categories", SourceKind = ProjectionSourceKind.Planned, PlannedBudgetMode = ProjectionPlannedBudgetMode.Categories, CapturedAt = SourceCapture, StartDate = new(2026, 12, 1),
                Budgets = [new() { ExpenditureCategory = SalaryBudget, Budget = 1000 }, new() { ExpenditureCategory = FringeBudget, Budget = 0 }],
                CategoryAdjustments = [new() { ExpenditureCategory = SalaryBudget, Amount = -1500 }, new() { ExpenditureCategory = Supplies, Amount = 0 }] }
        ];
    }

    [Fact]
    public async Task Category_definitions_and_net_deltas_round_trip_and_duplicate_without_live_financial_reads()
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var saved = await CreateProjectionAsync(ctx);
        var controller = CreateController(ctx, financialViewer: true);
        var sources = BudgetSources();
        var original = JsonSerializer.Serialize(sources);
        var result = (OkObjectResult)await controller.Save(saved.Id, Draft(saved) with { Content = saved.Content with { FundingSources = sources } }, default);
        var updated = (Projection)result.Value!;
        ctx.ChangeTracker.Clear();
        var loaded = (Projection)((OkObjectResult)await controller.Get(saved.Id, default)).Value!;
        JsonSerializer.Serialize(loaded.Content.FundingSources).Should().Be(original);
        var copied = (Projection)((OkObjectResult)await controller.Duplicate(updated.Id, new("Budget copy", Guid.NewGuid()), default)).Value!;
        copied.Content.FundingSources.Should().BeEquivalentTo(sources);
        copied.Content.FundingSources[2].CategoryAdjustments.Should().Contain(row => row.ExpenditureCategory == Supplies && row.Amount == 0);
        copied.Content.FundingSources[0].Budgets.Should().BeEquivalentTo(sources[0].Budgets);
        copied.Content.FundingSources[0].Actuals.Should().BeEquivalentTo(sources[0].Actuals);
    }

    [Theory]
    [InlineData("category-pool-delta")]
    [InlineData("duplicate-delta")]
    [InlineData("invalid-category")]
    [InlineData("unknown-category-code")]
    [InlineData("duplicate-category-code")]
    [InlineData("subcent-delta")]
    [InlineData("subcent-initial")]
    [InlineData("null-deltas")]
    [InlineData("general-category-delta")]
    [InlineData("planned-missing-mode")]
    [InlineData("planned-invalid-mode")]
    [InlineData("pool-category-baseline")]
    [InlineData("categories-pool-baseline")]
    [InlineData("planned-spending")]
    [InlineData("planned-actual")]
    [InlineData("imported-planned-mode")]
    [InlineData("imported-pool-baseline")]
    public async Task Rejects_incoherent_budget_documents_atomically(string invalid)
    {
        using var ctx = TestDbContextFactory.CreateInMemory();
        var saved = await CreateProjectionAsync(ctx);
        var before = JsonSerializer.Serialize(saved.Content);
        var controller = CreateController(ctx, financialViewer: true);
        var sources = BudgetSources();
        switch (invalid)
        {
            case "category-pool-delta": sources[0].BalanceAdjustment = 1; break;
            case "duplicate-delta": sources[0].CategoryAdjustments.Add(new() { ExpenditureCategory = SalaryBudget, Amount = 0 }); break;
            case "invalid-category": sources[0].CategoryAdjustments[0].ExpenditureCategory = "Invented"; break;
            case "unknown-category-code": sources[0].CategoryAdjustments[0].ExpenditureCategory = "99 - Unknown"; break;
            case "duplicate-category-code": sources[0].CategoryAdjustments.Add(new() { ExpenditureCategory = "01 - Different label", Amount = 5 }); break;
            case "subcent-delta": sources[0].CategoryAdjustments[0].Amount = 1.125m; break;
            case "subcent-initial": sources[2].Budgets[0].Budget = 1.125m; break;
            case "null-deltas": sources[0].CategoryAdjustments = null!; break;
            case "general-category-delta": sources[0].ProjectType = "Internal"; break;
            case "planned-missing-mode": sources[1].PlannedBudgetMode = null; break;
            case "planned-invalid-mode": sources[1].PlannedBudgetMode = (ProjectionPlannedBudgetMode)99; break;
            case "pool-category-baseline": sources[1].Budgets.Add(new() { ExpenditureCategory = SalaryBudget }); break;
            case "categories-pool-baseline": sources[2].InitialPlannedBalance = 1; break;
            case "planned-spending": sources[2].Budgets[0].SpentToDate = 1; break;
            case "planned-actual": sources[2].Actuals.Add(new() { ExpenditureCategory = SalaryBudget, Month = new(2026, 12, 1), Amount = 1 }); break;
            case "imported-planned-mode": sources[0].PlannedBudgetMode = ProjectionPlannedBudgetMode.Categories; break;
            case "imported-pool-baseline": sources[0].InitialPlannedBalance = 1; break;
        }
        (await controller.Save(saved.Id, Draft(saved) with { Content = saved.Content with { FundingSources = sources } }, default)).Should().BeOfType<BadRequestObjectResult>();
        JsonSerializer.Serialize(saved.Content).Should().Be(before);
    }
}
