# Projections implementation plan

Status: Stage 1a and Stage 1b are accepted, including the calculation corrections,
shared snapshot timestamp, and fee rules. Stage 2a's fresh-snapshot read and
eligibility policy are accepted and committed as `5b5a7af3`. Stage 2b's wizard
completion and duplication are accepted and committed as `d524af0c`; New plan
saves before opening the view/edit workspace. Stage 3a's funding sources and
greenfield model cleanup are accepted and committed as `4bb4f673`. The follow-up
audit's seven cleanup recommendations are accepted and committed as `727cf3aa`.
Stage 3b's appointment editor and hypothetical hires are accepted and committed
as `1381103c`. Stage 3c's allocation picker is accepted and committed as `48f06e64`.
Stage 4a's Other expenses editor is accepted and committed as `ea854416`.
Stage 4b's plan details, fixed forecast duration, and typed `Content` document are
accepted and committed as `9a700ef1`. Stage 5a's funding outlook and source
drilldowns are accepted and committed as `4209d76b`. Stage 5b's saved-plan
dashboard, current balances, and minimal wizard Review are accepted and committed
as `ce6a7c03`. Stage 5c's workflow refinements and selected-task initial staffing
are implemented, verified, and accepted. An initial real-backend walkthrough now
passes against isolated local app and datamart databases containing copied real
portfolio records. Stage 5f records the bounded financial reconciliation;
shared datamart deployment, real Entra authentication, and rollout acceptance
remain open. A read-only branch review identified bounded
structural cleanup rather than a broad rewrite. Stage 5e implements that cleanup
and passes combined verification. The cleanup is accepted and committed as
`2b7a8e2a`. Stage 5f records the additional isolated real-data reconciliation.
Stage 5g's demo alignment and allocation refinements are accepted and committed
as `5ef2c492` and `895a5917`. Stage 5h's search-and-add funding selection and task
cards were accepted and committed as `e1033f19`. Stage 5i's saved-plan header,
long chart labels, and shortfall navigation refinements are accepted and committed
as `a58b495d`. Stage 5j's personnel category warnings and read-only budget balances
are accepted and committed as `c7661e35`. Stage 5k's category editing and
rebudgeting are accepted and committed as `1433dbb2`, including planned funding
source types and the follow-up navigation and help refinements. Stage 5l's compact
dashboard and workspace plan actions are accepted and committed as `13e6aeb4`.
Stage 5m's final isolated acceptance pass is complete; its category-picker fixes
and closeout record await user review. No additional v1 feature work was identified.
Saving remains available with funding gaps, overlaps, and budget shortfalls.
The UI rollout uses `walter.ProjectionsEnabled`, shared with Walter's feature-flag
evaluation and IAM targeting. Disabled entry points show an unavailable message
without reading projection data. Open saved-plan editors and setup wizards retain
their work and can save before leaving when a flag refresh disables projections;
new plan access and duplication are hidden. Saved data and API authorization stay
unchanged. Pilot audience configuration and deployed acceptance remain release work.
CBR defaults to 20% when no rate is supplied. Fresh appointments default to a
3% annual salary adjustment in July. Every retained appointment needs a salary
before the plan can be saved; explicit zero is allowed.
The projection model is greenfield and uses one current document format.
The project outlook starts at the snapshot month; historical spending remains
available for expense estimates and snapshot-month calculations.
Updated November 10, 2026.

Build a guided planning workspace where users can adjust a dated portfolio
snapshot, inspect each project's outlook, and save alternative plans. Keep the
implementation simple, share business rules, and make the same editing operations
usable by the UI and future integrations.

This document records the implementation direction, review sequence, and open
decisions. Confirmed decisions are distinguished from recommendations. Update it
as each decision is settled and each stage is reviewed.

## Confirmed decisions

