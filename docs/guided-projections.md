# Guided projections

In normal app mode, `/projections/$iamId` opens the guided planner with the PI's
current portfolio and saved plans. `/guided-projections/$iamId` opens the same
workspace. The portfolio's **Projections** link uses the `projectionsEnabled`
feature flag introduced with the projection APIs.

The default plan is a fresh, unsaved snapshot from
`GET /api/projections/by-iam/{iamId}/seed`. Opening the planner does not create a
projection row. Review the prefilled projects and people, add assumptions, then
use **Save plan** to store the scenario in Walter's `Projections` table. Creating
a plan through setup also saves it. Real portfolio data is never saved to browser
storage. Failed saves keep the draft open for another attempt.

Saved plans open at `/projections/$iamId/$projectionId`. They retain their original
snapshot date, budgets, actuals, and assumptions when reopened. Duplicating a plan
copies that snapshot and its edits into a separate row. It does not reseed from
current data. Plans are shared with everyone who can access that PI's portfolio:
financial viewers, the PI, and eligible project PIs or managers. Editing a plan
does not change project accounting records.

The planner loads saved plans even when a fresh datamart snapshot is unavailable.
New plans based on current data require that snapshot. Unsaved edits prompt before
leaving the page or switching plans.

Within a plan, the `project` and `section` search parameters track the selected
project and tab. Browser Back and Forward restore those views, and a copied URL
or reload opens the same view. **Back to all projects** returns to the overview;
**All plans** returns to the portfolio dashboard. Moving between views in the
same plan preserves unsaved edits. Saving an existing plan keeps the current view.

## Data and calculation

`ProjectionSeeder` supplies projects at project/task grain, category budgets,
actuals, 3/6/12-month spending averages, and UCPath jobs and funding entries.
The portfolio includes active projects where the person is the project-level PI.
Award-level-only PI and project-manager relationships do not add seeded projects.

Seeded costs come from `PPMProjectCosts` for CAES organizations and include vacation
accrual. They can differ from GL-based burndown figures. The guided planner uses
`computePiProjection`, the calculation engine introduced with the projection
APIs, and keeps the snapshot date fixed while editing.

Supported assumptions include:

- Project/task inclusion, planned funding, available balances, and project dates.
  Balance edits preserve the original category budgets through an adjustment row.
- Staffing inclusion, full-time salary, appointment FTE, CBR, vacation accrual,
  annual COLA, fee remission, and appointment dates. Job-code lookups can fill
  rates. Missing salary or CBR is shown as missing and contributes zero until set.
- Multiple funding shares and dates per job, including funding outside the
  portfolio. Shares refer to full-time salary, so two 25% shares fill a 50%
  appointment. Changing FTE preserves the funding proportions. Outside funding
  counts toward the appointment without charging these projects.
- Category expenses with monthly or one-time amounts and optional ending months.
  Changing the history window replaces generated spending estimates. Editing a
  generated estimate's dates or frequency converts it to a planned expense.
- Plan name, notes, and planning horizon. The saved snapshot fixes the starting month.

Charts show each project/task's balance, shortfalls, and monthly costs. The live
planner does not recompute indirect costs from a project burden rate. Indirect
cost estimates remain part of the source category spending averages.

## Existing database schema

This demo branch uses the `Projections` table from PR #452 unchanged. It adds no
columns, tables, migrations, or datamart changes. The guided planner stores notes,
horizon, and inclusion choices as optional `guidedSettings` metadata in the
existing `Projects` JSON column. The API exposes the same values as `settings`
for the editor. Older projections without metadata use the default settings.

The projection tables and datamart procedures from PR #452 must already be
present. Save plan writes a scenario to the existing table; it does not modify
project accounting records or the database schema.

## Local demo

Run `npm run demo` from `web/client`. **Guided projections** at
`/guided-projections/9000000001` uses synthetic data and saves automatically in
browser storage. Existing demo plans keep their storage key. The earlier
`/projection-designs/9000000001` links redirect here.

**Projections** at `/projections/9000000001` retains the original timeline and
copilot for comparison, described in [demo-projections.md](demo-projections.md).
Both demo planners use the original demo calculation model, including staffing
indirect rates and simplified direct-cost expenses. The guided planner has no
copilot in either mode.

The implementation is under `web/client/src/components/guidedProjections/`.
