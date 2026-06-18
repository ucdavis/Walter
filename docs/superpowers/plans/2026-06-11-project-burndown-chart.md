# Project Burndown Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose `dbo.usp_GetProjectProjection` (PR #304) via a new API endpoint and render a multi-series burndown chart with category toggle buttons on the project detail page.

**Architecture:** One endpoint returns the sproc's two result sets in an envelope (`categories` header + `periods` grid). All rollup/series math lives in a pure frontend module (`lib/projectProjection.ts`); the chart component only renders. Spec: `docs/superpowers/specs/2026-06-11-project-burndown-chart-design.md`.

**Tech Stack:** ASP.NET Core + Dapper (`QueryMultipleAsync`) + Polly, xUnit/FluentAssertions; React + TanStack Query + Recharts, vitest + msw.

**Delivery:** Exactly two feature commits on `rpm/projections-api-frontend`: (1) API, (2) frontend. One PR.

**Working directory:** `/Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend` (already an isolated worktree).

---

## Task 1: Backend — models and DatamartService method

**Files:**
- Create: `web/server.core/Models/ProjectProjectionResult.cs`
- Modify: `web/server.core/Services/DatamartService.cs` (interface ~line 81, implementation ~line 290)

The sproc emits `IsPersonnel` as `CASE … THEN 1 ELSE 0` (INT, not BIT), so the C# property is `int` — Dapper int→bool mapping is unreliable, and the frontend needs the flag anyway (it drives the Personnel rollup) so it ships as a number.

- [ ] **Step 1: Create the models file**

```csharp
using System.Text.Json.Serialization;

namespace server.core.Models;

/// <summary>
/// Maps result set 1 of usp_GetProjectProjection: per-expenditure-category budget header.
/// </summary>
public sealed class ProjectProjectionCategory
{
    [JsonPropertyName("expenditureCategory")]
    public string ExpenditureCategory { get; set; } = "";

    // The sproc emits 1/0 as INT, which Dapper cannot reliably map to bool.
    [JsonPropertyName("isPersonnel")]
    public int IsPersonnel { get; set; }

    [JsonPropertyName("budget")]
    public decimal Budget { get; set; }

    [JsonPropertyName("spentToDate")]
    public decimal SpentToDate { get; set; }

    [JsonPropertyName("committed")]
    public decimal Committed { get; set; }

    [JsonPropertyName("remainingNow")]
    public decimal RemainingNow { get; set; }
}

/// <summary>
/// Maps result set 2 of usp_GetProjectProjection: one row per period x category,
/// covering 3 trailing actual months, the blended current month, and 12 projected months.
/// </summary>
public sealed class ProjectProjectionPeriod
{
    /// <summary>'YYYY-MM'.</summary>
    [JsonPropertyName("month")]
    public string Month { get; set; } = "";

    /// <summary>'Mmm-yy' display label.</summary>
    [JsonPropertyName("displayPeriod")]
    public string DisplayPeriod { get; set; } = "";

    /// <summary>'actual', 'blended', or 'projected'.</summary>
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    [JsonPropertyName("expenditureCategory")]
    public string ExpenditureCategory { get; set; } = "";

    // The sproc emits 1/0 as INT, which Dapper cannot reliably map to bool.
    [JsonPropertyName("isPersonnel")]
    public int IsPersonnel { get; set; }

    [JsonPropertyName("actualAmount")]
    public decimal ActualAmount { get; set; }

    [JsonPropertyName("projectedAmount")]
    public decimal ProjectedAmount { get; set; }

    /// <summary>Running budget remaining (burndown), anchored at the category's current balance.</summary>
    [JsonPropertyName("remaining")]
    public decimal Remaining { get; set; }
}

/// <summary>
/// Envelope for both result sets of usp_GetProjectProjection.
/// </summary>
public sealed class ProjectProjectionResult
{
    [JsonPropertyName("categories")]
    public IReadOnlyList<ProjectProjectionCategory> Categories { get; set; } =
        Array.Empty<ProjectProjectionCategory>();

    [JsonPropertyName("periods")]
    public IReadOnlyList<ProjectProjectionPeriod> Periods { get; set; } =
        Array.Empty<ProjectProjectionPeriod>();
}
```

- [ ] **Step 2: Add the method to `IDatamartService`** (after `GetGLTransactionListingsAsync`, ~line 80):

```csharp
    Task<ProjectProjectionResult> GetProjectProjectionAsync(
        string projectNumber, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default);
```

- [ ] **Step 3: Add the implementation to `DatamartService`** (after `GetGLTransactionListingsAsync`, ~line 290). `ExecuteSprocAsync` only handles a single grid, so this method opens the connection itself with the same retry policy:

```csharp
    public async Task<ProjectProjectionResult> GetProjectProjectionAsync(
        string projectNumber, string? applicationUser = null, string? emulatingUser = null, CancellationToken ct = default)
    {
        return await _retry.ExecuteAsync(async ct2 =>
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync(ct2);

            var cmd = new CommandDefinition(
                commandText: "dbo.usp_GetProjectProjection",
                parameters: new { ProjectId = projectNumber, ApplicationName = _appName, ApplicationUser = applicationUser, EmulatingUser = emulatingUser },
                commandType: CommandType.StoredProcedure,
                commandTimeout: 60,
                cancellationToken: ct2);

            await using var grid = await conn.QueryMultipleAsync(cmd);
            var categories = (await grid.ReadAsync<ProjectProjectionCategory>()).AsList();
            var periods = (await grid.ReadAsync<ProjectProjectionPeriod>()).AsList();

            return new ProjectProjectionResult
            {
                Categories = categories,
                Periods = periods,
            };
        }, ct);
    }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web && dotnet build server.core`
Expected: Build succeeded. (If the path is a solution-level layout, `dotnet build` whatever `.csproj` is in `web/server.core/`.)
Expected failure right now in dependent projects: `server.tests` has a `ResolvingDatamartService` fake implementing `IDatamartService` — it won't compile until Task 2 adds the new member to it. Building only `server.core` avoids that; full-solution build is verified at the end of Task 2.

## Task 2: Backend — controller endpoint + tests (TDD)

**Files:**
- Modify: `web/tests/server.tests/Controllers/ProjectControllerTests.cs`
- Modify: `web/server/Controllers/ProjectController.cs` (new endpoint after `GetGLPPMReconciliationAsync`, ~line 264)

- [ ] **Step 1: Extend the `ResolvingDatamartService` test fake** in `ProjectControllerTests.cs`. Add an optional projection to the constructor and the new interface member (other data methods in this fake throw; this one throws unless a projection was provided):

```csharp
        private readonly SearchablePersonRecord? _person;
        private readonly ProjectProjectionResult? _projection;

        public ResolvingDatamartService(
            SearchablePersonRecord? person = null,
            ProjectProjectionResult? projection = null)
        {
            _person = person;
            _projection = projection;
        }
```

and (alongside the other throwing members):

```csharp
        public Task<ProjectProjectionResult> GetProjectProjectionAsync(
            string projectNumber,
            string? applicationUser = null,
            string? emulatingUser = null,
            CancellationToken ct = default)
        {
            return _projection is not null
                ? Task.FromResult(_projection)
                : throw new InvalidOperationException("Datamart should not be called for unauthorized users.");
        }
```

- [ ] **Step 2: Write the two failing tests** (in the test class body, after the existing facts). `Role.Names.FinancialViewer` lives in `web/server.core/Domain/Role.cs` — check that class's namespace and add a `using` if the file doesn't already have it in scope:

```csharp
    [Fact]
    public async Task GetProjection_returns_forbid_when_user_lacks_financial_access()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var controller = new ProjectController(
            new ThrowingFinancialApiService(),
            new ResolvingDatamartService(),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: []),
                },
            },
        };

        var result = await controller.GetProjectionAsync("PROJ-001", CancellationToken.None);

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetProjection_returns_envelope_for_financial_viewer()
    {
        using AppDbContext ctx = TestDbContextFactory.CreateInMemory();
        var authorizationService = CreateAuthorizationService();

        var projection = new ProjectProjectionResult
        {
            Categories = new[]
            {
                new ProjectProjectionCategory
                {
                    ExpenditureCategory = "01 - Salaries and Wages",
                    IsPersonnel = 1,
                    Budget = 500m,
                    SpentToDate = 100m,
                    Committed = 0m,
                    RemainingNow = 400m,
                },
            },
            Periods = new[]
            {
                new ProjectProjectionPeriod
                {
                    Month = "2026-06",
                    DisplayPeriod = "Jun-26",
                    Kind = "blended",
                    ExpenditureCategory = "01 - Salaries and Wages",
                    IsPersonnel = 1,
                    ActualAmount = 0m,
                    ProjectedAmount = 50m,
                    Remaining = 350m,
                },
            },
        };

        var controller = new ProjectController(
            new ThrowingFinancialApiService(),
            new ResolvingDatamartService(projection: projection),
            authorizationService,
            new UserService(NullLogger<UserService>.Instance, ctx))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreateUser(roles: [Role.Names.FinancialViewer]),
                },
            },
        };

        var result = await controller.GetProjectionAsync("PROJ-001", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Which;
        var envelope = ok.Value.Should().BeOfType<ProjectProjectionResult>().Which;
        envelope.Categories.Should().HaveCount(1);
        envelope.Periods.Should().HaveCount(1);
        envelope.Periods[0].Remaining.Should().Be(350m);
    }
```