- PR [#457](https://github.com/ucdavis/Walter/pull/457) is a disposable demo
  reference and must never be merged. Build from main rather than adopting its
  implementation as the foundation.
- The guided planner defines the intended UI. The earlier timeline and copilot
  are outside the initial feature; prepare for AI editing later.
- The [user workflow](../README.md#projection-plans) defines creation and saving.
  Plan name, optional description, and forecast duration belong within Funding
  sources. Description uses the plan notes value, also editable on Review. The
  plan-wide spending-history selector belongs within Other expenses, with a
  three-month default. A failed create preserves the wizard inputs for retry;
  leaving after submission may still leave a saved plan if the server completed
  the request.
- Work in stages. Exercise the result and review its code before moving to the
  next stage. Prefer small, understandable changes and shared rules.
- The deliverable is production code. Temporary previews and review scripts
  must be removed before the feature is considered complete.
- Make the workspace inspectable in memory and support direct navigation to
  meaningful sections and editing targets.
- The salary calculation below and the three [Stage 0 workflow decisions](#stage-0-confirmed-decisions)
  are agreed: salary changes apply throughout the remaining applicable forecast
  period, editors use Apply/Cancel, and plans use explicit Save plan.
- A hypothetical hire starting after the snapshot month uses its entered
  full-time salary as the starting rate. COLA first applies in the configured
  month strictly after the start month. Jobs captured in the snapshot keep
  the snapshot date as their salary base.
- Stage 1b uses the existing `UpdatedAt` timestamp for concurrency and saves the
  whole applied draft. A conflict offers Overwrite or Discard. The confirmed
  behavior and implementation stops are recorded below.
- The [snapshot-month calculation](projections-calculation-review.md#snapshot-month-personnel-costs)
  defines personnel netting and signed-credit handling. Explicit expenses remain
  additional forecast costs.
- The [personnel date rules](#agreed-personnel-date-rules) use inclusive overlap
  among project, job, and funding dates, with calendar-day proration of salary
  and benefits.
- [Recurring expense estimates](#agreed-recurring-expense-date-rules) use
  project-active days, restricted to days after the snapshot date in its month.
- [One-time expenses](#agreed-one-time-expense-month-eligibility) retain their
  full amount in an eligible month. Out-of-range entries remain saved.
- CBR is a numeric planning input. Use a 20% fallback for hypothetical hires
  and freshly imported missing rates, chosen for the expected postdoc-heavy
  roster. Preserve supplied rates, including explicit zero. Keep the default
  centrally defined and never update existing plans when it changes. The
  explicit Use lookup rate action and manual editing can replace an assumption.
- Keep the vacation cost field's existing default of 0 and preserve supplied
  values. Add no new vacation-cost UI until the lookup's meaning is confirmed.
- Show the project outlook from the snapshot month forward. Retain captured
  monthly spending and its use in expense estimates and snapshot-month netting.
  Do not reconstruct balances for earlier months or add warning UI.
- Use one fixed UTC snapshot timestamp for the seed query and saved plan.
  Capture the latest available imported inputs; their refresh times need not
  match. Document that this is not a synchronized financial cutoff, without
  adding warnings or blocking use of the plan. This describes the implemented
  initial-capture behavior. Stage 3a extends it with source-specific capture
  dates when funding is added later, while preserving existing snapshots and
  employee salary bases.
- Keep commitments reserved in the starting balance and deduct forecast costs
  separately. Document the possible overlap in the calculation reference;
  defer automatic reconciliation without adding controls or warnings.
- Keep personnel settings with the employee. Stage 3 includes a per-employee
  fee editor.
- Fee remission is the appointment's total monthly cost, split across funding
  shares without FTE or COLA scaling. Prorate by inclusive project/job/funding
  overlap days. Use the entire eligible snapshot month and add the result without
  subtracting category 08 actuals. Do not guess a fee default. Reconciliation
  with historical category 08 estimates remains deliberately deferred.

### Agreed salary example

See [Salary and benefits](projections-calculation-review.md#salary-and-benefits)
for the salary formula and example. Allocation inputs are shares of the
appointment; the equivalent full-time FTE is shown separately.

## Recommended architecture

Use one editable plan document and named operations that own its business rules.
Keep interactive forecast calculation independent of React. Components render
the document and invoke operations; future integrations use the same operations.

| Information                              | Owner                            | Required behavior                                              |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Saved plan and reference data            | TanStack Query                   | A background refresh cannot overwrite an active draft.         |
| Editable assumptions                     | One editor session per open plan | Changing section or project preserves the session.             |
| Selected section, project, job, or month | TanStack Router                  | Links and Back/Forward restore the location.                   |
| Partially typed input                    | Its field or dialog              | Incomplete text is not silently converted into a domain value. |
| Forecasts, totals, and warnings          | Pure calculations and selectors  | All views use the same results.                                |

Start with route-scoped React reducer/context and the existing Query, Router,
and form tools. Measure a representative large portfolio in Stage 1a. Introduce
an external store only if measured updates justify it. Plain context consumers
still rerender when their context value changes; a selector-shaped hook alone
does not prevent that.

Keep raw typing local, preserve unchanged entity references, and calculate after
a valid edit is committed. Pass each row the data it needs. Compute results once
per committed draft revision and derive each view from those results.

### Inspecting and editing the workspace

Compose a serializable workspace snapshot on demand from the plan, location,
calculated results, validation issues, draft revision, unsaved status, and pending
editor. Do not maintain a second synchronized copy of the whole workspace.

Use typed operations alongside workspace reads and navigation.
`editProjectionAppointment` identifies an appointment and applies validated
salary, FTE, date, and benefit inputs together. Separate operations add and
remove appointments. Later operations can replace a funding schedule or
regenerate spending estimates. Avoid arbitrary field paths as the public editing contract.

Salary edits target a stable appointment ID. A Person's name does not
identify a particular appointment. Keep the distinctions between Person, IAM ID,
and Employee ID in [CONTEXT.md](../CONTEXT.md).

Funding sources and appointments have projection-local IDs. Allocation changes
target an appointment and a date range, replacing the complete split for that
period. Editor rows need only local keys; no persisted allocation IDs or counters
are required. Revisit expense identity with its editor. Do not use names or array
positions as durable edit targets. Keep monetary units, allocation units,
date-only strings, and planning months explicit at conversion boundaries.

Later, add proposal preview and apply around these operations. A preview records
the local draft revision it inspected. Reject a stale proposal or one conflicting
with uncommitted form input until it can be reviewed again. This local revision is
separate from the server version used to detect conflicting saves.

A remote integration will need an authenticated adapter using the existing
portfolio authorization rules. Provider selection and a remote command API are
later work. Stage 1a only proves that the salary operation works outside the UI.

### Navigation and saving

The saved-plan address is
`/projections/{iamId}/{planId}?section=staffing&appointment={appointmentId}`.
Funding outlook links use `?section=overview&source={fundingSourceId}`. Funding
source editors use `?section=funding&source={fundingSourceId}`. An allocation picker
adds `fundingMonth=YYYY-MM` to the Staffing appointment address. Add expense
targets with its editor. Validate targets, reveal and
focus valid targets, and handle missing ones without crashing or selecting an
unrelated record.

Within a plan, navigation preserves the draft. Leaving or switching plans must
account for unsaved changes. A copied URL opens the saved document at the selected
location; it does not transfer another browser's unsaved state.

The confirmed persistence behavior is explicit Save plan. Failed saves retain
the draft. A response acknowledges the version submitted and must not replace
edits made while the save was in flight. Normal saves reject stale timestamps
atomically and retain local work. A confirmed overwrite replaces the saved
editable document, including intervening ordinary edits, within the same
snapshot. Background refresh cannot replace the editor's document.

Reuse business rules from the first editor onward. Share presentation components
where actual reuse supports it. The guided setup should compose the established
editors and commands while keeping its own navigation.

## Backend scope

The reviewed main branch already has per-PI document storage, snapshot inputs,
lookups, CRUD/reset endpoints, and portfolio-based access. Interactive calculation
already runs in TypeScript. Retain those foundations and make focused changes:

- Use the seed-only read to prefill the wizard without creating a saved row.
- Create the saved plan from the wizard's reviewed inputs, or a copied snapshot,
  without reseeding at the save boundary.
- Check a server concurrency token on mutations that can discard another edit.
- Persist plan settings and stable nested IDs cleanly as their features arrive.
- Validate structure, references, dates, and numeric values. Fresh seed drafts
  may contain missing salaries, but every retained appointment requires an
  explicit nonnegative salary before creation or saving.
- Keep captured source facts unchanged by scenario editors. Editing a scenario
  must not modify upstream accounting or personnel source records.
- Make history-window changes explicit in the draft. Saving should preserve the
  reviewed estimates instead of unexpectedly regenerating them.

Retain document storage rather than introducing a relational planning subsystem.
The demo stores plan settings inside a project record; do not carry that pattern
forward. Keep identity, owner PI, name, creation key, snapshot timestamp, and audit
fields as columns. Store `HistoryMonths`, `ForecastMonths`, `Notes`,
`FundingSources`, and `Appointments` in one strongly typed `Content` JSON column.
Name and snapshot timestamp have one authoritative value outside `Content`.
Use the same boundary in domain objects, API requests and responses, and client
drafts. Retain the three-month history default. The forecast duration defaults to
12 months and can be changed to 18, anchored to the original snapshot month.

The content is saved and copied as a whole. Every scenario edit can rewrite that
JSON column, including a notes-only change; explicit whole-plan saving makes this
an acceptable tradeoff. New required properties and renamed properties still
need deliberate stored-document migrations. Keep validation in typed models and
shared operations, with no untyped settings bag or parallel legacy format.

Fresh seed eligibility should have one named, tested owner. Apply dashboard rules,
and keep current filters from rewriting an already saved snapshot. Stage 2a
assigns this boundary to the server's fresh seed policy. Stage 3a replaces its
project aggregation with independent task sources and distinguishes deliberate
source omission from existing outside funding, as specified below.

## Stages and review stops

| Stage                          | Deliverable                                                                                                                                                                      | Review focus                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Behavior agreement          | Agreed salary calculation, edit timing, draft behavior, and navigation expectations for a small synthetic portfolio                                                              | Product decisions confirmed. Keep later questions assigned to their owning stages.                                                              |
| 1a. One local salary edit      | Open a representative plan; link to a job; edit and cancel salary; recalculate a useful project outlook; navigate without losing edits; invoke the same operation without the UI | State ownership, calculation clarity, component boundaries, keyboard behavior, and responsiveness.                                              |
| 1b. Save that edit             | Real saved-plan loading, conditional save, reload, failure recovery, and unsaved-change handling                                                                                 | Failed and conflicting saves preserve work; an in-flight response does not erase subsequent edits.                                              |
| 2. Plan lifecycle              | Wizard snapshot loading, creation on completion, duplicate, plan selection, and dashboard eligibility                                                                            | Wizard completion saves before opening the workspace; reopened and duplicated plans retain captured inputs even when fresh data is unavailable. |
| 3. Funding and staffing        | Project balances/dates, employee/job assumptions including fee remission, hypothetical hires, and funding schedules                                                              | Review project editing, job editing, and allocation editing separately. Check FTE, date ranges, outside funding, and funding proportions.       |
| 4. Expenses and details        | Monthly/one-time expenses, generated estimates, history windows, notes, and horizon                                                                                              | Explicit expenses survive regeneration; save/reload preserves the preview.                                                                      |
| 5. Complete guided experience  | Setup composed from existing editors, full project drilldowns, explanations, and controlled rollout                                                                              | Verify the complete workflow and genuine reuse.                                                                                                 |
| 5j. Category budget visibility | [Personnel warnings and balances](#stage-5j-personnel-category-warnings-and-balances)                                                                                            | Distinguish salary/fringe limits from general-pool funding without changing the calculator.                                                     |
| 5k. Category editing, accepted | [Category editing and rebudgeting](#stage-5k-category-editing-and-rebudgeting)                                                                                                   | Preserve original budgets and explain scenario adjustments. Implemented, verified, and accepted.                                                |
| 5l. Dashboard and plan actions | [Compact dashboard and plan actions](#stage-5l-compact-dashboard-and-plan-actions)                                                                                               | Keep cards easy to scan and open; preserve pending work and version checks when duplicating or deleting.                                        |

Every increment includes appropriate automated checks, a way to try the result,
independent code review, and a review with the user before moving on. Split a stage
into smaller changes when it contains separate behaviors. Accessibility, access
handling, error states, and responsiveness are acceptance criteria throughout.

AI service integration, effective-dated salary schedules, real-time collaboration,
automatic merging, event sourcing, and browser persistence of real portfolio data
are outside the proposed initial implementation. Deferring effective-dated salary
schedules is a confirmed Stage 0 decision.

### Production cleanup before completion

Stage 5e removes the temporary development aids after preserving regression
coverage. The completion requirements are:

- Remove `web/client/src/dev/projections/`, `web/client/projections-preview.html`, the
  synthetic scenario controls and server, and `window.walterProjectionPreview`.
- Remove `web/client/scripts/review-projection-calculations.ts` and
  `web/client/src/test/lib/piProjection.review.ts` after useful agreed examples
  are covered by automated regression tests.
- Replace tests that depend on the preview router or controls with tests of
  production routes and components. Keep only the small fixtures and test doubles
  those tests need under `src/test/`.
- Remove obsolete preview instructions, links, imports, and configuration. Verify
  the production workflow, regression tests, and build after removal.

Keeping these files out of the production bundle is temporary protection;
completion requires removing them from the repository.

## Stage 0 confirmed decisions

The salary arithmetic and these product choices were confirmed on November 6, 2026:

| Decision                           | Agreed behavior                                                                                                                   | Consequence                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| When a salary edit applies         | Change the job's assumed full-time rate throughout its remaining applicable forecast period, leaving historical actuals unchanged | Scheduling a raise for a future month is deferred.                                                                     |
| When an editor changes the plan    | Apply changes the in-memory draft and forecast; Cancel leaves them unchanged                                                      | Partial typing stays inside the editor. This retains a clear cancellation boundary.                                    |
| When workspace edits are persisted | Explicit Save plan                                                                                                                | Navigation within a plan preserves the draft; leaving or reloading warns about unsaved work. Reload uses saved inputs. |

The remaining forecast period is relative to the plan's fixed snapshot, not
today's date. Reopening an older plan does not move the salary edit's start month.

For Stage 1a, use the agreed salary example with fixed dates, two projects, one
job, and zero benefits/COLA/other costs. This isolates the salary rule. Add the
other cost and date rules as explicit examples before releasing real editing.

The Stage 0 product choices are settled. Stage 1a implements the local
salary-editing example, including its Apply/Cancel behavior, direct navigation,
and the same operation invoked without the UI. Persistence remains in Stage 1b.
Later backend and calculation questions do not reopen these decisions unless new
evidence requires a deliberate change.

## Stage 1a review

The Stage 1a workspace owns one plan session, uses the existing
`computePiProjection` calculation, and changes salary through
`setJobMonthlySalary`. That increment used a separate synthetic Vite entry without authentication
or a backend. Existing application routes and production persistence were
unchanged. The temporary entry has since been replaced by production-component
tests using fixtures under `web/client/src/test/`.

The fixed example captures December 2025 salary actuals and forecasts January
through June 2026. Project A starts with $20,000 available and Project B with
$16,000. Try the following:

1. Enter `132000` and Cancel. The annual salary remains $120,000.
2. Enter `132000` and Apply. Each project now pays $2,750 monthly. Project A ends
   at $3,500 and Project B at -$500, with its shortfall shown separately.
3. Open Project B's monthly detail, switch sections, and use Back/Forward.
   The applied salary remains in the draft; December actuals remain $2,500.
4. Open the salary editor by URL. Blank or invalid text disables Apply; zero is
   a valid salary. Escape cancels and returns focus to the job's edit control.

Local verification includes 19 new behavioral tests and 447 passing client tests,
TypeScript, changed-file lint, and a successful production build. React Doctor
scored the changed files 100/100. Browser checks covered Apply/Cancel, invalid
input, project navigation, Back/Forward, direct links, and desktop/mobile layouts.
An independent code review found no remaining blocking issues after correcting
the fixture's history window and preserving captured monthly precision when the
annual display is unchanged.

A separate browser stress check mounted the reusable workspace with 20 projects,
100 jobs, and 36 forecast months. Across five edits in a local development build,
input-to-two-animation-frames measurements were 9.7-12.4 ms for typing and
18.2-62.3 ms for Apply, including recalculation. These are local synthetic
measurements, not production performance guarantees.

The user reviewed the code and preview and accepted Stage 1a. The synthetic
preview supported later increments until its retirement in Stage 5e.

## Stage 1b confirmed decisions

These decisions were confirmed after reviewing the saving and conflict cases:

- **Normal Save** captures the whole applied draft and the exact `UpdatedAt`
  originally loaded. The database checks that timestamp as part of the write.
- **Conflict** offers Overwrite or Discard. There is no field comparison,
  selective reapplication, or automatic merge in v1. Closing the dialog keeps
  the local draft. The next Save offers the same choice again.
- **Overwrite** captures the current applied draft when clicked. It replaces
  the saved editable document, including other users' ordinary edits that arrive
  after the warning. The user does not need to confirm the same overwrite again.
  If it fails, an explicit manual retry retains that overwrite intention until
  success or Discard. It never retries automatically.
- **Snapshot replacement or deletion** blocks overwrite. `SeededAt` identifies
  the original snapshot; a draft cannot restore a deleted plan or replace a
  freshly reset snapshot. The browser retains the draft for reference.
- **Discard after a conflict** loads the latest saved plan in the current
  workspace, preserving the selected location when it still exists. It does not
  fetch a fresh source snapshot.
- **Editing during a save** remains available. Only another Save is disabled.
  A response acknowledges the submitted draft; later edits remain unsaved.
  For example, saving $132,000 and then editing to $140,000 leaves $132,000 saved
  and $140,000 visible with unsaved changes. An overwrite clicked after that
  conflict submits the current $140,000 draft.
- **Leaving with pending changes** offers Stay or Discard. Same-plan navigation
  preserves applied edits. Reload and close use the browser's standard warning.
  A changed, unapplied salary buffer also counts as pending work. Back within
  the same plan can still close the salary editor and discard its buffer, as
  accepted in Stage 1a. Save never silently applies unfinished text.
- **Leaving during a save** offers Stay or Leave anyway and explains that the
  submitted save may still complete. Leaving cannot cancel an accepted write.
- **Save feedback** uses Saving followed by a checkmark in the Save button after
  confirmed success. Edits made after submission still appear unsaved.
- **Failed saves** retain the draft, show simple failure feedback, log the error,
  and allow manual retry. A lost response may mean the write completed, but the
  client does not show success without confirmation. Automatic readback,
  reconciliation, and retries are deferred.
- **Expired login** follows Walter's existing login behavior. The user accepts
  that this can interrupt the session and lose an in-memory draft. Do not add a
  separate session-expired workflow, another-tab login, or a sign-in check.
- **Browser draft recovery** is deferred. Do not store portfolio drafts in
  localStorage as part of Stage 1b.

Reset versus refresh needs its own product discussion before either action is
exposed in the new workspace. Stage 1b protects against the existing reset
endpoint without adding a reset/refresh UI.

### Stage 1b implementation stops

1. **Server save contract, accepted.** Use the existing timestamps for
   atomic checks, whole-document save and overwrite, and guarded reset/delete.
   Review the code and test against SQL Server before proceeding.
2. **Saving, conflicts, and departure, accepted.** Load a saved plan,
   acknowledge the submitted version, preserve later edits, and handle failures.
   Add Overwrite/Discard, snapshot/deletion handling, and departure warnings.
   Review the code and exercise these flows together before proceeding.
3. **Calculation review, current increment.** Verify real-plan costs and date
   boundaries against explicit examples before closing Stage 1b. Saving tests
   alone do not establish that the existing calculator is ready for real editing.

The accepted server contract requires
`expectedUpdatedAt` and `expectedSeededAt` on Save, with `overwrite` defaulting to
false. Reset and Delete require `expectedUpdatedAt`. Missing tokens cannot fall
back to an unconditional write. Conflicts distinguish an ordinary changed plan
from a replaced snapshot; missing plans and access failures remain separate.

Treat timestamps as exact opaque strings in the client; parsing them into a
JavaScript `Date` for a save token would lose fractional precision. The server
returns UTC timestamps, strictly advances `UpdatedAt` on writes and `SeededAt` on
reset, and uses the expected timestamp in the atomic database predicate. Confirmed
overwrites may retry ordinary races internally, checking snapshot identity and
access each time. Retry exhaustion is a transient save failure, not another
ordinary-conflict prompt.

Save retains the whole `FundingSources`/`Appointments` document, including its
captured history arrays, while preserving server-owned identity, snapshot, and
audit metadata. It does not merge or clear fields from the submitted document.
This also lets overwrite restore a source removed by an ordinary edit within
the same snapshot. The workspace keeps history read-only; broader server
validation of captured facts needs a separate decision as the editors expand.
Save stores the submitted expenses and history window without regenerating
estimates. Upstream accounting and personnel source records are unchanged.

Acceptance evidence must include exact timestamp round trips, two writers using
the same original timestamp, stale and missing tokens, overwrite races, reset and
delete races, authorization, strictly advancing timestamps with a frozen or
backward clock, and preservation of the submitted estimates. In-memory tests
alone do not establish the SQL Server concurrency guarantee.

### Server contract review

The first Stage 1b increment implements these endpoints without adding database
columns or a migration:

| Endpoint                           | Required preconditions                       | Behavior                                                                                                                               |
| ---------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /api/projections/{id}`        | Body `expectedUpdatedAt`, `expectedSeededAt` | Stores the submitted name and typed `Content` document. `overwrite: true` accepts intervening ordinary edits within the same snapshot. |
| `POST /api/projections/{id}/reset` | Body `historyMonths`, `expectedUpdatedAt`    | Resets only the loaded version and advances both timestamps.                                                                           |
| `DELETE /api/projections/{id}`     | Query `expectedUpdatedAt`                    | Deletes only the loaded version.                                                                                                       |

Ordinary conflicts return `409` with code `conflict`; a replaced snapshot returns
`409` with code `snapshotChanged`. Three lost overwrite attempts return `503`
with code `busy`, unless the final check finds reset, deletion, or lost access.
Invalid/missing tokens return `400`; missing plans and access failures retain
their existing `404`/`403` behavior.

Independent review found no remaining code issues. It identified a test gap for
overwrite retry exhaustion and a final-attempt reset/deletion; those cases were
added and passed. `dotnet test web/app.sln --no-restore --verbosity minimal`
passed 433 standard tests. SQL integration tests opt out of that default run.
The isolated SQL Server 2022 runner passed all 12 integration cases with no skips:

```sh
web/tests/server.tests/run-projection-sql-tests.sh --no-restore --verbosity minimal
```

This runner starts its own loopback-only Docker container, applies the existing
migrations to a uniquely named database, exercises real HTTP binding and SQL
write races, and removes its database/container afterward. It fails if selected
tests are skipped or not discovered. Existing NuGet audit warnings for
`System.Security.Cryptography.Pkcs` and `System.Security.Cryptography.Xml` remain
outside this increment.

The user accepted the server contract and the frontend saving increment. The
next review covers calculation behavior.

### Frontend saving review

The saved-plan route now opens the reusable workspace. It verifies the plan is
in the requested PI's saved-plan list and loads a fresh copy on entry. The editor
session survives section changes and query refreshes. Each plan has its own
save mutation, so a response finishing after departure cannot update another
plan's cache or draft.

Save acknowledges the submitted document, preserves later edits, and shows a
checkmark only after confirmation. Ordinary conflicts offer Overwrite/Discard;
reset and deletion block overwrite. Failures keep the draft and allow manual
retry. Discard reloads saved inputs and clears an open salary buffer. A late
Discard response cannot navigate back to a plan the user has left.

The workspace read operation now includes serializable saving, conflict, error,
and reload status alongside the draft and location. No second synchronized
document or browser storage is introduced.

The retained persistence regressions cover saving the applied salary, edits made
while a save is pending, conflict overwrite/discard, failed and lost responses,
reset/deletion protection, and departure/reload warnings. They operate on the
production workspace with a test-only persistence double.

Browser checks against the real authenticated route with synthetic HTTP responses
covered delayed saves, two-tab conflicts, overwrite of the current draft,
discard, failure/retry, reset protection, reload warnings for unapplied input,
and leaving during a save followed by reopening. Desktop/mobile layouts were
also checked. Automated
tests also cover exact timestamp tokens, query refresh, reopening, and late
responses after switching plans. The accepted server tests separately establish
the SQL persistence and concurrency contract.

The full client suite passed, along with TypeScript, the production build,
changed-file ESLint, and independent review. React Doctor scored the changed
files 100/100. The production build contains only the normal application entry;
the synthetic preview and controls are excluded.

The user exercised the preview and accepted the saving behavior.

### Calculation review

The [calculation reference](projections-calculation-review.md) explains the
formulas and how to interpret their results. The source review found a
current-month balance issue and date-boundary defects. The user accepted the
implemented snapshot-month correction. It keeps booked salary and benefits
fixed and visible, forecasts only their remainder, and stops deducting snapshot
actuals again from captured balances.
Explicit expenses remain additional forecasts. Fee remission also remains
additional and does not use salary/fringe booked-cost subtraction.

The booked salary regression uses illustrative benefit rates. Each project has
$1,000 booked salary and $400 booked benefits, included in its $26,600 snapshot
balance. January shows $1,400 actuals, $2,100 additional forecast, and a $24,500
end balance. Change the annual salary from $120,000 to $43,200 to bring the
per-project salary target below booked salary. January's forecast becomes zero,
its actuals stay $1,400, and its end balance stays at the captured $26,600.
February still forecasts the full $900 salary plus $360 benefits.

The date and COLA rules below are implemented and accepted. Fee date allocation
and snapshot-month treatment are agreed, implemented, and validated. Stage 1b
is ready for final review. Category 08 reconciliation
and vacation lookup mapping are deferred future questions, not blockers for
that review. Stage 2 still requires a separate decision to proceed.

#### Agreed personnel date rules

For each month's salary and benefits, use the dates when the project, job, and
funding entry all overlap that month. Start and end dates are inclusive. Count
all calendar days, including weekends:

```text
personnel target = full-month cost at the funding share
                   × eligible days / calendar days in the month
```

An empty intersection produces no job target. A project starting April 1 has no
salary or benefit target in January through March. A job ending March 10 cannot
use funding starting March 31.

For a full-month project share of $2,500 salary and $1,000 benefits:

| Eligible dates               |  Salary | Benefits |
| ---------------------------- | ------: | -------: |
| February 20 through 28, 2026 | $803.57 |  $321.43 |
| March 1 through 5, 2026      | $403.23 |  $161.29 |

A $5,000 monthly appointment funded entirely by Project A through March 15 and
Project B starting March 16 allocates $2,419.35 to A and $2,580.65 to B. These
are displayed dollar amounts; retain calculation precision until presentation.
An entry ending March 15 and another starting March 15 overlap for one day.

Funding gaps and overlaps must not prevent saving. The user expects funding
sources to operate by month in practice and prioritizes simple calculations and
an uncluttered workspace. Preserve the agreed date calculations and supplied
shares. This increment does not require new funding-warning UI or a model of
warning date ranges. Revisit concise feedback with the funding editor in Stage 3.
Monthly source alignment is an expectation, not an established data guarantee.

For the snapshot month, calculate the target over all eligible days in that
month, including days before the snapshot date. Aggregate targets per
project/category, then apply the accepted booked-cost subtraction once. Do not
also prorate personnel to days after the snapshot date. Preserve booked actuals
and the accepted signed-credit adjustment, including credits after project end.

This agreement covers salary and benefits. Expense rules follow below; the
fee-remission section specifies the same date overlap with different
snapshot-month treatment. Stage 1b remains open pending final review.

#### Agreed recurring expense date rules

Monthly and generated recurring expense estimates count only project-active days
within the expense's applicable months. Project start and end dates are inclusive.
In the snapshot month, also restrict the estimate to days after the snapshot
date, excluding the snapshot day itself:

```text
additional recurring forecast = monthly amount
                                × eligible days / calendar days in the month
```

For a $310 monthly expense and an October 16 snapshot:

| Project dates                      | Eligible days         | Additional forecast |
| ---------------------------------- | --------------------- | ------------------: |
| Active throughout October          | October 17 through 31 |                $150 |
| Ends October 20                    | October 17 through 20 |                 $40 |
| Starts October 20, ends October 31 | October 20 through 31 |                $120 |

Later months use all applicable project-active days in the month. No eligible
days means no recurring forecast. These estimates remain additional costs;
booked actuals are already included in the snapshot balance and are not
subtracted from the expense estimate.

#### Agreed one-time expense month eligibility

For now, a one-time expense contributes its full amount when its selected month
overlaps the project's dates and is the snapshot month or later. It is not
prorated by days or netted against booked actuals. An expense outside those
months remains in the saved plan but contributes nothing to the forecast.

An October 16 snapshot, a project ending October 10, and a $1,000 October
one-time expense still produce $1,000 of additional forecast. The expense
specifies only October, not an exact posting day. This rule preserves that
explicit expected charge without introducing a day-level expense field.

Job-level fee remission follows its own rule below. These recurring and
one-time expense rules continue to apply to explicit expenses and generated
category 08 estimates.

#### Date-boundary implementation review

The calculator now uses inclusive UTC calendar-day overlap for salary and
benefits, project-active days for recurring estimates, and month eligibility for
one-time expenses. Snapshot personnel netting still follows aggregation over
the entire eligible month. Saved assumptions and out-of-range expense entries
remain intact. The inspectable monthly funding share is an average over active
job days, including explicit outside funding; it does not prove that every day
is fully covered. Saving and warning UI are unchanged.

The date-boundary regressions use the agreed February/March job and funding
dates with illustrative benefit rates. Project A forecasts $1,125 in February and $564.52 in March. Project B
forecasts zero because its funding never overlaps the job. Changing annual
salary from $120,000 to $132,000 changes A's forecasts to $1,237.50 and $620.97;
B stays at zero. These calculation expectations remain covered after removing
the temporary preview.

All 499 client tests passed, including 23 new date regressions. The first new
regression reproduced a $2,500 February salary charge where the accepted
intersection requires $803.57. TypeScript, changed-file ESLint, the executable
calculation examples, and the production build passed. Browser checks verified
the baseline, salary edit, navigation, and successful synthetic save. Independent
code review found no actionable defects.

React Doctor scored 97/100 with the existing workspace component-size warning.
Existing CSS, module-directive, and bundle-size build warnings remain. Checks
used local synthetic data and did not revalidate deployed API/database behavior.
The user reviewed and accepted this correction. Publication and deployment
remain outside this increment; no new no-mistakes pipeline or CI run was
started. Stage 1b remains open for final review.

#### Benefit defaults

CBR is numeric in the plan model and client contract. Stage 3b replaces the
initial zero fallback with an agreed 20% assumption while preserving supplied
rates, including zero. The saved model does not convert old JSON nulls.
Vacation defaults and supplied values remain unchanged; its official
assessment mapping remains deferred.

#### Agreed project outlook period

The project outlook starts at the saved snapshot month and continues through
the forecast horizon. It shows that month's booked costs and additional forecast
spending, then later forecast months. Earlier months are excluded from the
displayed outlook and monthly detail. No new warning UI is needed.

Current category balances and monthly spending serve different purposes. The
snapshot's budget, spent-to-date, and commitment totals establish the available
balance. Captured monthly cost totals describe spending in each category and
month. Their historical averages supply generated recurring expense estimates;
snapshot-month totals support the existing booked-cost subtraction.

The calculator emits only each source's capture month onward, or its later
planned availability month. It does not reconstruct earlier balances from
today's balance and past spending. Saved monthly history still supplies expense
estimates and snapshot-month personnel netting.

Verification passed: 500 client tests, TypeScript, the production build,
changed-file ESLint, formatting, and independent review. The browser preview
starts at January 2026 for the saved January snapshot and retains the expected
forecast and ending balances. React Doctor scored 97/100 with the existing
component-size warning; existing client build warnings remain.

#### Agreed fee remission and category 08 estimates

The fee amount is the appointment's total monthly cost, split across its funding
shares without FTE or COLA scaling. No default amount is selected. Keep the
fee-remission editor with each employee's job settings in Stage 3.

Prorate the fee using calendar days when the project, job, and funding entry
all overlap the month. Start and end dates are inclusive; no overlap produces
no fee forecast:

```text
monthly fee forecast = appointment's monthly fee × funding share
                       × eligible days / calendar days in the month
```

For a $1,500 monthly appointment fee and a 50% funding share, a full eligible
month contributes $750. June 1 through 15 contributes $375 because 15 of June's
30 days are eligible.

In the snapshot month, count all eligible days, including days before the
snapshot date. The result is additional forecast spending. Do not subtract
category 08 actuals, which mix fees with other fellowship and scholarship costs.
A $750 full-month fee forecast therefore remains $750 with $400 already booked
in category 08. Those booked costs remain visible and included in the snapshot
balance under the existing inclusion assumption. Salary/fringe netting is unchanged.

The fee regression shows each project's April actuals of $400 alongside a $375 fee forecast,
leaving $9,225. May shows no actuals and a $750 fee forecast, leaving $8,475.
These months illustrate partial-month proration and the separate treatment of
booked category 08 costs.

Keep the existing historical estimate policy for now. The source query excludes
categories 01 salary, 02 fringe benefits, and 04 equipment; category 08 Fellowship
& Scholarships remains included. That category covers costs beyond employee fee
remission. Its historical estimate and entered employee fee amounts currently
both contribute to the forecast. Explicit monthly/one-time expenses also retain
their existing additive treatment.

How to distinguish other category 08 costs and avoid counting fee remission
twice remains deliberately deferred. The agreed fee amount, date allocation,
and snapshot-month behavior complete the policy choices needed for the current
Stage 1b implementation. Final review remains before closing it.

Verification passed: 525 client tests, TypeScript, the production build,
changed-file lint and formatting, executable examples, and independent review.
Browser checks matched the April and May preview amounts above with no console
errors. The date tests cover exact overlap, project bounds, leap day, funding
gaps/overlaps, FTE/COLA independence, and additive booked costs and credits.
React Doctor scored 97/100 with the existing component-size warning; existing
client build warnings remain.

#### Agreed future-hire salary timing

For a hypothetical job that was not captured in the source snapshot and starts
after the snapshot month, the entered salary is the full-time rate at the job's
start. The first COLA is in the configured month strictly after the start month;
there is no increase in the start month itself. Later increases compound annually.

With a January 2026 snapshot, an August 2026 hire at $120,000 annually and a 3%
July COLA has these full-time monthly salary rates:

| Month       | Monthly salary |
| ----------- | -------------: |
| August 2026 |        $10,000 |
| July 2027   |        $10,300 |
| July 2028   |        $10,609 |

A July 2026 hire also receives its first increase in July 2027. Jobs captured in
the source snapshot continue to use a snapshot-date salary base, even if their
start date is later. A hypothetical job starting in or before the snapshot month also uses the
snapshot base. Stage 3b requires a start date when adding a hypothetical hire. Moving a hypothetical
job's start date moves its salary base according to the same rule.

Use the existing job source flag and start date; no schema change is needed.
This settles future-hire COLA timing. Stage 1b remains open for final review.

The future-hire regression uses a 50% appointment split equally between two projects. Each project starts
at $60,000 and forecasts $2,500 monthly from August 2026 through June 2027, then
$2,575 in July and August 2027, ending at $27,350. Editing the annual salary to
$132,000 gives $2,750 and $2,832.50 respectively, ending at $24,085. The salary
editor displays August 2026 as the rate's base month.

Verification passed: 511 client tests, TypeScript, production build, changed-file
lint and formatting, executable examples, and independent review. Browser checks
covered the initial forecast, salary editing, and synthetic saving with the hire
date preserved. Ten calculation cases cover start-month boundaries, compounding,
benefits, later funding/project starts, moved hire dates, and imported jobs.
React Doctor scored 97/100 with the existing component-size warning; existing
client build warnings remain. No server behavior or persistence schema changed.

#### Agreed commitment treatment

Keep the existing treatment for now: commitments reduce the starting balance,
and forecast costs reduce it separately. The category totals do not identify
which forecast expenses fulfill commitments, so automatic offsets could hide
unrelated costs. Matching commitments to forecast expenses is deferred.

For a $100,000 budget, $40,000 spent, and $10,000 committed, the starting balance
is $50,000. Forecasting the same $10,000 purchase reduces it to $40,000 and counts
the obligation twice. The calculation reference documents this possible overlap
and resulting understatement of available funds, including overlap with
generated recurring estimates. No calculation, control, or warning changes are
needed. This settles the current commitment policy; Stage 1b remains open for
final review.

#### Agreed snapshot time and source freshness

The snapshot timestamp records when Walter begins capturing a plan's inputs.
Use the latest available portfolio, monthly-cost, and personnel data, accepting
that these sources refresh independently. The timestamp does not promise that
every source is complete through the same financial cutoff. Document that
source lag can break the assumption that captured monthly actuals are already
included in portfolio spending totals. Add no warnings or blocking checks.

Compute the final, monotonically advanced `SeededAt` once before the seed query.
Pass that UTC `DateTime` as `snapshotAtUtc` through the data source to the query's
required `@SnapshotAt DATETIME2(7)` parameter, and save the exact same timestamp.
The query derives its reporting month from that value and rejects a missing or
null timestamp. This keeps the history window and forecast in the same month
even when a request crosses midnight or the database and application use
different local time zones.

Coordinate deployment of the application and seed procedure. The current
contract requires the caller's timestamp; the previous application did not
supply one. Existing saved plans keep their captured timestamps and inputs.
This change aligns period selection without synchronizing source imports.

Verification passed: 450 server tests, with 8 optional SQL persistence tests
skipped, and the datamart project build. Four new cases cover a query crossing
a month boundary, equal or backward clocks advancing the snapshot into a new
month, and a failed query preserving the prior snapshot. Independent review
found no issues. The updated seed procedure was not executed against a live
database or deployed.

#### Deferred calculation questions

These questions remain documented for future work. Their current behavior is
accepted for Stage 1b, so they do not block its final implementation review or
authorize expanding this increment into later stages.

- **Vacation lookup mapping:** the numeric CBR default is accepted. Keep the vacation field's existing default of 0 and preserve
  supplied values. The earlier `WalterDev` inspection
  found no DVMED lookup set, some unmatched rows in the other sets, and null
  vacation rates. Seeding currently converts missing vacation to zero; existing
  saved zeros cannot reliably be classified as missing data or genuine zero.
  The calculator treats `VacationAccrualRate` as an additional salary-based
  cost. The out-of-band lookup import does not yet establish that this field
  maps to the official Vacation Leave Assessment. Confirm that mapping before
  adding new rate defaults or vacation-cost UI.
- **Category 08 reconciliation:** category 08 Fellowship & Scholarships remains
  in historical estimates and covers more than employee fee remission. Decide
  how to retain other category 08 costs without counting fees twice alongside
  employee inputs.
  Keep the agreed employee fee calculation and additive historical estimates
  until that future decision. No automatic fee default is selected.

Source references are the [portfolio import](../pipelines/pipeline/RefreshFacultyDeptPortfolio.json),
[seed query](../datamart/StoredProcedures/usp_GetProjectionSeed.sql), and
[calculator](../web/client/src/lib/piProjection.ts). Salary/FTE/funding units
matched the full-time-rate interpretation; the seeder includes Cognos earn-code
shares in the funding fraction. The older single-project calculator excludes
vacation, so matching that page alone is insufficient validation.

#### Review examples and verification

Stage 5e retired the temporary review script after preserving agreed examples in
the [calculator tests](../web/client/src/test/lib/piProjection.test.ts) and
[date-boundary tests](../web/client/src/test/lib/piProjection.dates.test.ts).
The deferred calculation questions above remain separate from those regression
assertions.

The snapshot correction passed 56 focused client tests, seven local browser
scenarios, TypeScript, changed-file ESLint, and the production build. Regression
tests reproduced hidden actuals and excessive forecast spending before the fix.
Review also caught a credit after project end that the date guard suppressed;
that case is fixed and tested for salary and benefits. Browser checks covered
salary edits, save conflicts, pending saves, and production preview exclusion.
Validation used synthetic data; it did not revalidate deployed API or database
concurrency. The local no-mistakes run passed without publication or CI.

React Doctor reported 97/100 with a component-size warning on the workspace.
Existing CSS, module-directive, and bundle-size build warnings remain. The user
accepted this correction and the date rules above. Funding gaps/overlaps remain
saveable, with no new warning UI required by this increment.
The user accepted the validated calculation behavior and authorized Stage 2.
Stage 1b is complete. The deliberately deferred questions above remain recorded
for future work and do not block the plan lifecycle stage.

## Stage 2: plan lifecycle

### Stage 2a: fresh snapshot and eligibility

The behavior below records the implemented Stage 2a increment. Stage 3a revises
project grouping and deliberately omitted funding shares; its design is below.

`GET /api/projections/by-iam/{iamId}/seed?historyMonths=3` returns fresh,
authorized inputs for the wizard without creating a saved plan. The history window supports
3, 6, or 12 months and defaults to 3. The current response separates an editable
`draft` from temporary `roster` selection metadata. The draft retains its UTC
capture timestamp and has no saved-plan ID or audit metadata. The response is
not cached. Opening existing plans remains independent of fresh seed data.

The server's `ProjectionSeedPolicy` owns fresh selection for seed reads, source
additions, and explicit Reset. Create saves the reviewed draft without reseeding:

- Keep the seed query's project-level PI membership and ACTIVE project scope.
  Dashboard display rules do not broaden portfolio membership.
- Exclude internal tasks with status `Inactive`. For other project types, use
  the latest award end date across the project's tasks; exclude the project
  only when that date is before the saved UTC capture date. Keep missing dates
  and awards ending on the capture date. Award dates select projects; project
  dates continue to bound their forecasts.
- The original project grouping was superseded by
  [independent task sources](projections-calculation-review.md#fresh-snapshot-selection).
- Keep excluded funding lines as outside funding, including their supplied
  shares and dates. Do not redistribute them to retained projects. A known
  excluded task is kept separate from an unmatched task.

Personnel is requested for the original seed project set so excluded allocations
remain available for that mapping. An empty seed skips the personnel query.
Fresh policy does not run when opening or saving a plan.

This increment changes the server boundary. Stage 2b adds the wizard and creates
plans from its reviewed inputs. No new settings column or persistence schema is
needed for Stage 2a.
Deploy the seed procedure with the application so the source provides
`TaskStatus` and `AwardEndDate` and accepts the required capture timestamp.
Older result sets cannot support the agreed exclusions.

Verification passed: 475 server tests, with 8 optional SQL persistence tests
skipped, the datamart project build, and independent code review. The targeted
60-test run includes an ASP.NET TestServer request proving the seed route uses
the default history window, preserves its UTC timestamp, sends `no-store`, and
creates no saved row. Regression cases cover expiry-day boundaries, task
grouping, excluded funding, empty inputs, access checks, and saved plans that
remain usable when fresh seed data fails. The SQL procedure was compiled but
not executed against a live database; no deployment occurred.

### Stage 2b: wizard completion and copies

New plan opens the setup wizard, prefilled from the seed-only read. Keep its
working inputs in memory while the user reviews funding, staffing, and expenses.
The final Create plan action saves those reviewed inputs and opens the existing
saved-plan workspace only after success. The workspace's Save plan action then
updates that saved plan. Do not add a separate unsaved workspace route or require
another Save after finishing the wizard.

Extend the existing Create endpoint to accept the reviewed snapshot, salary
edits, and expense estimates without reseeding. Canceling before creation leaves
no saved row. Keep the wizard's inputs on creation failure, pause setup edits during the
final save, and allow retry without duplicate rows after a lost response. A late
completion after departure must not navigate the user back.

Copying creates a separate saved plan with the source snapshot, assumptions,
and projection-local IDs. Reopening and copying must work from captured inputs
even when current source data is unavailable. The full wizard composes the
staffing and expense editors as their owning stages deliver them; Stage 2 fixes
the creation boundary rather than introducing a different interim lifecycle.

Stage 2a and this increment are accepted. The interim wizard was replaced by
the [current setup workflow](../README.md#projection-plans). See
[Stage 5h](#stage-5h-search-and-add-funding-selection) for source selection and
initial staffing, and [Stage 4a](#stage-4a-other-expenses) for the history selector.

The original fixed history window was superseded by
[historical estimates and custom amounts](projections-calculation-review.md#historical-estimates-and-custom-amounts).
Plan-wide settings belong to typed `Content`, not an arbitrary funding source.
The wizard uses TanStack Form for input state and validation.

The Create endpoint requires a reviewed draft containing the captured UTC
timestamp, funding sources, appointments, name, and history window, alongside
a creation key. It validates the document structure and source references,
then assigns the saved identity and audit metadata without another seed read.
Duplicate authorizes the source and copies its stored inputs without
consulting current financial or personnel sources. Normal Save retains its
existing concurrency checks.

Create and Duplicate use a required client-generated creation key. A unique
index per PI lets concurrent requests return one saved row.
Replays return the current saved plan, preserving edits made since creation.
An uncertain response freezes the submitted wizard inputs and key until retry
confirms the result; a definite validation rejection permits further edits.
Departure during an unresolved request warns that creation may have succeeded,
and late responses update caches without reopening the workspace.

Creation-key recovery lasts while the resulting row exists. Deleting that row
removes its recovery key. Duplicate also requires the source to remain available
and authorized on every retry. Durable recovery after deletion is outside this
increment. Apply the application database migration before serving these new
creation requests.

Verification passed: 531 client tests, 509 standard server tests, all 15 isolated
SQL Server tests, production client build, TypeScript, changed-file lint and
formatting, and independent code review. The standard server run skips optional
SQL tests; the isolated run applied the migration and exercised concurrent
creation and duplication, PI-scoped keys, and existing save
concurrency. Six client lifecycle cases cover reviewed-input creation, normal
subsequent saves, canceled setup, failed seed reads, lost-response recovery,
copying without fresh sources, and late completion during departure. Review
found and fixed a duplicate response overriding navigation while the chosen
plan's loader was still pending; its regression now passes.

A browser walkthrough of the production routes with synthetic API responses
confirmed Plan → Staffing → Review → saved workspace, preserved the entered
$132,000 salary and exact snapshot timestamp, and opened a separate saved copy
with the same inputs. No browser console errors remained in that walkthrough.
React Doctor found no errors; two wizard control-flow warnings were reviewed.
Existing CSS optimization, module-directive, and bundle-size warnings remain.
No live source read, deployment, or publication was performed for this increment.

## Stage 3a: funding sources

Status: accepted and committed as `4bb4f673`. The approved follow-up audit cleanup
is accepted and verified locally. Staffing editors are next. Publication and
deployment have not been performed.

### Agreed document names and ownership

The plan contains `FundingSources` and `Appointments`. Each appointment has
`Allocations` referencing a `FundingSourceId`. Use `ProjectionFundingSource`,
`ProjectionAppointment`, and `ProjectionFundingAllocation` for their model types.
Keep actual project/task identifiers distinct from the plan-local source ID.
A source's editable `Name` is separate from its captured `ProjectName`; renaming
a task must not rename its project group. Planned sources have no project origin
metadata. Only appointments retain `IsSeeded`, because their salary base depends
on whether they were imported or entered as hypothetical hires.

Appointments remain separate because one appointment can draw from several
sources and survives source removal. Expenses remain under their source for
the current rules. [Other expenses](#stage-4a-other-expenses) defines the
source-scoped editor. Reconsider expense ownership if unallocated or split
expenses become a requirement.

Use `FundingSources` and `Appointments` as the collection names inside the plan's
typed `Content` in the database, domain, and API. This is a greenfield system.
Keep one current document format without aliases for prototype fields, old
request shapes, or old navigation keys. Sources record their kind and capture
timestamp explicitly.

Source IDs need only be unique among the plan's current sources. Removed IDs
may be reused by later additions. Plan and section bookmarks are supported;
durable bookmarks to a particular funding source after removal are outside the
current scope. Do not add a persisted source ID counter for that guarantee.

### Source selection and identity

Each imported project/task pair is an independent funding source, even when all
tasks of a project are selected. Keep its balances, costs, and allocations
separate. A project rollup summarizes its tasks without letting a task surplus
hide another task's shortfall. Rollup and graph toggles can follow later.

The original selection checklist was replaced by
[Stage 5h search-and-add](#stage-5h-search-and-add-funding-selection), which owns
the current selection workflow. Existing authorization and eligibility rules
still apply. Prevent the same task from contributing its finances twice.

### Scenario balances, dates, and planned funding

Allow changes to a source's planning balance through a separate scenario
adjustment. Preserve captured budget, spent-to-date, and commitments and keep
the captured balance visible. Allow source start/end date assumptions, keeping
captured dates available for comparison and reset. Imported task dates initially
inherit the project's supplied date bounds because the source does not provide
separate task dates. These edits affect only the plan.

Allow planned funding without an existing Walter project/task. Its full entered
amount becomes available on its start date. Label it as planned; do not apply
probability weighting. Users can compare plans with and without that funding.

### Fresh additions and capture dates

Add searches available authorized sources and captures current data for the
selected tasks. Adding a previously removed task is a fresh import, not a
restoration of its old inputs or edits.

Each source keeps its own exact UTC capture timestamp. A later addition starts
its outlook in its own capture month and does not change existing sources,
employee settings, or their salary bases. Show source capture dates clearly.
Use each source's date for its captured history window, snapshot-month personnel
netting, recurring-expense proration, and forecast boundary. Preserve the agreed
fee and one-time expense rules at that boundary. Do not apply a fresh balance
to an older month or deduct spending already included in that balance again.

Adding a source after plan creation imports its financial inputs and captured
expense estimates only. It does not import or update employees or allocations.
The user assigns that funding in Staffing. Initial wizard setup still prefills
staffing under the roster rule below.

### Initial roster and removal

The initial roster includes only appointments with a personnel funding record
matched to a selected task. The user narrowed the earlier project-level rule
after the workflow review. Selecting task 01 does not bring in someone paid only
on task 02 of the same project. Temporary roster metadata identifies matching
funding-source IDs from the original personnel rows, independently of calculated
allocations. This keeps an appointment with an unsplit salary record when its task
matches, so its required salary can still be entered during setup.

Blank or unmatched task records alone cannot establish membership in a selected
task. An appointment with another matched selected-task record remains included,
with its unmatched-funding indication and unallocated share preserved. Do not guess
a task from the project number. The wizard uses roster metadata once for initial
selection; saved appointments, copies, and later saves do not retain it. Searching
for other people the PI pays on outside projects remains deferred.

Removing a source discards its captured inputs, source-specific expenses, and
planning adjustments. Confirm destructive removal. Delete allocations to that
source, leaving those shares unallocated; do not create replacement outside
funding or redistribute the shares. Keep employees and their other assumptions.
Apply the same allocation rule when tasks are deliberately unchecked during
setup. Preserve existing outside funding separately.

If imported employee funding has a blank or unmatched task, leave that portion
unallocated and show a brief indication that its task could not be matched.
Do not guess a selected task or use the old project-level fallback. Saving with
funding gaps or overlaps remains allowed.

### Implementation scope

Keep saved inputs fixed when reopening a plan. Every source uses its explicit
kind and capture timestamp; combined-project prototype documents are outside
the current contract.

Build shared source operations and editors for setup and the saved workspace.
Use TanStack Form while cleaning up the wizard's input handling. Preserve the
accepted Apply/Cancel, explicit Save, creation retry, and navigation behavior.
The calculation reference describes task independence, source-specific capture
dates, planning balances, and planned funding availability.

Verify task independence, selected-task roster filtering, omitted and
unmatched allocations, fresh additions to older snapshots, future availability
of planned funds, financial-only additions, removal/re-addition, and preservation
of existing employee assumptions and older plans. Review this increment before
proceeding to the remaining staffing and allocation editors.

### Implementation and verification

The wizard now uses Funding sources → Staffing → Review. Funding sources includes
the plan name, averaging window, task selection, and shared source editors. The
initial Continue filters staffing once. The original project-level rule was
narrowed to selected tasks during Stage 5c. Subsequent source changes preserve the
roster. Expenses will join the wizard when its
editor is implemented in Stage 4.

The saved workspace has a Funding sources section with Apply/Cancel dialogs,
fresh authorized imports, planned funding, and confirmed removal. Source editor
URLs support direct navigation and Back/Forward. Pending typing participates in
the existing departure guard. The wizard and source forms use TanStack Form.

The new source catalog and import endpoints use the existing task-grained seed
query and authorization rules. Import returns captured finances and expense
estimates without reading personnel or saving a plan. The follow-up cleanup
also requires the seed procedure's exact capture timestamp instead of falling
back to the database clock. Coordinate its deployment with the application.

Migration `20261109065142_RenameProjectionSourcesAndAppointments` renames the
JSON columns to `FundingSources` and `Appointments`. The model uses those names
directly. Save/import responses
update the current editor session synchronously so an import completing alongside
a save cannot restore an obsolete saved baseline.

Verification passed: 559 client tests, 528 standard server tests, all 15 isolated
SQL Server tests, TypeScript, the production client build, changed-file ESLint
and formatting, and independent code review. The standard server run skipped
10 optional SQL cases; the isolated run exercised the renamed columns,
current allocation JSON, creation, duplication, and save concurrency.
Client regressions cover task selection and the parent-project roster, source
Apply/Cancel and save, fresh re-addition without staffing restoration, pending
typing on departure, direct links and Back/Forward, and concurrent save/import
completion. Calculation tests cover independent tasks, later source captures,
planned availability, and explicit source metadata. SQL validation covers the
column migration and persistence of the current document shape.

A browser walkthrough of the production routes with synthetic API responses
confirmed task selection, creation, fresh financial imports, planned funding,
and saving. A July planned source first appears in July with its full amount;
an imported March source retains its March capture. The source dialog fits a
390-pixel viewport, and the saved source list has no horizontal overflow.
React Doctor found no errors;
the remaining warnings concern component size and form control flow. Existing
CSS optimization, module-directive, bundle-size, and dependency-audit warnings
remain. No live source read or deployed behavior was verified.

### Follow-up greenfield audit cleanup

The approved cleanup separates editable source names from captured project
names, removes unused source/budget/allocation seed flags and the unused fee
default, and makes every persisted creation key required. The unique PI/key
index preserves creation and duplication retries. Migration
`20261109071624_RequireProjectionCreationKey` makes the column non-nullable and
removes the filtered index, with no default value or data backfill.

The wizard seed response has one `ProjectionDraft` plus temporary roster
membership. Create accepts that reviewed draft and a creation key. Drafts contain
only plan inputs, without fabricated saved IDs or audit timestamps. The
calculator no longer emits reconstructed historical balances; it retains the
captured monthly costs used for estimates and snapshot-month netting.

The seed procedure requires a non-null `DATETIME2(7)` capture timestamp. A local
repository search and GitHub code search across the UC Davis organization found
Walter's `DatamartService` as its only executable caller. That adapter supplies
the timestamp explicitly. Live database dependencies and ad hoc callers have
not been checked; no procedure has been deployed.

Reset and snapshot-change protection remain. Their future user-facing meaning
still belongs to the reset/refresh decision below.

Client verification passed: 561 tests, TypeScript and the production build,
changed-file ESLint and formatting, and the executable calculation examples.
An additional comparison against the preceding commit matched all current and
future forecast rows and funding coverage across five fixtures and 200 generated
scenarios. Independent review found no issues. React Doctor reported no errors
and the existing four component-size and wizard-control-flow warnings.

The datamart build passed using the installed .NET 9 MSBuild. Its existing SQL
project SDK cannot build under the default .NET 10 SDK because a NuGet targets
path moved. The standard server suite passed 527 tests with 12 optional SQL
skips. All 17 isolated SQL tests executed and passed. They applied the required
creation-key migration, rejected null/default keys, exercised the actual seed
procedure's omitted/null timestamp rejection, and retained creation retries and
save/reset concurrency. The isolated container was removed afterward. This
increment is committed as `727cf3aa`; no deployment or live source read occurred.

## Stage 3b: appointments and hypothetical hires

Status: implemented, verified, accepted, and committed as `1381103c`.

Use one appointment editor in the wizard and saved workspace. Salary, FTE,
appointment dates, CBR, annual salary adjustment rate/month, and monthly fee
remission share one Apply/Cancel action. Keep imported employee/position identity
and descriptive source metadata fixed. A hypothetical hire has an editable
label and optional job code/title. Vacation cost editing remains deferred.

One FTE value applies throughout the appointment's eligible forecast. Allow
0–100% per appointment; appointments remain independent. FTE edits preserve
allocation shares relative to the appointment. Raising a 50% appointment to
75% with two equal allocations changes each displayed full-time share from
25% to 37.5%. Explicit allocation dates remain unchanged when appointment dates
change; date intersections determine costs and can expose unfunded periods.
At zero FTE, retain and display the relative shares. Entered fees retain their
agreed independence from FTE.

A new hypothetical hire begins at 100% FTE, with no assigned funding and no
employee or position ID. Require a descriptive name, an explicit start date,
and a full-time salary; the end date and job code are optional. A seed draft
may contain an imported appointment whose salary needs input, but Apply,
Create, and Save require an explicit nonnegative salary. Zero is valid; blank
is not. The user supplies a salary or removes the appointment before saving.
Other persistence paths must uphold the same invariant. In particular, a reset
with incomplete fresh inputs leaves the prior saved plan untouched.

Use one server-owned set of defaults, exposed through the lookups response:
20% CBR and a 3% annual salary adjustment in July. Supplied CBR values,
including zero, take precedence during capture. The CBR fallback is a planning
assumption chosen for the expected postdoc-heavy roster, not an average of
job-code rows. Default changes affect new inputs only. No personnel estimate
comes from historical spending or salary movements.

CBR remains editable. Use lookup rate explicitly applies a supplied value for
the selected job code and rate set; selection changes alone do not replace a
manual rate. Missing lookup values do not overwrite the current assumption.
The lookup does not change vacation costs. Annual salary adjustments may be
negative but must be above -100%; retain the agreed salary-base and compounding
timing. Fees remain optional and have no guessed default.

Confirm removal of an appointment and its allocations. Removing it discards
its forecast costs while preserving captured booked costs and all source
inputs. An end-date edit models departure during the forecast. New hires with
no allocations show a simple No funding assigned indication, including when
their start is beyond the available source horizon. Funding gaps remain saveable.

The wizard and workspace use TanStack Form and shared pure appointment
operations. Explicit Save, navigation/departure guards, pending edits, concurrent
save acknowledgements, and exact snapshot/version tokens remain intact.
Existing appointments can be edited from stored inputs if lookups are unavailable.
Failed background lookup requests preserve typing; new hires wait for the
server defaults before opening their form. Source and allocation calculation
rules remain unchanged.

Verification: all 596 client tests passed across 66 files. TypeScript, the client
production build, changed-file ESLint, Prettier, and calculation examples passed.
React Doctor reported no errors and the same four existing warnings, with a
score of 89. The warnings concern wizard/workspace size, wizard complexity,
and the loading flag that is already reset inside `finally`.

The standard server suite passed 549 tests with 12 optional SQL skips. All 17
isolated SQL tests then executed and passed. No migration was added. Tests cover
fallback versus supplied rates, required and zero salaries, negative annual
adjustments, reset preserving the saved plan on incomplete capture, and duplicate
retry behavior.

Browser checks used synthetic API responses through the production wizard and
saved-plan routes. They verified create/open, explicit lookup application,
unchanged allocation shares after FTE edits, future unallocated hires, Apply/Cancel
and Back/Forward behavior, Save, and removal preserving captured actuals. The
appointment form was usable at 390px width without horizontal overflow.
Independent review found and closed two lookup availability issues; focused
tests preserve typing and keep existing appointment edits available during a
lookup outage. No live personnel read or deployment occurred.

## Stage 3c: allocation periods

Status: implemented, verified, and accepted.

Use the demo's appointment funding timeline and period picker in both the wizard
and saved workspace. Clicking a month opens a funding split for a selected
period. Applying replaces all allocations within that period, preserving and
splitting allocations before and after it at exact inclusive date boundaries.
For example, replacing July through September with B in an appointment funded
by A all year leaves A in January–June and October–December. Cancel discards
typing; Apply changes the plan draft, and Save remains explicit.

Retain exact start/end date controls for partial months. Entire appointment and
Through appointment end are explicit shortcuts, with appointment bounds or an
open end shown clearly. Blank dates must not have unexplained behavior. A month
containing more than one dated split must reveal those differences rather than
silently average them into a replacement. Applying unchanged shares should keep
the original schedule intact.

Enter percentages of the appointment, showing their full-time FTE equivalent.
Allow 0–100% per entry, including zero-FTE appointments. Multiple entries for the
same source and totals above 100% remain allowed; do not merge, rescale, or
redistribute them automatically. New entries begin with no selected source and
a blank percentage. Both require explicit input before Apply. Removing an entry
within the editor needs no extra confirmation. Applying an empty split clears
funding only within the selected period.

The destination picker contains existing plan sources and Outside this plan.
Outside allocations count as funded but charge no source in the plan. Missing
funding remains unallocated; it is never filled with outside funding automatically.
Adding sources stays in Funding sources. Changing an allocation's destination
preserves its percentage and entered dates; source and appointment bounds still
limit its effective dates. An allocation with no eligible overlap remains
saveable with feedback.

Check funding coverage at actual date boundaries, so a gap and overlap in one
month cannot cancel into a misleading 100% average. Show concise gap/overallocation
feedback and expandable affected months, stating the checked forecast horizon.
Keep No funding assigned visible for appointments without allocations and
identify appointments starting beyond that horizon. Do not claim indefinite
coverage for an open-ended appointment. Feedback never blocks saving.

Applying a reviewed allocation period clears the appointment's unmatched-import
notice, including an unchanged Apply. The wizard's Staffing step supports this
review. Salary edits, source additions, and Cancel do not clear the notice.
Ordinary gap/overlap feedback remains independent.

Reuse the demo's interaction, retaining the production calculation rules. Do not
copy its full-time percentage entry, guessed remaining shares, zero-FTE block,
overallocation block, duplicate-source restriction, or month-only replacement
arithmetic. Captured financial inputs, source capture dates, employee assumptions,
and salary/fee calculations remain unchanged. No migration or legacy document
adapter is needed.

Verification: all 633 client tests passed across 68 files. TypeScript, the client
production build, changed-file ESLint, and Prettier passed. Focused tests cover
exact period replacement, open boundaries, leap days, unchanged Apply, duplicate
shares, zero-FTE fees, mixed months, navigation, pending typing, and wizard review
before Create. A final extraction of shared date helpers passed the six allocation
component tests and TypeScript again.

React Doctor scanned the changed files, including new untracked components,
with no errors and a score of 86. Seven warnings remain: picker/wizard complexity,
picker/wizard/workspace size, a stateless allocation-summary list keyed by index,
and a loading reset that is already inside `finally`. Shared date helpers were
separated from components to retain normal development hot reload.

The standard server suite passed 560 tests with 12 optional SQL skips. All 17
isolated SQL tests then executed and passed. Explicit source/share JSON inputs
are required; zero and Outside this plan remain valid. No migration was added.

Independent review found and corrected a calendar-format edge for valid early
years. Financial comparisons against the prior commit preserved every financial
row and prior average-coverage value across 205 fixture variants and another
400 generated scenarios. Six hundred daily replacement checks verified outside
period preservation, including open bounds and duplicate shares. No remaining
correctness findings were reported.

Browser checks used synthetic API responses through the saved workspace. They
verified the A-to-B July–September example and Save round trip, midmonth outside
funding, exact mixed-month reopening, unchanged Apply, explicit date shortcuts,
and a saveable month containing both a gap and overallocation. Snapshot tokens
and captured spending remained intact. Mobile verification at 390px led to a
full-width source selector above percentage/removal controls. No live personnel
read or deployment occurred.

## Stage 4a: Other expenses

The user confirmed the expense decisions and authorized implementation on
November 9, 2026. Plan notes and duration are covered by Stage 4b below.

Use one shared Other expenses editor in the wizard and saved workspace. A funding
source selector scopes the historical estimates and added expenses. Label it
"View expenses for" and explain that new expenses are charged to that source.
The Add/Edit dialog identifies the charge source and its captured project/task.
Changing the page selector does not move existing expenses. Every expense still
belongs to one source; there are no split or unallocated expenses.

### Historical estimates

Captured run rates supply the plan's selected 3-, 6-, or 12-month historical
amounts. Changing the plan-wide window uses those captured inputs and never
refreshes source balances, capture dates, or staffing. The selector moves from
the first wizard step into Other expenses, where its effect can be reviewed.

Historical rows allow amount edits only. A custom amount survives window changes,
including an explicit zero that turns the estimate off. It remains custom even
when another window's average equals that amount. Opening and applying an
unchanged automatic estimate does not create a custom amount. Each adjusted row
offers Use historical amount for the currently selected window; there is no bulk
reset or historical-row Delete action.
An explicit Turn off estimate choice also pins zero when the current historical
baseline is already zero, without changing the unchanged-Apply rule.

Show categories found in any captured window, plus categories with custom amounts.
A category with no costs captured in the selected window has a zero historical
baseline, labeled accordingly. A custom amount remains visible and effective.
Sources without captured expense history have no historical rows unless a custom
amount exists. Captured averages can be negative and retain their sign and
precision.

Persist captured run rates, optional custom amounts by source/category, and added
expenses. Derive historical estimates from those inputs instead of persisting a
second editable copy of every generated amount. Remove the unused Projected
expense kind; this greenfield format needs no legacy adapter or migration bridge.

### Added expenses and dates

Added expenses have a required description, category, amount, and starting month.
They are Monthly or One time. New entries default to Monthly with empty
description, category, and amount fields. Salary and fringe categories belong in
Staffing and are excluded from added expenses. Equipment and category 08 remain
available; category 08 overlap with appointment fees stays deferred.

Amounts may be positive, zero, or negative. Negative amounts reduce forecast
spending. Default the starting month to the later of the source's capture month
and availability month. A monthly expense defaults to Through funding source
end, following later source-end changes. For an open-ended source, display
Through forecast end with its current end month. An explicitly entered end month
stays fixed, must be on or after the start, and remains bounded by source
eligibility in the calculation. One-time expenses have no end month.

An added expense can be removed without another confirmation; removal changes
the unsaved draft. Explicit expense IDs are local to their source, with no
high-water counter or permanent expense bookmark contract. Removing a funding
source discards its estimates and added expenses under the existing source
removal rules. Re-adding it captures fresh inputs.

### Forecast display and persistence

Show the entered amount, schedule, and forecast total through the source's
forecast end. Use the same expense contribution calculation as the plan forecast,
including partial-month proration. Do not sum unrelated schedules into a single
monthly-expenses figure. If an expense's dates produce no forecast cost, show one
short inline explanation and allow saving. An intentional zero is not a date
warning; partial-month costs need no warning.

Editors and the history selector use Apply/Cancel. Workspace edits require Save
plan, and wizard completion saves the reviewed draft before opening it. Preserve
pending-input navigation guards and the existing save/conflict behavior. Month
fields use canonical first-of-month dates in the document, with validation shared
across creation and saving.

Verification passed 667 client tests across 70 files, 590 standard server tests,
and all 17 isolated SQL checks. The standard server run skipped 12 optional SQL
checks, which ran in the isolated suite. Production build, TypeScript, changed-file
ESLint, formatting, and diff checks passed. An independent 500-case comparison
preserved financial amounts and appointment funding across the calculation
extraction. Independent review found and resolved category fallback and precise
amount Turn off issues; no actionable findings remain.

Browser checks used synthetic API responses through the production routes. They
verified unchanged Apply, custom amounts and explicit zero across history changes,
restoring the current average, signed monthly expenses, exact-date forecast totals,
Save/reload, and saveable one-time costs outside the forecast horizon. Mobile
verification at 390px found no page overflow. The four-step wizard saved its
reviewed history setting before opening the workspace; an automated Create
regression additionally checked manual expenses, custom historical amounts, and
unchanged captured inputs. Final browser checks had no console errors or warnings.

React Doctor reported no errors and eight warnings, primarily component complexity
and size. The new expense tables were extracted into focused components. Reviewed
remaining warnings include similar table markup and an existing loading-flag
false positive inside a finally block; no warnings were suppressed.

The shared-category cleanup also passed 113 relevant client tests, TypeScript,
lint, and formatting. This increment is accepted and committed as `ea854416`.
No live personnel read, database deployment, push, or merge occurred.

## Stage 4b: Plan details and forecast duration

The user confirmed these decisions and authorized implementation on November 9, 2026. The forecast period belongs to the whole plan. Offer 12 and 18 months,
defaulting to 12. Count the original snapshot month as the first month, so a
12-month January snapshot ends in December. Opening or editing a saved plan does
not move its time anchor.

Funding sources without an end date run through the selected plan period.
Source, appointment, allocation, and expense dates retain their eligibility and
proration rules. Changing duration preserves those dates. Adding a source never
extends the period automatically. Sources whose availability or capture begins
after the period remain visible and saved, with an outside-period explanation,
but contribute no balance or costs within the selected period. Funding coverage
continues to follow source availability rather than capture dates.

Show every source's projected balance at the same plan-end month. A source that
ends earlier carries its final balance forward without new charges. Preserve
capture-month booked facts and the existing salary/fringe credit treatment.
Label the result "Projected balance at [month]" so it does not imply a lifetime
outcome. Expense totals and funding checks use the same selected period.

Offer optional multiline plain-text notes for the plan's purpose and assumptions.
Everyone with plan access can read them, and duplication carries them with the
saved name and duration. Notes have no calculation effect. Limit notes to 2,000
characters and retain the existing 200-character name limit. Do not add notes
per source or appointment, or discussion threads.

The four-step wizard keeps name, duration, and an optional description on Funding
sources; the same notes value remains editable on Review. The saved workspace
provides Edit plan details for name, duration, and
notes. Apply changes the local draft, Cancel leaves it unchanged, and Save plan
persists the result. Preserve pending-input guards, conflict handling, and newer
local edits when a save response arrives. The existing reset endpoint preserves
name, notes, and duration while replacing captured inputs; exposing reset remains
a separate decision.

Persist duration and notes in `Content` alongside history window, funding sources,
and appointments. Validate the same rules for creation and saving, and copy the
saved values on duplication. The user approved this storage boundary after
reviewing the initial Stage 4b implementation. Replace the undeployed two-column
migration with a schema-only consolidation migration that adds `Content` and
removes the replaced columns. This is a greenfield feature: do not convert,
backfill, or restore documents from the previous format in either migration
direction. Keep previously committed schema migrations and one current runtime
document format.

Final verification passed 692 client tests across 72 files, 609 standard server
tests, and all 18 isolated SQL checks. The standard run skipped 13 optional SQL
checks, which ran in the isolated suite. The SQL suite applied
`20261109204549_ConsolidateProjectionContent` on an empty database. Current-schema
tests verified a complete typed content roundtrip, schema columns, in-place
nested edits, and unchanged operational metadata.
Production build, TypeScript, changed-file ESLint, formatting, and diff checks
passed.

An independent 500-scenario comparison preserved financial amounts in months
shared by the previous and selected periods. Regression tests cover the exact
12/18-month boundary, extended open-source expenses, ended-source balance carry,
future sources and expenses becoming eligible, availability-based funding checks,
and snapshot-month credits. Tests also cover duplicate settings, late save
acknowledgements, and unapplied plan-detail input. Independent calculation and
server reviews found no remaining correctness defects.

A second 500-scenario comparison checked the content consolidation against the
pre-refactor implementation. Every financial row, appointment funding result,
and forecast window was identical. Creation and save requests require nested
`content`, with no flat aliases. Save acknowledgement preserves newer local
content as a whole. Independent review of persistence found no actionable issues.
The old-format conversion SQL and its preservation-only test setup were removed;
an audit found no other projection payload converters or runtime compatibility
readers.

Browser checks with synthetic API responses verified the four-step wizard,
reviewed metadata creation, saved-plan Apply and Save/reload, a future source
entering the longer period, and unchanged entered dates. The details dialog fits
at 390px without horizontal overflow. After consolidation, browser checks repeated
wizard creation and Save/reload with nested API responses. Changing duration,
notes, and history preserved the other content fields and original snapshot.
The final browser console had no errors or warnings. React Doctor reported no
errors and 11 warnings. Its wider scan now includes existing allocation-editor
complexity and size warnings and a staffing-list index key. The other warnings
remain component complexity/size, similar table markup, and the loading-flag
false positive. No warnings were suppressed.

This increment is accepted.
No live financial or personnel read, database deployment, push, or merge occurred.

## Stage 5a: funding outlook and source drilldowns

The user approved this increment on November 9, 2026 after reviewing the running
guided demo and six decisions needed by the current source model. Use the demo's
separate balance lines, selected-source view, zero line, first-shortfall marker,
summary table, and expandable explanations as the behavior reference. Implement
these views using the current document and calculations without carrying forward
the demo's code or financial rules.

Group imported task sources under their project in the table, with expandable
task rows. Hypothetical funding remains standalone. The chart initially shows
one line per funding source, with a Group by project option. Project totals are
display summaries only. A task shortfall remains visible when another task makes
the project total positive. Identify the first month with a strictly negative
balance, including a shortfall that recovers before the plan ends.

Allow users to show or hide chart lines. These view choices do not change the
document, forecast, totals, or overall shortfall summary. Selecting one source
opens its focused detail view. Start each series at its first calculated month;
leave earlier months blank. Sources beyond the forecast period stay listed with
their existing explanation. Combined funding figures must not imply that sources
captured or available at different times shared one opening balance.

The outlook and staffing timeline share a series palette backed by Walter's
existing Gunrock CSS color tokens. Use the complete source list for color
assignment so hiding lines preserves source colors. Shortfall markers use the
theme's error color; expenditure-category colors retain their separate mappings.

Show the selected source's salary, fringe, and other forecast costs, with
expandable category and monthly tables. Label the total Net forecast costs so
signed expense credits remain understandable. Preserve booked costs in the
monthly detail and explain that capture-month spending is already included in
the captured balance. Fee remission remains within category 08 in this view;
category restrictions are added in Stage 5j; category editing is a separate
pre-ship requirement below.

List appointments allocated to the selected source, their shares and dates, and
links to the appointment and allocation editors. Link to the source's funding
and expense editors as well. Do not assign reconciled dollar totals to individual
appointments: capture-month booked personnel costs are netted after aggregation
and cannot reliably be attributed to a person.

Include a compact count of appointments with unallocated time or overlapping
funding, linked to Staffing. Count appointments once per issue type within the
forecast period. Keep allocation coverage distinct from a funding source's
balance shortfall. Both remain saveable under the existing rules.

This increment changes presentation and navigation. Stage 5e completed temporary
preview removal, and Stage 5k completed category rebudgeting. Stage 5m records the
final isolated workflow review. Rollout criteria remain open; reset/refresh remains
deferred.

Verification passed all 710 client tests across 75 files, the production build,
TypeScript, changed-file ESLint, formatting, and diff checks. New tests cover
positive project totals with task shortfalls, recovered shortfalls, chart-only
visibility, later captures and funding, outside-period and empty sources,
booked spending versus net forecast costs, signed credits, and distinct
appointment gap/overlap counts. Source-detail links retain appointment-relative
shares and open the saved allocation period even when it is outside the forecast.
Independent review found no remaining correctness issues.

Browser checks used synthetic API responses through the saved-plan production
route. They verified project expansion, line filtering without changing totals
or dirty state, source selection, allocation-editor navigation, recovery after a
shortfall, and later funding. Both overview and source details fit at 390px without
page overflow. Final browser checks reported no console errors or warnings.
React Doctor reported no errors and two warnings: existing workspace complexity
and a static warning about Recharts inside the deferred chart component. The
production build emits a separate chart chunk; no warnings were suppressed.

The shared-palette follow-up passed all 18 targeted outlook, allocation, and
source-detail tests, plus the production build, TypeScript, lint, and formatting.
The generated CSS retains every referenced Gunrock and semantic color token.

This increment is accepted. No server, database, or calculation-engine changes
were required.

## Stage 5b: saved-plan dashboard and minimal Review

The user approved these decisions on November 9, 2026. Faculty should see enough
information to make the next decision, with additional detail available on request.
Keep the guided wizard's final Review short: shared outlook totals, a compact
summary of source shortfalls and appointment funding gaps or overlaps, and a
collapsed source balance table. Direct edit links return to Funding sources,
Staffing, or Other expenses while preserving the draft and notes. Warnings do not
block creation. The final action still saves before opening the workspace;
uncertain creation freezes the submitted inputs for an idempotent retry.

Replace the metadata table with saved-plan cards showing the name, optional notes,
forecast dates, appointment count, projected ending balance, and a small combined
balance chart. Keep the earliest source shortfall visible even if the plan's
combined balance remains positive or the shortfall recovers. Empty or outside-period
forecasts show no forecast data rather than an invented zero. New, Open, Duplicate,
and the workspace's return link retain their existing behavior. The cards use saved
inputs and never create a default plan or capture a new plan automatically.

Load each saved document independently after the list appears. A slow or failed
preview leaves other cards and plan actions usable, with retry available on that
card. A changed version discovered by the list refreshes the corresponding preview.
The compact SVG chart uses the shared Walter palette and preserves missing months.
It does not add another charting dependency or duplicate financial calculations.

Include a separate Current project balances panel with one total and a collapsed
project/task breakdown. Extend the existing authorized source catalog response with
each task's budget minus spending minus commitments and its UTC capture time. This
reuses `CaptureSourcesAsync`, its eligibility policy, and `usp_GetProjectionSeed`;
it requires no new SPROC, personnel read, database field, or saved-plan mutation.
The panel loads independently from saved plans and explains the retrieval time in
its details. Current balances do not replace the captured inputs of saved scenarios.

Verification passed all 718 client tests across 77 files and all 145 projection
controller tests. Coverage includes independent loading and failure, retries,
current balances versus saved inputs, task shortfalls hidden by positive project
totals, recovered forecast shortfalls, empty forecasts, changed saved versions,
Review navigation retaining notes and the original capture, and frozen inputs after
uncertain creation. A regression also holds an older preview read while the list
discovers a newer version, then verifies a fresh read without looping when the
detail is newer than the list. Version comparison retains exact server ticks.
Production build, TypeScript, changed-file ESLint, formatting, and diff checks
passed. Independent review found no remaining correctness issues.

Browser checks used synthetic API responses on the production routes. They
verified current project/task balances separate from saved forecasts, collapsed
details, notes surviving a return to Staffing, recovered and outside-period source
details, and final creation opening the saved workspace with those notes intact.
Dashboard and Review fit at 390px without page overflow. Final browser checks
reported no console errors or warnings. React Doctor reported no errors and 12
existing warnings across the wider branch: editor complexity/size, a staffing-list
index key, the wizard loading-flag rule, and the static Recharts warning inside the
deferred chart component. No warnings were suppressed. Existing NuGet audit
advisories remain outside this increment.

This increment is accepted.

Stage 5e completed temporary preview removal, and Stage 5k completed category
rebudgeting. Stage 5m records the complete isolated guided-workflow review.
Rollout criteria remain open; reset/refresh remains deferred.

## Stage 5c: guided-workflow review refinements

The user authorized these refinements after trying the complete guided workflow
on November 9, 2026. Opening New plan captures funding automatically while name,
optional description, and duration remain editable. Capture does not require a
name and does not overwrite details entered while loading. Loading failures offer
Retry funding; Continue requires a valid name and a completed capture. An untouched
automatic capture alone does not trigger a discard warning or create a saved plan.

Funding sources use one searchable list grouped under captured project names and
numbers. Each task's checkbox, dates, planning balance, and Edit action appear
together. Captured project identity remains visible even when a source is renamed.
Unchecked tasks remain searchable and can be reselected with their edits intact.
A project checkbox controls all its tasks, including siblings hidden by search.
Initial selection has no separate Add funding source dialog; Add planned source
remains available. After initial selection, adding a real source still imports
fresh data and does not automatically import staff.

Review's edit links and Back offer Return to review from earlier steps without
recapturing data or repeating roster selection. Open editor changes must be applied
or canceled before changing steps. The final Create action and its frozen,
idempotent retry behavior remain unchanged.

Other expenses shows spending history as a compact inline summary and Change
button. Its existing dialog still requires Apply or Cancel. A new expense form
does not show validation errors before interaction; invalid amounts still block
Apply, and zero or negative amounts remain valid.

Follow-up review narrowed initial staffing to selected tasks rather than their
parent projects. An appointment funded only by an unchecked sibling task is no
longer included. Membership comes from the personnel rows even when an unsplit
salary means allocations cannot be constructed yet. Later source additions and
removals still retain the existing roster.

The user retained the per-source Other expenses layout. Its selector now states
which source's history and added expenses are displayed and charged. The expense
dialog identifies the charge source with its captured project identity. Neither
the user nor browser investigation could reproduce the reported disappearing
options; a regression verifies source choices survive adding the first expense,
with distinct history values and expenses kept on their selected source.

All 729 client tests across 78 files and 179 targeted projection controller and
seeding tests pass, along with the production build, TypeScript, changed-file
ESLint, formatting, and diff checks. New regressions cover
single capture under StrictMode, details entered during loading, untouched-capture
cancellation, Return to review preserving staffing edits, project/task selection
and search, clickable checkbox labels, expense validation after interaction,
selected-task roster membership including unsplit rows, and expense source
selection retaining all choices and correct ownership.
Independent review found no remaining correctness issues. React Doctor reported
no errors and 14 warnings across the staged branch, covering component complexity
and size, the existing staffing index key, and static loading/chart diagnostics.
The loading reset is guarded inside `finally`; the chart is already deferred.
No warnings were suppressed.

Browser checks against the synthetic API verified automatic loading, an unchecked
task remaining searchable and reselectable, project identity, description retention,
Return to review, history cancellation, quiet initial expense validation, and final
creation opening the saved workspace. Selecting only Coastal research task 01
includes Alex while excluding Jordan and Casey, who are funded only on task 02.
The funding layout fit at 390px without page
overflow, and the browser reported no console errors or warnings. These checks do
not establish real backend, authentication, or datamart readiness.

This increment is accepted. Stages 5d and 5f record the subsequent isolated
real-data checks. Stage 5e completed the structural cleanup and temporary preview
removal, and Stage 5g records the staffing layout refinements. Rollout criteria
remain open.

## Stage 5d: isolated real-data backend review

The functional workflow is committed as `65fe73a6`. The real .NET backend now runs
with a separate local SQL Server application database containing all 13 branch
migrations. The local PI and PM login identities were copied from the configured
test application database; the review uses the existing development login flow.

The shared WalterDev datamart still has the older projection procedure without
the required `SnapshotAt` parameter. To keep schema changes isolated, a second
local database contains the branch's projection tables and six required stored
procedures, plus copied real records for one representative PI's 16 associated
projects. The copy includes 3,895 cost rows, five personnel funding rows, project
and team records, related identities, and the real category and benefit lookups.
It preserves raw values and identifiers. Source portfolio and personnel loads are
dated November 9, 2026. No shared database schema or data was changed.

The actual application returns 19 eligible funding sources and five appointments,
including internal and sponsored projects and a project with multiple tasks.
All retained appointments have salaries and matching task provenance. Browser
creation, notes editing, Save, and reload passed. API duplication preserved the
document and snapshot; retrying the creation key returned the same duplicate.
A stale save returned 409. Anonymous reads returned 401, unrelated local-user
reads returned 403, and the PI's reads succeeded. The local procedure audit log
recorded no failures. The optional profile photo is unavailable under local login.

This establishes a working real-backend path against copied real data. It does
not establish continuous datamart refresh, shared procedure deployment, Entra SSO,
or full financial reconciliation. Review additional portfolios and compare their
captured inputs and forecasts before release. Other Walter pages that depend on
Redshift are outside this scoped local datamart.

The parallel branch review found no confirmed correctness defect or need for a
broad architecture rewrite. Recommended cleanup order:

1. Move necessary fixtures under tests, replace temporary preview-router test
   dependencies with production components/routes, and remove the preview code.
2. Share the strict client date validator used by sources, appointments, and
   allocations while keeping each caller's required-date rules explicit.
3. Reduce repeated operation/session bookkeeping within each existing owner,
   preserving immediate refs and save/conflict behavior.
4. Reuse the existing dialog lifecycle for allocation editing with its required
   width and focus behavior.

The stale project-wide staffing wording in the calculation reference has been
corrected. Keep the pure financial operations, exact task matching, creation
idempotency, concurrency checks, and current greenfield document format.

## Stage 5e: production cleanup

The approved cleanup keeps the existing calculation, editing, and persistence
boundaries. It removes the separate development preview entry, scenario controls,
synthetic server, browser global, and temporary calculation-review script/module.
The tests now mount production session/workspace components with test-owned router
navigation and explicit state handles. Only used fixtures and a reduced persistence
double remain under `web/client/src/test/`.

The coverage audit retained salary, date, fee, conflict, delayed-save, and
navigation assertions. It added the missing imported-salary boundary where the
snapshot falls in the configured COLA month: the captured rate stays unchanged
that month, and the first annual adjustment occurs the following year.

Appointments, sources, and allocations share one strict date validator; each
caller retains its own nullable-date and required-start rules. Saved-session and
wizard operation helpers reduce repeated apply bookkeeping while keeping source
selection explicit and immediately advancing session refs. Rejected operations
leave the last saved confirmation intact. The allocation editor uses the shared
dialog lifecycle with its existing wide layout, initial date focus, Escape
cancellation, and funding-cell fallback focus.

Verification passed: 750 client tests across 79 files, TypeScript, the production
build, changed-file ESLint and formatting, and independent read-only review.
React Doctor remains at 85/100 with 14 warnings and no errors. The real-data UI
confirmed initial date focus, Escape discarding an unapplied allocation change,
and focus returning to the original funding cell. No database or financial-policy
changes are part of this increment. The isolated real-data backend remains
available for review.

## Stage 5f: additional isolated real-data reconciliation

Three contrasting portfolios were copied from WalterDev using read-only source
queries. All inserts and procedure audit writes stayed in the existing isolated
local datamart. The application database and shared databases were unchanged.
The copy added 244 projects and 152,494 cost rows, plus associated portfolio,
personnel, and identity records. Existing review data was preserved.

| Portfolio                           | Active project/task pairs | Eligible sources | Retained appointments | Unsplit appointments requiring salary |
| ----------------------------------- | ------------------------: | ---------------: | --------------------: | ------------------------------------: |
| Large appointment roster            |                        67 |               41 |                   988 |                                     3 |
| Multiple tasks and split earn codes |                        82 |               65 |                    66 |                                     1 |
| Small mixed portfolio               |                         6 |                2 |                     3 |                                     1 |

The 988-appointment portfolio is excluded from representative acceptance and
performance requirements at the user's direction. It is suspected to be a
catch-all or anomalous source portfolio; that explanation has not been verified.
Its completed arithmetic checks remain part of the evidence totals below, but
no additional investigation or UI scaling work is planned for that outlier.

Independent aggregation of the copied records matched all 354 budget/category
rows, 551 monthly cost rows, and 178 returned three/six/twelve-month expense
averages from the branch seed procedure. The check used a fixed November 9, 2026
snapshot. The production datamart adapter and seeder then captured fresh drafts
using the current snapshot clock. All 1,061 captured appointments matched their
source salary/FTE/CBR grouping rules and independently reconstructed allocation
shares and dates, including excluded-source funding and residual outside funding.
After initial task selection, 1,057 appointments remained.

A separate daily calculation matched 198 salary/fringe month-category results
for November, December, and January from the production TypeScript calculator.
It independently intersected source, appointment, and allocation dates, applied
salary/FTE/share and benefit rates, and subtracted snapshot-month booked costs.
No numerical discrepancy was found in these checks.

The records contain 132 split and eight unsplit earn-code rows. Five retained
appointments correctly have no imported salary or allocations because their pay
is unsplit; the user must supply assumptions before saving. One retained
appointment has no matching CBR lookup and correctly receives the agreed 20%
default. Neither behavior requires a new policy decision.

Limits: this sample contains no raw missing salary/FTE or unmatched task rows,
so those cases retain automated-test coverage rather than additional real-data
evidence. The monthly hand checks cover personnel, not a full independent
reimplementation of every expense and future COLA calculation. This pass did not
create additional saved plans, repeat browser/access checks for the new identities,
or measure browser performance for the 988-appointment portfolio. The earlier
isolated create/save/reopen/access checks still apply. Shared procedure deployment,
Entra authentication, and controlled rollout remain unverified.

Private row-level evidence and temporary comparison programs remain outside the
repository in the local review directory. Only aggregate results are recorded here.

## Stage 5g: wizard layout alignment with the guided demo

The user selected the guided demo as the visual and interaction target while
keeping the rebuilt feature's terminology and capabilities. This increment covers
the complete four-step wizard. The saved-plan dashboard and workspace remain the
next visual review increment; shared editor styling also improves their dialogs
and content panels.

The wizard uses the demo's page hierarchy, connected numbered progress indicator,
compact plan-detail grid, selected funding cards, icon actions, and footer layout.
Visited steps are navigable through the existing validation and pending-edit
guards. The dashboard return uses the same discard confirmation as Cancel setup.
Review summarizes funding sources, appointments, and other expenses in three edit
cards while retaining outlook totals, warnings, source details, and notes.

Single-task funding sources use one selection control and show project identity
once. Multiple-task projects keep all/partial project selection and individual
task controls in bounded keyboard-scrollable lists. Search still selects a whole
project even when some of its tasks are hidden. Renamed sources keep their names.
Staffing retains appointment assumptions, hypothetical hires, the monthly funding
schedule, explicit allocation dates in the funding editor, and outside funding.
Other expenses remains
scoped to one funding source, with historical/added/combined forecast summaries
computed by the existing expense calculator.

No financial policy, persistence contract, schema, or source-data behavior changes.
The demo's indirect-rate display remains deferred because the current contracts
do not supply that value. Current terminology remains authoritative: funding
sources, appointments, allocations, historical estimates, and added expenses.

Desktop and 390px browser checks passed all four steps, source selection,
source-scoped expenses, visited-step navigation, and guarded cancellation. The
isolated real backend created and reopened the UI alignment review plan with no
pending changes. All 751 client tests across 79 files, TypeScript, production
build, changed-file lint/formatting, and independent code review passed. React
Doctor remains at 85/100 with 14 warnings and no errors. The only browser console
error was the expected unavailable profile photo under local development login.
A follow-up comparison at matching desktop/mobile viewports confirmed the same
loaded Proxima Nova font and theme tokens as the demo. Presentation now matches
its text weights, supporting contrast, two-line source titles, compact metadata,
section icons, and stable source color markers. Repeated task identifiers are
suppressed while distinct names remain available. Edit appointment and Edit
funding remain separate actions.

The reported allocation case involved an active appointment whose assigned funding
source had already ended. The stored 100% allocation therefore provided no eligible
funding in the selected month; choosing Entire appointment did not extend the
source's dates. The replacement logic was unchanged. The editor now explains
appointment bounds, marks inactive months correctly, and prominently shows funding
source bounds when they cover only part or none of the replacement period. Out-of-
range allocations remain saveable under the accepted policy. Regression checks
cover funding an active empty month and saving/reopening, entire-appointment
replacement, expired-source gaps, and switching to an eligible source.

Follow-up verification passed: all 754 client tests across 79 files, production
build, TypeScript, changed-file lint/formatting, and independent review. Browser
checks reproduced the expired-source case and confirmed that changing the selected
month to valid outside funding updates its coverage. Shared editor headings were
deduplicated in the saved workspace. React Doctor reports 85/100, 16 warnings,
and no errors; the additional warnings concern component size/complexity.

The staffing follow-up removes the redundant allocation dates/shares disclosure
and timeline instruction sentence at the user's request. Cards put name, title,
and FTE together, with annual full-time salary and fringe (CBR) on one line below.
Separate Edit appointment and Edit funding actions remain. The funding dialog
follows the demo's stacked layout: a shaded header with calendar allocation badge
and close button, Apply range with dates on the right above the month strip,
then a full-width funding split and separate footer. It uses the demo's width,
spacing, typography, borders, plus/delete icons, and outline Cancel button.
The primary action names the replacement range; partial dates and open-ended
modes have distinct labels. Late-month openings reveal the selected month in the
strip. Exact dates, all replacement modes, precision, outside funding, and
date-bound warnings remain available. Warnings appear when relevant rather than
repeating general date instructions in every dialog.

Assigned timeline segments now show red stripes and a warning icon when that
source's total projected month-end balance is below zero. A card badge identifies
appointments with such months. This uses the same category-summed source balance
as the outlook, without pooling other sources or changing allocations or forecast
costs. Zero does not warn; a recovered month clears its warning. Unallocated and
inactive periods retain their existing treatment. Stage 5j replaces this total-only
staffing rule with salary/fringe checks for sponsored sources.

The CBR check found no unit conversion error: the copied lookup supplies 2% for
the current graduate-student appointments and 20% for the postdoc. Imported rates
remain unchanged; 20% remains a missing-rate default, not a minimum. The editor
now names the actual rate offered by its lookup action and identifies the job code
and business unit. The copied table does not establish workbook freshness or an
individual employee's payroll assessment.

Staffing verification passed all 757 client tests across 81 files, production
build, TypeScript, and changed-file lint/formatting. The first concurrent run had
three timing failures; the complete rerun with two workers passed. Desktop and
390px browser checks confirmed the compact cards, responsive funding dialog,
live allocated total, explicit CBR action, and a source-specific red shortfall
segment beside a healthy month. React Doctor reports 88/100 with 15 warnings
and no errors; removing the disclosure also removed its index-key warning.

The allocation dialog's demo-alignment pass passed all 758 client tests across
81 files, production build, TypeScript, and scoped lint/formatting. Browser
comparison at matching desktop viewports confirmed the stacked layout and framed
header/footer. Desktop and mobile checks covered close-button discard, unchanged
plan state, and revealing a late selected month. Regression coverage also checks
exact replacement labels, partial/open ranges, invalid dates, and focus return.
React Doctor remains at 88/100 with 15 warnings and no errors.

Funding gaps and overallocations now appear as header badges rather than a
collapsed section. Hover, focus, or click reveals consecutive month ranges,
separating partially allocated months from fully unallocated months. These labels
use daily coverage flags, so offsetting gaps and overlaps remain visible even
when a month's average is 100%. Inactive and healthy months break ranges.

Allocation segments show demo-style detail cards with the source name, project,
task and award identity, plan dates, planning balance, and projected month-end
balance. Repeated names are omitted from metadata. Shares are identified as
averages over active appointment days. Cards use existing source totals across
categories, preserve zero balances, and explain outside funding without inventing
a balance. The unavailable indirect-rate field remains omitted. A single monthly
balance map supplies both cards and shortfall warnings.

Month focus exposes funding details to keyboard users; moving between segments
and months keeps one timeline card open. Cards remain hoverable and Escape
dismissible, and clicking a month closes its card before opening the editor.

Verification passed all 764 client tests across 83 files, production build,
TypeScript, and changed-file lint/formatting. Real-data browser checks confirmed
the partially allocated June and unallocated July–October ranges, badge hover and
click, moving onto a source card, keyboard month details, Escape dismissal,
click-to-edit, and viewport-fitting mobile cards. Shared tooltip regressions
cover hover/click/focus interaction and replacing cards across months. React
Doctor reports 88/100 with 16 warnings and no errors.

The visual increment was approved and committed as `5ef2c492`.

The allocation follow-up groups funding sources by whether they cover all, part,
or none of the selected active appointment dates. Groups update when dates or
replacement modes change; invalid dates show a request to check the range. Every
source remains selectable. Date-limited splits show an amber assigned percentage,
with distinct explanations for partial coverage and no coverage. Applying still
records the allocation without extending source dates or changing the calculation.

Add allocation fills the remaining appointment share, so an existing 25% proposes
75% and an empty split proposes 100%. Outside funding counts toward the total.
The exact remainder is preserved on Apply. The new source remains unselected;
full or excessive totals and invalid percentages leave the new share blank.

Verification passed all 768 client tests across 83 files, production build,
TypeScript, and scoped lint/formatting. Browser checks confirmed coverage groups,
partial versus absent coverage, the 25% to 75% default, and applying a mixed split
while preserving the uncovered portion. Mobile layout remains usable. No browser
test changes were saved. React Doctor reports 88/100, 17 warnings, and no errors;
the additional warning concerns component complexity.

This follow-up was approved and committed as `895a5917`.

## Stage 5h: search-and-add funding selection

The user selected Search and add after comparing three interactive alternatives.
New plans start with no funding sources selected. The common path is to find one
project and add all of its tasks. Selecting one task must also be easy, without
first reviewing or deselecting the rest of the portfolio.

Search matches project names and numbers, task names and numbers, and useful
captured metadata where available. Project actions include all eligible tasks in
that project, regardless of which rows match the query. Task-only matches retain
their parent project identity and can add just that task. A single-task project
shows one source card with its name, balance, dates, and editing controls. A
multi-task project shows its name once above a responsive grid of selected task
cards. Task cards show the task identity without repeating the project name.
Change tasks opens a dialog with Select all, Clear all, Cancel, and Apply;
selection changes take effect only on Apply. Each task remains an
independent funding source with its own balance and forecast; grouping does not
pool funds. Planned funding and source detail editing remain available.

Initial staffing still comes only from selected task provenance, once when
leaving the funding step. Returning to that step preserves the plan's current
sources and appointments. Later imports add financial inputs without importing
staff. Saved plans retain their sources; the empty default applies only to new
setup. The same search-and-add control is used when adding sources to a saved
plan. There is no new requirement to select at least one source.

Accepted November 10. The shared picker keeps the complete project
group behind filtered results and prevents duplicate additions. Setup and saved
plans share visible financial cards; planned funding keeps its name and editing
controls. The task dialog participates in pending-edit navigation guards. Closing
a nested task dialog leaves the source picker open. The old selection checklist,
nested card wrappers, and collapsed funding-detail mode have been removed.
Source cards omit the captured-funding disclosure; captured inputs remain
available in the source editor and outlook details.

Validation: all 778 client tests passed across 83 files. TypeScript, the production
build, changed-file ESLint, and formatting checks passed. React Doctor reported no
errors (88/100; branch-wide warnings remain). Live browser checks against the
isolated local databases verified empty setup, adding all nine tasks in a real
project, selecting a single task by code, and preserving that selection on Back.
Card refinement checks covered a standalone single-task source, a visible grid
of three selected tasks, staged Apply, Escape rollback, and nested-dialog Escape.
Only the appointment associated with that task entered initial staffing; importing
another source afterward left staffing unchanged. No review plan was saved.
The user accepted this increment, including the simplified source cards.

## Stage 5i: saved-plan header and chart labels

Match the demo's compact plan heading, alert placement, icon buttons, and
full-width segmented navigation. Keep the production terms Funding outlook,
Funding sources, Staffing, and Other expenses. Manual save, unsaved-change
status, conflict handling, and navigation guards remain intact. Plan duplication
remains available from the dashboard.

Chart labels must handle long project and task names without hiding currency
values or overflowing the chart. Use compact display labels with identifying
codes, retain full source identities for hover and keyboard focus, and give
tooltip values their own aligned column. Keep the existing source identities,
colors, calculations, and chart navigation behavior.

Implemented for review November 10. The workspace builds the outlook once and
shares it with the header notice and chart section. The balance tooltip limits
names to two lines, keeps amounts aligned, and supports scrolling without changing
the selected month. Legend and line-control labels expose full identities on
hover and keyboard focus. Single-task projects retain their human-readable names.

Follow-up review names the first funding source to fall short in the header
warning, with its first shortfall month. Explore funding source now lands at the
source's forecast heading, balances, and chart below the sticky Walter header.
It no longer focuses the details section below the chart. Only explicit source
navigation moves focus, so browser Back and Forward retain scroll restoration.

Validation: 786 client tests passed across 85 files; the final tooltip event
isolation regression, TypeScript, production build, changed-file lint, and
formatting checks passed. React Doctor reported no errors. Desktop browser review
compared the live demo header and exercised a saved plan with 19 funding sources,
including mouse and keyboard tooltip scrolling and full-name keyboard tooltips.
The browser's viewport override did not change its rendered dimensions, so a
narrow-screen browser check remains unverified. No saved plan data was changed.
The shortfall follow-up passed 42 focused tests, TypeScript, production build,
lint, and formatting checks. Browser review verified repeated Explore clicks,
entry from Staffing, and exact scroll restoration when returning from expenses.
This increment is accepted and committed as `a58b495d`.

## Stage 5j: personnel category warnings and balances

The warning and display rules are agreed. Preserve the calculator's existing
category balances, snapshot reconciliation, date proration, and forecast costs.
This increment does not edit category budgets or change allocations automatically.

- `Sponsored` and `Sponsored Capital` sources use salary category 01 and fringe
  category 02 for staffing shortfall warnings. Neither category can cover the
  other. Other categories, including fees in 08, do not drive these warnings yet.
- `Internal` and hypothetical sources use their own general pool. Imported types
  that are not recognized show an unknown budgeting basis instead of silently
  assuming unrestricted funding. Classification uses the existing project type;
  neither category-row presence nor the budgetary-control flag defines this rule.
- A negative month-end balance marks the affected source segment red for every
  appointment with a positive eligible allocation to that source in the month.
  Other segments keep their source colors. Exactly zero is not a shortfall;
  recovered months clear the warning. Funding gaps remain a separate signal.
- Badges distinguish salary, fringe, both, and general-pool shortfalls. Their
  details identify the source, affected category and months, and deficit amounts.
  Existing and future deficits use the same warning. Source hover details retain
  clearly labeled total balances alongside sponsored salary/fringe balances.
- A missing salary/fringe budget row supplies no available funding. When that
  category is used, explain that no budget was recorded; do not fall back to the
  total source balance. Positive booked costs count as usage even when
  snapshot-month netting leaves no additional forecast cost. An unused missing
  category does not generate a warning.
- Sponsored source details show a compact category table with available balance
  at capture, forecast costs, and remaining balance at plan end. Salary and fringe
  come first. Other categories and the separate overall balance adjustment keep
  the table reconcilable with the source total. General-pool sources keep their
  total balance and category spending breakdown without category-deficit colors.
- Saved-plan staffing warnings focus the source's category table. General-pool
  warnings open the source outlook. Wizard staffing uses the same warnings and
  figures without linking to an unavailable saved outlook.
- Editing an overall planning balance does not change category budgets or clear
  a personnel category deficit. The sponsored balance editor explains this.
  Warnings remain informational; saving and editing allocations stay available.

The isolated copy provides concrete examples for verification. `SP0A252322` is
sponsored with one task and $156,941.58 available overall, but salary has
$65,105.00 and fringe is already $9,786.33 below budget. Its budgetary-control flag
is false. Internal task `FPAFST4784/COFGSS` records salary and fringe spending in
category rows with zero budgets while its funding sits in category 03; its pool
still has $12,943.75. Thus category-row presence would incorrectly classify this
internal source. All sponsored projects in the copied data have one task, but
that is not a schema guarantee; continue to preserve project/task identity.

Accepted and committed as `c7661e35`. All 814 client tests pass across
86 files, including category classification, missing-budget usage, per-month
warnings, and navigation focus. TypeScript, the production build, changed-file
lint, formatting, and diff checks pass. React Doctor reports 87/100 with 22
warnings and no errors; its branch-wide cleanup suggestions remain separate.

Read-only reconciliation against the isolated local databases confirmed that
`SP0A252322` ends November with $145,925.36 overall and a fringe deficit of
$9,930.85. Both allocated appointments warn for fringe in their active months.
The internal `COFGSS` appointment remains clear while its overall pool is positive.
Inputs and calculator results are unchanged by the new selectors.

Desktop browser review verified red sponsored allocation segments, salary/fringe
amounts in month tooltips, keyboard opening and dismissal of warning details,
direct category-table focus, normal Explore focus at the source heading, the
general-pool view, and the sponsored balance-editor explanation. The table shows
source identity at the warning-link destination and highlights negative starting
and ending category balances. No saved plan or database data was changed.

## Stage 5k: category editing and rebudgeting

The twelve design decisions and the implementation are accepted.
Budget changes are scenario assumptions; they do not alter booked expenses or
submit changes to upstream accounting.

- Preserve imported budgets, spending, commitments, and actuals. Store net
  category adjustments separately. Show captured available, net change, revised
  available, and forecast remaining. Work with money left after recorded spending
  and commitments, rather than asking users to reconstruct lifetime award budgets.
- Keep two distinct actions. Move budget chooses a donor category, recipient
  category, and positive amount, preserving the source total. Adjust funding adds
  or removes money in a chosen category, changing the total exactly once.
- Sponsored and Sponsored Capital totals are calculated from their category
  amounts. New changes must identify a category. Internal sources keep their
  general-pool balance editor. Unknown imported project types remain explicit.
  Automatically spreading a changed overall balance across categories is deferred.
- Use the existing unfiltered expenditure-category lookup, including 01 salary,
  02 fringe, and 09 indirect costs. Users can add a budget for a category absent
  from the capture, but cannot invent or rename finance categories. Explicit zero
  is distinct from absence. Scenario-funded salary and fringe categories use the
  normal balance checks while retaining the absence of a captured budget.
- A transfer may leave the donor below zero. Show before/after amounts and an
  inline warning; keep saving available. Moving salary budget does not
  automatically move fringe or indirect budget. Budget edits change available
  funding only, preserving forecast costs, snapshot-month netting, dates, and
  signed expense-credit behavior.
- Budget definitions apply throughout that source's forecast from its capture or
  planned start. No effective-dated budget movements in this increment. A planned
  source can model distinct future funding. Each imported project/task remains
  unique within the plan.
- Planned sources choose a Source type at creation: Internal uses a shared balance
  for all spending; Sponsored uses separate category budgets. An information icon
  explains the choice. That choice stays fixed afterward for v1.
  Category-based planned sources use the same
  salary/fringe warnings as sponsored sources; general-pool sources use total
  funding. Preserve the original entered pool or category amounts as Initial
  planned funding, separate from subsequent adjustments.
- Reset budget changes restores the entire source's starting budget definition,
  including originally absent categories. For planned funding it restores the
  initial entered amounts, not zero. It leaves dates, appointments, allocations,
  and expenses alone. Avoid resetting one side of a transfer independently.
- Retain a readable summary of net changes, not individual editing actions. For
  example, adding $5,000 to salary then reducing that change by $2,000 shows
  Salary +$3,000. Duplication preserves the baseline and adjustments. Source
  removal discards them; re-addition captures fresh data under the existing rules.
- Use the same budget editing operations in setup and the saved workspace.
  Apply commits the complete editor buffer; Cancel discards it. Pending input in
  a transfer or funding-adjustment panel must not disappear during outer Apply or
  navigation. Category balances link to the source editor.
- Top-level section navigation opens the chosen view without opening an editor.
  An outlook source selection does not carry over as a funding-source edit target;
  explicit Edit funding source and Edit budget actions still open that editor.

Implementation, verification, and user review are complete. The current
JSON document stores the initial planned funding and net category adjustments.
No schema migration, legacy-format conversion, or shared database change was
needed.

Verification passed 837 client tests across 89 files, 634 server tests, and all
19 isolated SQL integration tests. TypeScript, the production build, changed-file
ESLint, formatting, and diff checks passed. React Doctor reported 86/100 with
24 warnings and no errors. The warnings include the larger source editor and
budget editor, alongside existing branch cleanup items. Independent review found
no unresolved blockers.

Browser review in the isolated local database verified moving budget, adding
funding, negative donor warnings, save/reload, planned category creation, fixed
budget mode, and reset after reload. Budget reset preserved edited source dates
and restored initial planned amounts. A separate review plan kept the original
saved plan unchanged. Read-only reconciliation against that original confirmed
that captured financials, appointments, and forecast costs were unchanged;
transfers conserved the total, and added funding changed it exactly once.

Follow-up UI review verified that the Funding sources tab opens the list from a
selected source outlook, while explicit Edit actions still open the source
editor. Planned funding now presents Internal and Sponsored source types with an
information icon. The shared tooltip stays above native dialogs; Escape dismisses
the help without closing the editor. Targeted navigation, editor, and tooltip
tests passed, along with a fresh production build and React Doctor check. This
follow-up changed no saved plan data.

## Stage 5l: compact dashboard and plan actions

The dashboard uses the guided demo's compact card layout. New plan has a plus
icon, and Your plans shows the saved-plan count. Each card opens the plan, keeps
the dashed zero line, and places a prominent ending balance below its graph.
The footer shows forecast duration and appointment count; appointments are not
relabeled as distinct people. Long notes remain abbreviated. Per-source shortfall
warnings stay inside the plan rather than crowding the dashboard. Each preview
retains independent loading, failure, and retry behavior.

Duplicate moves beside Plan details in the workspace and retains its existing
saved-plan copy behavior. Pending changes must be saved first; a late duplicate
response must not silently discard edits or replace a subsequently chosen page.

Delete belongs inside Plan details, separate from its ordinary Apply/Cancel
actions. A confirmation names the saved plan and explains that deletion is
permanent. The existing API checks the exact loaded version and portfolio access.
Cancel and failure retain the draft. A stale version requires reloading before a
new deletion attempt; retries never silently acquire a newer version token.
Only confirmed deletion or a response confirming that the plan is already absent
bypasses the departure warning and returns to the dashboard. A lost response can
therefore be retried without creating a new deletion intent. Full-plan
reset/refresh remains deferred.

Implementation, verification, and user review are complete. All 849 client
tests across 89 files passed, including version-guarded deletion, failed reload,
lost-response recovery, and delayed copy/delete navigation. TypeScript, the
production build, changed-file ESLint, formatting, and diff checks passed. React
Doctor reported 86/100 with 24 warnings and no errors. Independent review found no
unresolved blockers.

Desktop browser review checked the card layout and full-card hit area, the moved
Duplicate action, disabled duplication with unsaved changes, named deletion
confirmation with Cancel focused, and preservation of unapplied details after
canceling deletion. Temporary edits were discarded. No existing saved plan was
changed, copied, or deleted during this walkthrough. No backend or database schema
change was required.

## Stage 5m: final isolated acceptance

The final acceptance pass used the running local backend with
`WalterProjectionReview_20261109` and `WalterProjectionData_20261109` on the
loopback-only review SQL container. No shared database, deployment, or identity
configuration changed. Temporary acceptance plans were removed; all nine
pre-existing plans' complete saved documents were verified unchanged. Datamart
writes were limited to the copied audit log, with no financial-table writes.

Three parallel reviews covered API lifecycle/access/concurrency, UI and category
fallbacks, and business-workflow consistency. One bounded defect affected both
category pickers when the financial category lookup failed with an empty cache:
Other expenses omitted categories introduced by saved budget adjustments, while
the funding editor omitted categories present only in saved expenses or history
overrides. Both now retain every category represented in the saved source rows.
Personnel categories remain excluded from Other expenses. Two regression tests
exercise lookup failure and successfully apply the resulting edit.

The real browser walkthrough verified the four-step wizard from empty funding
selection through saving and reopening an 18-month plan. It covered single-task
funding, adding all tasks then retaining a subset, task-based staffing, monthly
and entire-appointment allocation replacement, the remaining-share default,
source-scoped expenses, category budget transfers, and saved-plan duplication.
A transfer conserved the source total, cleared the fringe shortfall warning,
survived save/reload, and was preserved in the duplicate. Actual API reads
independently confirmed the persisted assumptions and identical duplicate content.

Responsive checks used actual 390px and 768px browser viewports. The wizard,
workspace, funding editor, category budget editor, and dashboard remained usable;
wide month strips and budget tables scroll within their own containers. Keyboard
checks covered Enter, Tab, Escape, initial Cancel focus in deletion confirmation,
and dismissing source-type help without closing its parent dialog. Browser
deletion checks stopped at confirmation and Cancel; temporary-plan deletion and
its concurrency behavior were exercised through the local API. Temporary browser
viewport overrides were reset.

API checks verified PI/PM access, unauthorized and anonymous rejection, creation
and duplication retries, exact-version save/delete conflicts, competing writers,
and invalid budget rejection without changing the saved version. All 851 client
tests across 90 files, 634 server tests, and 19 isolated SQL integration tests
passed. The production build, TypeScript, changed-file ESLint, formatting, and
diff checks passed. React Doctor reported 86/100 with 25 warnings and no errors;
the loading-flag warning points to code already inside `finally`. Remaining
warnings concern component size/complexity and existing performance suggestions.
Existing build-size and NuGet dependency advisories remain outside these fixes.

No unresolved v1 workflow defect was found in this pass. The 988-appointment
outlier remains excluded as agreed. Real Entra authentication, shared datamart
procedure deployment, and feature-flag/pilot rollout still require release
validation. This isolated acceptance does not establish those production results.
Previously deferred calculation questions and full-plan reset/refresh remain
deferred rather than being silently reinterpreted for release.

## Isolated dashboard and Projects support

The local review datamart now also supports the normal PI dashboard and Projects
page. It contains `PgmMasterData` plus the local-metadata version of
`usp_GetProjectSummary` and its parser from current main, and `PositionBudgets`
with `usp_GetPositionBudgetsLocal` from this branch. Read-only source queries
copied 254 award metadata rows and 28 position-budget rows, restricted to project
numbers already present in the isolated portfolio. All writes went to
`WalterProjectionData_20261109`; no linked servers or live-source dependencies
were added. No saved projection documents changed.

Browser verification passed for `/` and `/projects/1000005702`, including project
balances and the five-person personnel section. Projection list and source APIs
still return successfully. The Projects overview already exposes a Projections
link; broader link placement remains a separate UX decision. This extension is a
local review setup, not a deployment of the newer main procedure to shared SQL.

## Questions to resolve in their owning stages

| Before                        | Question or example                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Before exposing reset/refresh | Define their separate meanings, treatment of local edits, and snapshot replacement behavior.                             |
| Before release                | Validate real Entra access and shared datamart deployment; decide feature-flag and pilot rollout criteria.               |
| Later integration             | Define proposal batches, stale-preview handling, bounded undo, authentication, and interactions with pending form edits. |

## Reference evidence

Repository review baseline: main at `5de51e03af889030aa9306a8d0952c6a49ae0122`.
This records repository behavior, not live deployment verification.

- [Guided demo behavior at the reviewed spike commit](https://github.com/ucdavis/Walter/blob/5879ec7f83317660c3ff347e8f23b532bef4f46b/docs/guided-projections.md).
  Its synthetic and live calculation models differ. Use it for experience and
  behavior discovery, then establish numerical expectations separately.
- [Current projection document](../web/server.core/Domain/Projection.cs),
  [controller](../web/server/Controllers/ProjectionsController.cs), and
  [snapshot seeder](../web/server/Services/ProjectionSeeder.cs).
- [Current client contract](../web/client/src/queries/projections.ts) and
  [interactive calculation](../web/client/src/lib/piProjection.ts).

Keep this plan current as decisions change. Track implementation issues and PRDs
in GitHub according to [the issue-tracker guidance](agents/issue-tracker.md).
