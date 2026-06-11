# Project Burndown Chart — Design

Date: 2026-06-11
Status: Approved (supersedes the client-side approach in PR #275)

## Problem

PR #275 spiked a project burndown chart computed client-side from personnel
records only. PR #304 added `dbo.usp_GetProjectProjection`, which computes a
richer burndown server-side from local datamart tables: per-expenditure-category
budgets, GL actuals, and personnel projections. The web app needs an API
endpoint for the sproc and a project-detail-page chart fed by it.

PR #275 is not cherry-picked: its branch is stale against main (the project
detail route was renamed `$employeeId` → `$iamId`; some tooltip edits already
landed) and its client-side projection math is obsoleted by the sproc. Its UX
patterns (section placement, zero reference line, tooltip layout, stats footer,
loading/error states) are reused. Close #275 when this lands.

## Data source

`dbo.usp_GetProjectProjection @ProjectId, @ApplicationName, @ApplicationUser,
@EmulatingUser` (PR #304) returns two result sets:

1. **Category header** — one row per expenditure category:
   `ExpenditureCategory, IsPersonnel, Budget, SpentToDate, Committed,
   RemainingNow`.
2. **Period × category grid** — 16 periods per category (offsets −3..+12 from
   the current month): `Month` ('YYYY-MM'), `DisplayPeriod` ('Mmm-yy'), `Kind`
   ('actual' | 'blended' | 'projected'), `ExpenditureCategory`, `IsPersonnel`,
   `ActualAmount`, `ProjectedAmount`, `Remaining` (running burndown anchored at
   `RemainingNow`).

Runtime dependency: the sproc exists in WalterDev only until PR #304 merges.
This code merges independently; the endpoint errors where the sproc is missing.

## Architecture

One endpoint returns both result sets in a single envelope. All aggregation
(Personnel / Non-Personnel rollups, line series, footer stats) happens
client-side in a pure module, keeping presentation logic out of C# and chart
rendering out of the math.

### Backend

- **Models** (`web/server.core/Models`), camelCase `JsonPropertyName` like
  existing records:
  - `ProjectProjectionCategory`: expenditureCategory, isPersonnel, budget,
    spentToDate, committed, remainingNow.
  - `ProjectProjectionPeriod`: month, displayPeriod, kind, expenditureCategory,
    isPersonnel, actualAmount, projectedAmount, remaining.
  - `ProjectProjectionResult`: `Categories` + `Periods` envelope.
- **DatamartService**: `GetProjectProjectionAsync(projectId, applicationUser,
  emulatingUser)` calls the sproc via Dapper `QueryMultipleAsync` — a new
  multi-grid helper alongside `ExecuteSprocAsync`, same Polly retry policy.
- **Controller**: `GET /api/project/projection/{projectNumber}` on
  `ProjectController`. Authorization mirrors the existing financial endpoints:
  `CanViewFinancials` policy, else the PI/PM project-level access check.
- **Tests** (xUnit, `ProjectControllerTests` style): authorized call returns
  the envelope; unauthorized returns Forbid.

### Frontend

- **`queries/projectProjection.ts`** — record types matching the envelope, a
  react-query options factory + hook via `fetchJson`, keyed by project number.
- **`lib/projectProjection.ts`** (pure, unit-tested) — from the period grid,
  build line series:
  - **Personnel** = '01 - Salaries and Wages' + '02 - Fringe Benefits' summed.
  - **Non-Personnel** = all other categories summed.
  Each point carries month label, kind, remaining, actualAmount,
  projectedAmount. Footer stats: Current Balance (Σ remainingNow across
  categories), Projected End (total remaining at the final projected month),
  horizon ("12 months").
- **`components/project/ProjectBurndownChart.tsx`** — Recharts LineChart over
  the full 16-period window:
  - Solid line for actual months, dashed for blended/projected (two `Line`
    segments per series sharing a color, split at the current month).
  - Dashed zero reference line; palette-colored lines per series (no
    red-below-zero recolor — noisy with multiple lines; the zero line carries
    the deficit signal).
  - Toggle chips below the chart: `[Personnel]` and `[Non-Personnel]` only.
    Multi-toggle; both on by default.
  - Tooltip: month plus each visible series' remaining and spend.
  - Stats footer: Current Balance, Projected End, Projection horizon.
- **Placement**: project detail route
  (`routes/(authenticated)/projects/$iamId/$projectNumber/index.tsx`), after
  `FinancialDetails`, before `ProjectAdditionalInfo`.
- **States**: local loading and error states inside the section; section hidden
  entirely when the sproc returns no period rows. Never blocks the rest of the
  page.
- **Tooltips**: new `tooltipDefinitions` entry for the section heading.
- **Tests**: vitest unit tests on `lib/projectProjection.ts` (rollup math,
  series shape, stats); msw-backed route tests for rendered/toggled/hidden
  states.

## Error handling

Input sanitation and validation happen in the sproc
(`usp_SanitizeInputString`, `usp_ValidateAggieEnterpriseProject`); the
controller surfaces Forbid vs 500 the same as other endpoints. The frontend
shows a local error message in the section on query failure.

## Out of scope

- Per-category series and toggle buttons (too many categories; the API still
  returns per-category data, so they can be added later without API changes).
- Per-category monthly table view.
- User-selectable horizon.
- Changes to the sproc or datamart (PR #304 owns those).
- Personnel-level (per-employee) tooltip breakdowns from #275 — the sproc
  aggregates personnel; per-person detail is not in this data source.

## Delivery

One PR on `rpm/projections-api-frontend`, layered commits:

1. API — models, service method, controller endpoint, controller tests.
2. Frontend — query, lib, chart component, route wiring, tooltip, tests.