Why these pass authorization correctly:
- Forbid case: `CallerCanAccessProjectsAsync` → no financial role → `GetCurrentEmployeeIdAsync` → `User.GetUserId()` throws (no ObjectId claim) → returns null → false → `Forbid()`, without touching the throwing FinancialApi fake or the datamart.
- Success case: `FinancialViewer` role satisfies `CanViewFinancials`; `GetUserIdentifier()`/`GetEmulatingUser()` return null on the test principal (no claims) without throwing.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web && dotnet test tests/server.tests --filter "FullyQualifiedName~GetProjection"`
Expected: compile error — `GetProjectionAsync` does not exist on `ProjectController`.

- [ ] **Step 4: Add the endpoint** to `ProjectController.cs` after `GetGLPPMReconciliationAsync` (~line 264):

```csharp
    [HttpGet("projection/{projectNumber}")]
    public async Task<IActionResult> GetProjectionAsync(string projectNumber, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(projectNumber))
        {
            return BadRequest("projectNumber is required.");
        }

        if (!await CallerCanAccessProjectsAsync(new[] { projectNumber }, cancellationToken))
        {
            return Forbid();
        }

        var applicationUser = User.GetUserIdentifier();
        var emulatingUser = User.GetEmulatingUser();
        var projection = await _datamartService.GetProjectProjectionAsync(
            projectNumber, applicationUser, emulatingUser, cancellationToken);

        return Ok(projection);
    }
```

- [ ] **Step 5: Run the full server test suite**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web && dotnet test tests/server.tests`
Expected: PASS, including the existing `Project_routes_do_not_expose_employee_id_lookup_contracts` fact (the new template contains no `employeeId`).

- [ ] **Step 6: Commit (feature commit 1 — API)**

```bash
git add web/server.core/Models/ProjectProjectionResult.cs web/server.core/Services/DatamartService.cs web/server/Controllers/ProjectController.cs web/tests/server.tests/Controllers/ProjectControllerTests.cs
git commit -m "Add project projection API endpoint backed by usp_GetProjectProjection

GET /api/project/projection/{projectNumber} returns the sproc's two result
sets (per-category budget header + period x category burndown grid) in one
envelope. Authorization matches the other financial endpoints. Requires the
sproc from PR #304 to exist in the target database.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Task 3: Frontend — query module and tooltip entry

**Files:**
- Create: `web/client/src/queries/projectProjection.ts`
- Modify: `web/client/src/shared/tooltips.ts`

- [ ] **Step 1: Create the query module**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export type ProjectionPeriodKind = 'actual' | 'blended' | 'projected';

export interface ProjectProjectionCategory {
  budget: number;
  committed: number;
  expenditureCategory: string;
  isPersonnel: number;
  remainingNow: number;
  spentToDate: number;
}

export interface ProjectProjectionPeriod {
  actualAmount: number;
  displayPeriod: string;
  expenditureCategory: string;
  isPersonnel: number;
  kind: ProjectionPeriodKind;
  month: string;
  projectedAmount: number;
  remaining: number;
}

export interface ProjectProjectionResult {
  categories: ProjectProjectionCategory[];
  periods: ProjectProjectionPeriod[];
}

export const projectProjectionQueryOptions = (projectNumber: string) => ({
  enabled: Boolean(projectNumber),
  queryFn: async (): Promise<ProjectProjectionResult> => {
    return await fetchJson<ProjectProjectionResult>(
      `/api/project/projection/${encodeURIComponent(projectNumber)}`
    );
  },
  queryKey: ['project-projection', projectNumber] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectProjectionQuery = (projectNumber: string) => {
  return useQuery(projectProjectionQueryOptions(projectNumber));
};
```

