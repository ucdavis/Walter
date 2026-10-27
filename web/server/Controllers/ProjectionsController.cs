using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;
using server.core.Models;
using server.core.Services;
using server.Helpers;
using server.Services;
using Server.Services;

namespace Server.Controllers;

/// <summary>Per-PI budget projections. Anyone who can view the PI's portfolio can read and edit them.</summary>
public sealed class ProjectionsController(
    AppDbContext db,
    IDatamartService datamart,
    IAuthorizationService authorization,
    IUserService users,
    PpmPortfolioService portfolio,
    ProjectionSeeder seeder,
    IProjectionDataSource data) : ApiControllerBase
{
    private static readonly int[] Windows = [3, 6, 12];

    public sealed record ProjectionSummary(int Id, string Name, DateTime SeededAt, string? UpdatedBy, DateTime UpdatedAt);
    public sealed record CreateProjectionRequest(string Name, int HistoryMonths);
    public sealed record RenameProjectionRequest(string Name);
    public sealed record HistoryMonthsRequest(int HistoryMonths);
    public sealed record ProjectionLookups(IReadOnlyList<JobCodeRecord> JobCodes, IReadOnlyList<string> ExpenditureCategories);

    [HttpGet("by-iam/{iamId}")]
    public async Task<IActionResult> ListByIam(string iamId, CancellationToken ct)
    {
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        return Ok(await db.Projections
            .Where(p => p.PiEmployeeId == piEmployeeId)
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new ProjectionSummary(p.Id, p.Name, p.SeededAt, p.UpdatedBy, p.UpdatedAt))
            .ToListAsync(ct));
    }

    [HttpPost("by-iam/{iamId}")]
    public async Task<IActionResult> Create(string iamId, CreateProjectionRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (piEmployeeId, error) = await ResolvePiAsync(iamId, ct);
        if (error is not null) return error;

        var projection = new Projection
        {
            PiEmployeeId = piEmployeeId!,
            PiIamId = iamId,
            Name = request.Name,
            CreatedBy = User.GetUserIdentifier(),
            CreatedAt = DateTime.UtcNow,
        };
        Touch(projection);
        await seeder.SeedAsync(projection, request.HistoryMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        db.Projections.Add(projection);
        await db.SaveChangesAsync(ct);
        return Ok(projection);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct)
    {
        var (projection, error) = await LoadAsync(id, ct);
        return error ?? Ok(projection);
    }

    [HttpPatch("{id:int}")]
    public async Task<IActionResult> Rename(int id, RenameProjectionRequest request, CancellationToken ct)
    {
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        projection!.Name = request.Name;
        Touch(projection);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        db.Projections.Remove(projection!);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Discards all edits and reseeds from current data; id, name, and creator are kept.</summary>
    [HttpPost("{id:int}/reset")]
    public async Task<IActionResult> Reset(int id, HistoryMonthsRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        db.ProjectionJobs.RemoveRange(projection!.Jobs);
        db.ProjectionProjects.RemoveRange(projection.Projects);
        await seeder.SeedAsync(projection, request.HistoryMonths, User.GetUserIdentifier(), User.GetEmulatingUser(), ct);
        Touch(projection);
        await db.SaveChangesAsync(ct);
        return Ok(projection);
    }

    /// <summary>Regenerates Projected expenses for a new averaging window; touches nothing else.</summary>
    [HttpPost("{id:int}/history-months")]
    public async Task<IActionResult> HistoryMonths(int id, HistoryMonthsRequest request, CancellationToken ct)
    {
        if (!Windows.Contains(request.HistoryMonths)) return BadRequest("HistoryMonths must be 3, 6, or 12.");
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        ProjectionSeeder.ApplyRunRates(projection!, request.HistoryMonths);
        Touch(projection!);
        await db.SaveChangesAsync(ct);
        return Ok(projection);
    }

    // Child CRUD. Bodies are the entities; ids, parent ids, and IsSeeded come from the route or the existing row,
    // and every lookup stays inside the loaded projection so ids from another projection 404.

    [HttpPost("{id:int}/projects")]
    public Task<IActionResult> CreateProject(int id, ProjectionProject body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        body.Id = 0;
        body.IsSeeded = false;
        body.Budgets = []; body.Actuals = []; body.RunRates = []; body.Expenses = [];
        p.Projects.Add(body);
        return Ok(body);
    });

    [HttpPut("{id:int}/projects/{projectId:int}")]
    public Task<IActionResult> UpdateProject(int id, int projectId, ProjectionProject body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var project = p.Projects.SingleOrDefault(x => x.Id == projectId);
        if (project is null) return NotFound();
        (body.Id, body.ProjectionId, body.IsSeeded) = (project.Id, project.ProjectionId, project.IsSeeded);
        db.Entry(project).CurrentValues.SetValues(body);
        return Ok(project);
    });

    /// <summary>Funding entries on the project are detached (EF nulls their tracked FK), not deleted.</summary>
    [HttpDelete("{id:int}/projects/{projectId:int}")]
    public Task<IActionResult> DeleteProject(int id, int projectId, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var project = p.Projects.SingleOrDefault(x => x.Id == projectId);
        if (project is null) return NotFound();
        db.Remove(project);
        return NoContent();
    });

    [HttpPost("{id:int}/projects/{projectId:int}/budgets")]
    public Task<IActionResult> CreateBudget(int id, int projectId, ProjectionBudget body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var project = p.Projects.SingleOrDefault(x => x.Id == projectId);
        if (project is null) return NotFound();
        (body.Id, body.IsSeeded, body.SpentToDate, body.Committed) = (0, false, 0, 0);
        project.Budgets.Add(body);
        return Ok(body);
    });

    [HttpPut("{id:int}/projects/{projectId:int}/budgets/{budgetId:int}")]
    public Task<IActionResult> UpdateBudget(int id, int projectId, int budgetId, ProjectionBudget body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var budget = p.Projects.SingleOrDefault(x => x.Id == projectId)?.Budgets.SingleOrDefault(x => x.Id == budgetId);
        if (budget is null) return NotFound();
        (body.Id, body.ProjectionProjectId, body.IsSeeded, body.SpentToDate, body.Committed) =
            (budget.Id, budget.ProjectionProjectId, budget.IsSeeded, budget.SpentToDate, budget.Committed);
        db.Entry(budget).CurrentValues.SetValues(body);
        return Ok(budget);
    });

    [HttpDelete("{id:int}/projects/{projectId:int}/budgets/{budgetId:int}")]
    public Task<IActionResult> DeleteBudget(int id, int projectId, int budgetId, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var budget = p.Projects.SingleOrDefault(x => x.Id == projectId)?.Budgets.SingleOrDefault(x => x.Id == budgetId);
        if (budget is null) return NotFound();
        db.Remove(budget);
        return NoContent();
    });

    [HttpPost("{id:int}/jobs")]
    public Task<IActionResult> CreateJob(int id, ProjectionJob body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        (body.Id, body.IsSeeded, body.FundingEntries) = (0, false, []);
        p.Jobs.Add(body);
        return Ok(body);
    });

    [HttpPut("{id:int}/jobs/{jobId:int}")]
    public Task<IActionResult> UpdateJob(int id, int jobId, ProjectionJob body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var job = p.Jobs.SingleOrDefault(x => x.Id == jobId);
        if (job is null) return NotFound();
        (body.Id, body.ProjectionId, body.IsSeeded) = (job.Id, job.ProjectionId, job.IsSeeded);
        db.Entry(job).CurrentValues.SetValues(body);
        return Ok(job);
    });

    [HttpDelete("{id:int}/jobs/{jobId:int}")]
    public Task<IActionResult> DeleteJob(int id, int jobId, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var job = p.Jobs.SingleOrDefault(x => x.Id == jobId);
        if (job is null) return NotFound();
        db.Remove(job);
        return NoContent();
    });

    [HttpPost("{id:int}/jobs/{jobId:int}/funding")]
    public Task<IActionResult> CreateFunding(int id, int jobId, ProjectionFundingEntry body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var job = p.Jobs.SingleOrDefault(x => x.Id == jobId);
        if (job is null || !InProjection(p, body.ProjectionProjectId)) return NotFound();
        (body.Id, body.IsSeeded) = (0, false);
        job.FundingEntries.Add(body);
        return Ok(body);
    });

    [HttpPut("{id:int}/jobs/{jobId:int}/funding/{fundingId:int}")]
    public Task<IActionResult> UpdateFunding(int id, int jobId, int fundingId, ProjectionFundingEntry body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var entry = p.Jobs.SingleOrDefault(x => x.Id == jobId)?.FundingEntries.SingleOrDefault(x => x.Id == fundingId);
        if (entry is null || !InProjection(p, body.ProjectionProjectId)) return NotFound();
        (body.Id, body.ProjectionJobId, body.IsSeeded) = (entry.Id, entry.ProjectionJobId, entry.IsSeeded);
        db.Entry(entry).CurrentValues.SetValues(body);
        return Ok(entry);
    });

    [HttpDelete("{id:int}/jobs/{jobId:int}/funding/{fundingId:int}")]
    public Task<IActionResult> DeleteFunding(int id, int jobId, int fundingId, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var entry = p.Jobs.SingleOrDefault(x => x.Id == jobId)?.FundingEntries.SingleOrDefault(x => x.Id == fundingId);
        if (entry is null) return NotFound();
        db.Remove(entry);
        return NoContent();
    });

    [HttpPost("{id:int}/expenses")]
    public Task<IActionResult> CreateExpense(int id, ProjectionExpense body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        if (body.Kind == ProjectionExpenseKind.Projected) return BadRequest("Projected expenses are generated from run-rates.");
        if (body.Kind == ProjectionExpenseKind.OneTime && body.StartMonth is null) return BadRequest("One-time expenses need a month.");
        var project = p.Projects.SingleOrDefault(x => x.Id == body.ProjectionProjectId);
        if (project is null) return NotFound();
        body.Id = 0;
        project.Expenses.Add(body);
        return Ok(body);
    });

    /// <summary>Editing a Projected expense makes it Monthly so a later window change keeps the edit.</summary>
    [HttpPut("{id:int}/expenses/{expenseId:int}")]
    public Task<IActionResult> UpdateExpense(int id, int expenseId, ProjectionExpense body, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        if (body.Kind == ProjectionExpenseKind.OneTime && body.StartMonth is null) return BadRequest("One-time expenses need a month.");
        var expense = p.Projects.SelectMany(x => x.Expenses).SingleOrDefault(x => x.Id == expenseId);
        if (expense is null || p.Projects.All(x => x.Id != body.ProjectionProjectId)) return NotFound();
        if (body.Kind == ProjectionExpenseKind.Projected) body.Kind = ProjectionExpenseKind.Monthly;
        body.Id = expense.Id;
        db.Entry(expense).CurrentValues.SetValues(body);
        return Ok(expense);
    });

    [HttpDelete("{id:int}/expenses/{expenseId:int}")]
    public Task<IActionResult> DeleteExpense(int id, int expenseId, CancellationToken ct) => MutateAsync(id, ct, p =>
    {
        var expense = p.Projects.SelectMany(x => x.Expenses).SingleOrDefault(x => x.Id == expenseId);
        if (expense is null) return NotFound();
        db.Remove(expense);
        return NoContent();
    });

    [HttpGet("lookups")]
    public async Task<IActionResult> Lookups(CancellationToken ct) =>
        Ok(new ProjectionLookups(await data.GetJobCodesAsync(ct), await data.GetExpenditureCategoriesAsync(ct)));

    /// <summary>Loads the full graph and applies the PI portfolio access rule.</summary>
    internal async Task<(Projection? projection, IActionResult? error)> LoadAsync(int id, CancellationToken ct)
    {
        var projection = await db.Projections
            .Include(p => p.Projects).ThenInclude(p => p.Budgets)
            .Include(p => p.Projects).ThenInclude(p => p.Actuals)
            .Include(p => p.Projects).ThenInclude(p => p.RunRates)
            .Include(p => p.Projects).ThenInclude(p => p.Expenses)
            .Include(p => p.Jobs).ThenInclude(j => j.FundingEntries)
            .AsSplitQuery()
            .SingleOrDefaultAsync(p => p.Id == id, ct);
        if (projection is null) return (null, NotFound());
        return await CanAccessPiAsync(projection.PiEmployeeId, ct) ? (projection, null) : (null, Forbid());
    }

    /// <summary>Loads with access checks, applies a change, and saves once only when the change succeeded.</summary>
    private async Task<IActionResult> MutateAsync(int id, CancellationToken ct, Func<Projection, IActionResult> change)
    {
        var (projection, error) = await LoadAsync(id, ct);
        if (error is not null) return error;

        var result = change(projection!);
        if (result is not (OkObjectResult or NoContentResult)) return result;
        Touch(projection!);
        await db.SaveChangesAsync(ct);
        return result;
    }

    /// <summary>Null means outside the portfolio; otherwise the project must belong to this projection.</summary>
    private static bool InProjection(Projection projection, int? projectId) =>
        projectId is null || projection.Projects.Any(x => x.Id == projectId);

    /// <summary>Any child change bumps the projection's audit fields.</summary>
    internal void Touch(Projection projection)
    {
        projection.UpdatedBy = User.GetUserIdentifier();
        projection.UpdatedAt = DateTime.UtcNow;
    }

    private async Task<bool> IsFinancialViewerAsync() =>
        (await authorization.AuthorizeAsync(User, null, AuthorizationHelper.Policies.CanViewFinancials)).Succeeded;

    /// <summary>CanViewFinancials, the PI themselves, or PI/PM on any of the PI's projects.</summary>
    private async Task<bool> CanAccessPiAsync(string piEmployeeId, CancellationToken ct) =>
        await IsFinancialViewerAsync()
        || await portfolio.IsOnAnyProjectForPiAsync(await GetCurrentEmployeeIdAsync(ct), piEmployeeId, ct);

    private async Task<(string? piEmployeeId, IActionResult? error)> ResolvePiAsync(string iamId, CancellationToken ct)
    {
        var person = await datamart.GetSearchablePersonByIamIdAsync(iamId, ct);
        // Restricted callers must not be able to tell unknown IAM ids from inaccessible portfolios.
        if (person is null) return (null, await IsFinancialViewerAsync() ? NotFound() : Forbid());
        return await CanAccessPiAsync(person.EmployeeId, ct) ? (person.EmployeeId, null) : (null, Forbid());
    }

    private async Task<string?> GetCurrentEmployeeIdAsync(CancellationToken ct) =>
        (await users.GetByIdAsync(User.GetUserId(), ct))?.EmployeeId;
}