- [ ] **Step 2: Add the tooltip definition** in `web/client/src/shared/tooltips.ts` (insert after `postReportingPeriod`, keeping the object's rough alphabetical order):

```typescript
  projectBurndown:
    'Remaining budget by expenditure category: three months of actuals, the current month, and twelve projected months based on personnel budgets and recent non-personnel spending.',
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web/client && npx tsc -b`
Expected: no errors.

## Task 4: Frontend — pure projection lib (TDD)

**Files:**
- Test: `web/client/src/test/lib/projectProjection.test.ts`
- Create: `web/client/src/lib/projectProjection.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildProjectionSeries,
  getProjectionStats,
  NON_PERSONNEL_SERIES,
  PERSONNEL_SERIES,
} from '@/lib/projectProjection.ts';
import type {
  ProjectProjectionPeriod,
  ProjectProjectionResult,
} from '@/queries/projectProjection.ts';

const period = (
  overrides: Partial<ProjectProjectionPeriod>
): ProjectProjectionPeriod => ({
  actualAmount: 0,
  displayPeriod: 'Jun-26',
  expenditureCategory: '01 - Salaries and Wages',
  isPersonnel: 1,
  kind: 'projected',
  month: '2026-06',
  projectedAmount: 0,
  remaining: 0,
  ...overrides,
});

const sampleResult = (): ProjectProjectionResult => ({
  categories: [
    {
      budget: 500,
      committed: 0,
      expenditureCategory: '01 - Salaries and Wages',
      isPersonnel: 1,
      remainingNow: 400,
      spentToDate: 100,
    },
    {
      budget: 200,
      committed: 10,
      expenditureCategory: '02 - Fringe Benefits',
      isPersonnel: 1,
      remainingNow: 150,
      spentToDate: 40,
    },
    {
      budget: 100,
      committed: 0,
      expenditureCategory: '04 - Supplies',
      isPersonnel: 0,
      remainingNow: 80,
      spentToDate: 20,
    },
  ],
  periods: [
    // May = actual, Jun = blended, Jul = projected; one row per category per month.
    period({ actualAmount: 50, displayPeriod: 'May-26', kind: 'actual', month: '2026-05', remaining: 400 }),
    period({ actualAmount: 20, displayPeriod: 'May-26', expenditureCategory: '02 - Fringe Benefits', kind: 'actual', month: '2026-05', remaining: 150 }),
    period({ actualAmount: 10, displayPeriod: 'May-26', expenditureCategory: '04 - Supplies', isPersonnel: 0, kind: 'actual', month: '2026-05', remaining: 80 }),
    period({ kind: 'blended', projectedAmount: 50, remaining: 350 }),
    period({ expenditureCategory: '02 - Fringe Benefits', kind: 'blended', projectedAmount: 20, remaining: 130 }),
    period({ actualAmount: 5, expenditureCategory: '04 - Supplies', isPersonnel: 0, kind: 'blended', projectedAmount: 5, remaining: 70 }),
    period({ displayPeriod: 'Jul-26', month: '2026-07', projectedAmount: 50, remaining: 300 }),
    period({ displayPeriod: 'Jul-26', expenditureCategory: '02 - Fringe Benefits', month: '2026-07', projectedAmount: 20, remaining: 110 }),
    period({ displayPeriod: 'Jul-26', expenditureCategory: '04 - Supplies', isPersonnel: 0, month: '2026-07', projectedAmount: 10, remaining: 60 }),
  ],
});

describe('buildProjectionSeries', () => {
  it('orders series as Personnel, Non-Personnel, then individual categories', () => {
    const series = buildProjectionSeries(sampleResult());

    expect(series.map((s) => s.key)).toEqual([
      PERSONNEL_SERIES,
      NON_PERSONNEL_SERIES,
      '01 - Salaries and Wages',
      '02 - Fringe Benefits',
      '04 - Supplies',
    ]);
    expect(series[0].isRollup).toBe(true);
    expect(series[2].isRollup).toBe(false);
  });

  it('sums personnel categories into the Personnel rollup per month', () => {
    const series = buildProjectionSeries(sampleResult());
    const personnel = series.find((s) => s.key === PERSONNEL_SERIES);

    expect(personnel?.points.map((p) => p.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    expect(personnel?.points[0]).toMatchObject({
      actualAmount: 70,
      kind: 'actual',
      remaining: 550,
    });
    expect(personnel?.points[1]).toMatchObject({
      kind: 'blended',
      projectedAmount: 70,
      remaining: 480,
    });
  });

  it('keeps non-personnel categories out of the Personnel rollup', () => {
    const series = buildProjectionSeries(sampleResult());
    const nonPersonnel = series.find((s) => s.key === NON_PERSONNEL_SERIES);

    expect(nonPersonnel?.points[2]).toMatchObject({
      month: '2026-07',
      projectedAmount: 10,
      remaining: 60,
    });
  });

  it('builds an individual series per category', () => {
    const series = buildProjectionSeries(sampleResult());
    const fringe = series.find((s) => s.key === '02 - Fringe Benefits');

    expect(fringe?.points.map((p) => p.remaining)).toEqual([150, 130, 110]);
  });

  it('returns no rollup series when the grid is empty', () => {
    const series = buildProjectionSeries({ categories: [], periods: [] });

    expect(series).toEqual([]);
  });
});

describe('getProjectionStats', () => {
  it('sums current balance from the category header', () => {
    expect(getProjectionStats(sampleResult()).currentBalance).toBe(630);
  });

  it('sums remaining across categories at the final month', () => {
    expect(getProjectionStats(sampleResult()).projectedEnd).toBe(470);
  });

  it('counts distinct projected months', () => {
    expect(getProjectionStats(sampleResult()).projectedMonths).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web/client && npx vitest run src/test/lib/projectProjection.test.ts`
Expected: FAIL — cannot resolve `@/lib/projectProjection.ts`.

- [ ] **Step 3: Implement `web/client/src/lib/projectProjection.ts`**

```typescript
import type {
  ProjectionPeriodKind,
  ProjectProjectionPeriod,
  ProjectProjectionResult,
} from '@/queries/projectProjection.ts';

export const PERSONNEL_SERIES = 'Personnel';
export const NON_PERSONNEL_SERIES = 'Non-Personnel';

export interface ProjectionPoint {
  actualAmount: number;
  displayPeriod: string;
  kind: ProjectionPeriodKind;
  month: string;
  projectedAmount: number;
  remaining: number;
}

export interface ProjectionSeries {
  isRollup: boolean;
  key: string;
  points: ProjectionPoint[];
}

export interface ProjectionStats {
  currentBalance: number;
  projectedEnd: number;
  projectedMonths: number;
}

function toPoints(periods: ProjectProjectionPeriod[]): ProjectionPoint[] {
  const byMonth = new Map<string, ProjectionPoint>();

  for (const period of periods) {
    const existing = byMonth.get(period.month);
    if (existing) {
      existing.actualAmount += period.actualAmount;
      existing.projectedAmount += period.projectedAmount;
      existing.remaining += period.remaining;
    } else {
      byMonth.set(period.month, {
        actualAmount: period.actualAmount,
        displayPeriod: period.displayPeriod,
        kind: period.kind,
        month: period.month,
        projectedAmount: period.projectedAmount,
        remaining: period.remaining,
      });
    }
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function buildProjectionSeries(
  result: ProjectProjectionResult
): ProjectionSeries[] {
  const personnel = result.periods.filter((p) => p.isPersonnel === 1);
  const nonPersonnel = result.periods.filter((p) => p.isPersonnel !== 1);
  const categories = [
    ...new Set(result.periods.map((p) => p.expenditureCategory)),
  ].sort();

  const series: ProjectionSeries[] = [];

  if (personnel.length > 0) {
    series.push({
      isRollup: true,
      key: PERSONNEL_SERIES,
      points: toPoints(personnel),
    });
  }

  if (nonPersonnel.length > 0) {
    series.push({
      isRollup: true,
      key: NON_PERSONNEL_SERIES,
      points: toPoints(nonPersonnel),
    });
  }

  for (const category of categories) {
    series.push({
      isRollup: false,
      key: category,
      points: toPoints(
        result.periods.filter((p) => p.expenditureCategory === category)
      ),
    });
  }

  return series;
}

export function getProjectionStats(
  result: ProjectProjectionResult
): ProjectionStats {
  const currentBalance = result.categories.reduce(
    (sum, category) => sum + category.remainingNow,
    0
  );
  const months = [...new Set(result.periods.map((p) => p.month))].sort();
  const lastMonth = months.at(-1);
  const projectedEnd =
    lastMonth === undefined
      ? currentBalance
      : result.periods
          .filter((p) => p.month === lastMonth)
          .reduce((sum, p) => sum + p.remaining, 0);
  const projectedMonths = new Set(
    result.periods.filter((p) => p.kind === 'projected').map((p) => p.month)
  ).size;

  return { currentBalance, projectedEnd, projectedMonths };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web/client && npx vitest run src/test/lib/projectProjection.test.ts`
Expected: PASS (8 tests).

## Task 5: Frontend — chart component and route wiring

**Files:**
- Create: `web/client/src/components/project/ProjectBurndownChart.tsx`
- Modify: `web/client/src/routes/(authenticated)/projects/$iamId/$projectNumber/index.tsx`

- [ ] **Step 1: Create the component.** Solid lines cover `actual` + `blended` months; dashed lines cover `blended` + `projected` — both include the blended month so the segments connect. Each series renders as two `Line`s sharing a color, with row keys `"<key>::solid"` / `"<key>::dashed"`; the row also carries `"<key>::spend"` for the tooltip.

```tsx
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  buildProjectionSeries,
  getProjectionStats,
  NON_PERSONNEL_SERIES,
  PERSONNEL_SERIES,
  type ProjectionSeries,
} from '@/lib/projectProjection.ts';
import { useProjectProjectionQuery } from '@/queries/projectProjection.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

const SERIES_COLORS = [
  'var(--color-primary)',
  '#f97316',
  '#3b82f6',
  '#14b8a6',
  '#8b5cf6',
  '#ef4444',
  '#84cc16',
  '#0ea5e9',
  '#eab308',
];
const GRID_COLOR = 'var(--color-main-border)';
const ZERO_LINE_COLOR = 'var(--color-error)';

type ChartRow = { label: string; month: string } & Record<
  string,
  number | string | null
>;

function buildChartRows(series: ProjectionSeries[]): ChartRow[] {
  const rows = new Map<string, ChartRow>();

  for (const { key, points } of series) {
    for (const point of points) {
      const row =
        rows.get(point.month) ??
        ({ label: point.displayPeriod, month: point.month } as ChartRow);
      row[`${key}::solid`] =
        point.kind === 'projected' ? null : point.remaining;
      row[`${key}::dashed`] = point.kind === 'actual' ? null : point.remaining;
      row[`${key}::spend`] = point.actualAmount + point.projectedAmount;
      rows.set(point.month, row);
    }
  }

  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function seriesColor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

interface BurndownTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  visibleSeries: Array<{ color: string; key: string }>;
}

function BurndownTooltip({
  active,
  payload,
  visibleSeries,
}: BurndownTooltipProps) {
  const row = payload?.find((item) => item.payload)?.payload;

  if (!active || !row) {
    return null;
  }

  return (
    <div className="rounded-md border border-main-border bg-base-100 p-4 text-sm shadow-lg">
      <p className="font-proxima-bold text-base mb-2">{row.label}</p>
      <dl className="space-y-2">
        {visibleSeries.map(({ color, key }) => {
          const remaining = (row[`${key}::dashed`] ??
            row[`${key}::solid`]) as number | null;
          const spend = row[`${key}::spend`] as number | null;

          if (remaining === null || remaining === undefined) {
            return null;
          }

          return (
            <div key={key}>
              <dt className="font-proxima-bold flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {key}
              </dt>
              <dd className="ml-5">
                Remaining {formatCurrency(remaining)}
                {spend !== null && spend !== undefined && (
                  <span className="text-base-content/60">
                    {' '}
                    &middot; Spend {formatCurrency(spend)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

interface ProjectBurndownSectionProps {
  projectNumber: string;
}

export function ProjectBurndownSection({
  projectNumber,
}: ProjectBurndownSectionProps) {
  const projectionQuery = useProjectProjectionQuery(projectNumber);
  const result = projectionQuery.data;
  const series = useMemo(
    () => (result ? buildProjectionSeries(result) : []),
    [result]
  );
  const chartRows = useMemo(() => buildChartRows(series), [series]);
  const stats = useMemo(
    () => (result ? getProjectionStats(result) : null),
    [result]
  );
  const [visibleKeys, setVisibleKeys] = useState<ReadonlySet<string>>(
    new Set([PERSONNEL_SERIES, NON_PERSONNEL_SERIES])
  );

  if (projectionQuery.isSuccess && series.length === 0) {
    return null;
  }

  const toggleSeries = (key: string) => {
    setVisibleKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const visibleSeries = series
    .map((entry, index) => ({ color: seriesColor(index), key: entry.key }))
    .filter(({ key }) => visibleKeys.has(key));

  const visibleBalances = series
    .filter(({ key }) => visibleKeys.has(key))
    .flatMap(({ points }) => points.map((point) => point.remaining));
  const minBalance = Math.min(0, ...visibleBalances);
  const maxBalance = Math.max(0, ...visibleBalances);
  const padding = Math.max((maxBalance - minBalance) * 0.1, 1000);

  return (
    <section className="section-margin">
      <h2 className="h2">
        <TooltipLabel
          label="Project Burndown"
          tooltip={tooltipDefinitions.projectBurndown}
        />
      </h2>

      {projectionQuery.isPending && (
        <p className="text-base-content/70 mt-4">Loading project burndown...</p>
      )}

      {projectionQuery.isError && (
        <p className="text-error mt-4">Error loading project burndown.</p>
      )}

      {projectionQuery.isSuccess && series.length > 0 && (
        <div className="fancy-data">
          <div className="h-80" data-testid="project-burndown-chart">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart
                data={chartRows}
                margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
              >
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                />
                <YAxis
                  domain={[minBalance - padding, maxBalance + padding]}
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    `$${(value / 1000).toFixed(0)}k`
                  }
                />
                <ReferenceLine
                  ifOverflow="extendDomain"
                  stroke={ZERO_LINE_COLOR}
                  strokeDasharray="5 5"
                  y={0}
                />
                <Tooltip
                  content={<BurndownTooltip visibleSeries={visibleSeries} />}
                />
                {visibleSeries.map(({ color, key }) => (
                  <Line
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    dataKey={`${key}::solid`}
                    dot={{ fill: color, r: 3 }}
                    isAnimationActive={false}
                    key={`${key}::solid`}
                    name={key}
                    stroke={color}
                    strokeWidth={2.5}
                    type="monotone"
                  />
                ))}
                {visibleSeries.map(({ color, key }) => (
                  <Line
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    dataKey={`${key}::dashed`}
                    dot={{ fill: color, r: 3 }}
                    isAnimationActive={false}
                    key={`${key}::dashed`}
                    legendType="none"
                    name={key}
                    stroke={color}
                    strokeDasharray="6 4"
                    strokeWidth={2.5}
                    type="monotone"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {series.map((entry, index) => {
              const isVisible = visibleKeys.has(entry.key);
              return (
                <button
                  aria-pressed={isVisible}
                  className={`btn btn-xs ${isVisible ? '' : 'btn-outline'}`}
                  key={entry.key}
                  onClick={() => toggleSeries(entry.key)}
                  type="button"
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: seriesColor(index) }}
                  />
                  {entry.key}
                </button>
              );
            })}
          </div>

          {stats && (
            <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
              <div>
                <p className="stat-label">Current Balance</p>
                <p className="stat-value">
                  {formatCurrency(stats.currentBalance)}
                </p>
              </div>
              <div>
                <p className="stat-label">Projected End</p>
                <p
                  className={
                    stats.projectedEnd < 0
                      ? 'stat-value text-error'
                      : 'stat-value'
                  }
                >
                  {formatCurrency(stats.projectedEnd)}
                </p>
              </div>
              <div>
                <p className="stat-label">Projection</p>
                <p className="stat-value">{stats.projectedMonths} months</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

Style checks during implementation (adjust to match, don't invent): `stat-label`/`stat-value` and `fancy-data` usage — grep `web/client/src` for `fancy-data` and `stat-label`; if the project detail page's other sections use different wrappers, match them. PR #275 used exactly these classes, so they should exist.

- [ ] **Step 2: Wire into the route.** In `web/client/src/routes/(authenticated)/projects/$iamId/$projectNumber/index.tsx`:

Add import:

```tsx
import { ProjectBurndownSection } from '@/components/project/ProjectBurndownChart.tsx';
```

Insert between `FinancialDetails` and `ProjectAdditionalInfo` (~line 100):

```tsx
      <ProjectDetails summary={summary} />
      <FinancialDetails summary={summary} />
      <ProjectBurndownSection projectNumber={summary.projectNumber} />
      <ProjectAdditionalInfo summary={summary} />
```

- [ ] **Step 3: Compile and lint**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web/client && npx tsc -b && npm run lint`
Expected: clean. The repo's eslint enforces alphabetized props/keys — fix any ordering complaints.

## Task 6: Frontend — route tests, full verification, commit

**Files:**
- Modify: `web/client/src/test/routes/(authenticated)/project-detail.test.tsx`

- [ ] **Step 1: Add a default projection handler** to `setupHandlers` (empty result → section hidden, existing tests unaffected) and let it accept an override. Replace the `setupHandlers` definition:

```tsx
const setupHandlers = (
  user: { employeeId: string; name: string },
  projects: ProjectRecord[],
  projection: ProjectProjectionResult = { categories: [], periods: [] }
) => {
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: `${user.name.toLowerCase()}@example.com`,
        employeeId: user.employeeId,
        id: 'user-1',
        kerberos: user.name.toLowerCase(),
        name: user.name,
        roles: [],
      })
    ),
    http.get('/api/project/managed/by-iam/:iamId', () => HttpResponse.json({ pis: [], projectManager: null })),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json(projects)),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/project/projection/:projectNumber', () =>
      HttpResponse.json(projection)
    ),
    http.get('/api/project/gl-ppm-reconciliation', () => HttpResponse.json([]))
  );
};
```

Add the import at the top:

```tsx
import type { ProjectProjectionResult } from '@/queries/projectProjection.ts';
```

Also add the same projection handler line to the one test that builds its own `server.use(...)` block instead of calling `setupHandlers` (search the file for other `http.get('/api/project/` blocks).

- [ ] **Step 2: Add the new tests** (inside `describe('project detail page', ...)`):

```tsx
  const burndownProjection: ProjectProjectionResult = {
    categories: [
      {
        budget: 500,
        committed: 0,
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        remainingNow: 400,
        spentToDate: 100,
      },
      {
        budget: 100,
        committed: 0,
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        remainingNow: 80,
        spentToDate: 20,
      },
    ],
    periods: [
      {
        actualAmount: 50,
        displayPeriod: 'May-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'actual',
        month: '2026-05',
        projectedAmount: 0,
        remaining: 400,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jun-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'blended',
        month: '2026-06',
        projectedAmount: 50,
        remaining: 350,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jul-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'projected',
        month: '2026-07',
        projectedAmount: 50,
        remaining: 300,
      },
      {
        actualAmount: 10,
        displayPeriod: 'May-26',
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        kind: 'actual',
        month: '2026-05',
        projectedAmount: 0,
        remaining: 80,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jun-26',
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        kind: 'blended',
        month: '2026-06',
        projectedAmount: 5,
        remaining: 75,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jul-26',
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        kind: 'projected',
        month: '2026-07',
        projectedAmount: 10,
        remaining: 65,
      },
    ],
  };

  it('shows the project burndown with category toggles when projection data exists', async () => {
    const user = userEvent.setup();
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers(
      { employeeId: '1000', name: 'PI User' },
      projects,
      burndownProjection
    );

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      expect(await screen.findByText('Project Burndown')).toBeInTheDocument();
      expect(
        screen.getByTestId('project-burndown-chart')
      ).toBeInTheDocument();
      expect(screen.getByText('Current Balance')).toBeInTheDocument();

      const personnelToggle = screen.getByRole('button', {
        name: /Personnel/,
      });
      expect(personnelToggle).toHaveAttribute('aria-pressed', 'true');

      const suppliesToggle = screen.getByRole('button', {
        name: /04 - Supplies/,
      });
      expect(suppliesToggle).toHaveAttribute('aria-pressed', 'false');

      await user.click(suppliesToggle);
      expect(suppliesToggle).toHaveAttribute('aria-pressed', 'true');
    } finally {
      cleanup();
    }
  });

  it('hides the project burndown when the projection has no periods', async () => {
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      await screen.findByText('Award Information');
      expect(screen.queryByText('Project Burndown')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
```

Note: `getByRole('button', { name: /Personnel/ })` could also match a "Non-Personnel" toggle. The Personnel rollup button is rendered first; if the matcher is ambiguous, use `name: 'Personnel'` (exact) instead — the accessible name is exactly the key text.

- [ ] **Step 3: Run the new tests**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web/client && npx vitest run "src/test/routes/(authenticated)/project-detail.test.tsx"`
Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 4: Full client verification**

Run: `cd /Users/rmartins/repos/Walter/.claude/worktrees/projections-api-frontend/web/client && npx tsc -b && npm run lint && npx vitest run`
Expected: all clean/green.

- [ ] **Step 5: Commit (feature commit 2 — frontend)**

```bash
git add web/client/src/queries/projectProjection.ts web/client/src/lib/projectProjection.ts web/client/src/components/project/ProjectBurndownChart.tsx "web/client/src/routes/(authenticated)/projects/\$iamId/\$projectNumber/index.tsx" web/client/src/shared/tooltips.ts web/client/src/test/lib/projectProjection.test.ts "web/client/src/test/routes/(authenticated)/project-detail.test.tsx"
git commit -m "Add project burndown chart fed by the projection endpoint

Multi-series Recharts burndown on the project detail page: Personnel and
Non-Personnel rollups plus per-category lines, toggled by buttons below the
chart. Solid segments are actual months, dashed are blended/projected, with
a zero reference line and a stats footer. Supersedes the client-side spike
in PR #275.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Task 7: Push and open the PR

- [ ] **Step 1: Push**

```bash
git push -u origin rpm/projections-api-frontend
```

- [ ] **Step 2: Open the PR** against `main` with `gh pr create`, body covering: what (endpoint + chart), the two result sets, the toggle UX, the runtime dependency on PR #304's sproc (WalterDev-only until merged), and that it supersedes PR #275. End the body with the standard Claude Code attribution line.

---

## Self-review notes

- Spec coverage: endpoint+envelope (Task 1–2), auth (Task 2), query/lib/chart/toggles/stats/tooltips/placement (Tasks 3–5), loading/error/hidden states (Task 5, tested Task 6), unit + route tests (Tasks 4, 6), two-commit delivery (Tasks 2, 6).
- Deviation from spec: the multi-grid Dapper call is inlined in `GetProjectProjectionAsync` rather than a generic helper — single caller, YAGNI.
- `IsPersonnel` is `int` end-to-end (sproc emits INT; Dapper int→bool is unreliable); frontend compares `=== 1`.
