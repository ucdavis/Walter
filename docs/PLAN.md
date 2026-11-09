# Projections implementation plan

Status: Stage 1a and Stage 1b are accepted, including the calculation corrections,
shared snapshot timestamp, and fee rules. Stage 2a's fresh-snapshot read and
eligibility policy are accepted and committed as `5b5a7af3`. Stage 2b's wizard
completion and duplication are accepted and committed as `d524af0c`; New plan
saves before opening the view/edit workspace. Stage 3a's funding sources and
greenfield model cleanup are accepted and verified locally. Review the rebuild
for remaining legacy assumptions before proceeding to the staffing editors.
Saving remains available with funding gaps/overlaps.
CBR defaults to zero when no rate is available from the personnel source.
The projection model is greenfield and uses one current document format.
The project outlook starts at the snapshot month; historical spending remains
available for expense estimates and snapshot-month calculations.
Updated November 8, 2026.

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
- The final wizard order is Funding sources → Staffing → Expenses → Review.
  The third step may be labeled Other expenses. Build these steps incrementally;
  plan name and averaging-window setup belong within Funding sources.
- New plan opens the setup wizard. Its final Create plan action saves the
  reviewed inputs, then opens the saved plan's workspace. Canceling before the
  final Create action creates no saved plan; a failed create keeps the wizard
  inputs available for retry. Leaving after submission may still leave a saved
  plan if the server completed the request.
  Subsequent workspace edits use explicit Save plan.
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
- CBR is a numeric planning input. When no source rate is available, default
  it to 0 for now. A different default may be chosen later; none is selected.
  Do not add a missing-CBR state or incomplete-benefit warning for this default.
- Keep the vacation cost field's existing default of 0 and preserve supplied
  values. Add no new vacation-cost UI until the lookup's meaning is confirmed.
- Show the project outlook from the snapshot month forward. Retain captured
  monthly spending and its use in expense estimates and snapshot-month netting.
  Do not show reconstructed balances for earlier months or add warning UI.
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

For a full forecast month, before benefits, COLA, or other costs:

| Assumption or result                | Original | After salary edit |
| ----------------------------------- | -------: | ----------------: |
| Full-time annual salary             | $120,000 |          $132,000 |
| Full-time monthly salary            |  $10,000 |           $11,000 |
| Appointment FTE                     |      50% |               50% |
| Project A share of full-time salary |      25% |               25% |
| Project B share of full-time salary |      25% |               25% |
| Monthly charge to Project A         |   $2,500 |            $2,750 |
| Monthly charge to Project B         |   $2,500 |            $2,750 |
| Total monthly salary cost           |   $5,000 |            $5,500 |

The two shares fill the 50% appointment. Each is half of the appointment, even
though the UI expresses each as 25% of full-time salary. Changing the salary
alone preserves FTE and funding shares.

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

Begin with a read operation, navigation, and one typed salary operation. For
example, `setAppointmentMonthlySalary` identifies an appointment and an explicit full-time monthly
amount. Later operations can change FTE, replace a funding schedule, or regenerate
spending estimates. Avoid arbitrary field paths as the public editing contract.

Salary edits target a stable appointment ID. A Person's name does not
identify a particular appointment. Keep the distinctions between Person, IAM ID,
and Employee ID in [CONTEXT.md](../CONTEXT.md).

Funding sources and appointments have projection-local IDs. Persist stable expense
and allocation IDs when those editors are added. Do not use names or array positions
as durable edit targets. Keep monetary units, allocation units, date-only strings,
and planning months explicit at conversion boundaries.

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
source editors use `?section=funding&source={fundingSourceId}`. Add allocation, expense, and month
targets as their editors arrive. Validate targets, reveal and
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
- Validate structure, references, dates, and numeric values while allowing
  supported incomplete assumptions such as a missing salary.
- Keep captured source facts unchanged by scenario editors. Editing a scenario
  must not modify upstream accounting or personnel source records.
- Make history-window changes explicit in the draft. Saving should preserve the
  reviewed estimates instead of unexpectedly regenerating them.

Retain document storage rather than introducing a relational planning subsystem.
The demo stores plan settings inside a project record; do not carry that pattern
forward. Name and history window already have plan-level fields, which are
sufficient for the current lifecycle work. Retain the three-month default and
date-driven forecast horizon. Add proper plan-level storage when notes, custom
horizon, or inclusion settings arrive in their owning stage.

Fresh seed eligibility should have one named, tested owner. Apply dashboard rules,
and keep current filters from rewriting an already saved snapshot. Stage 2a
assigns this boundary to the server's fresh seed policy. Stage 3a replaces its
project aggregation with independent task sources and distinguishes deliberate
source omission from existing outside funding, as specified below.

## Stages and review stops

| Stage                         | Deliverable                                                                                                                                                                      | Review focus                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Behavior agreement         | Agreed salary calculation, edit timing, draft behavior, and navigation expectations for a small synthetic portfolio                                                              | Product decisions confirmed. Keep later questions assigned to their owning stages.                                                        |
| 1a. One local salary edit     | Open a representative plan; link to a job; edit and cancel salary; recalculate a useful project outlook; navigate without losing edits; invoke the same operation without the UI | State ownership, calculation clarity, component boundaries, keyboard behavior, and responsiveness.                                        |
| 1b. Save that edit            | Real saved-plan loading, conditional save, reload, failure recovery, and unsaved-change handling                                                                                 | Failed and conflicting saves preserve work; an in-flight response does not erase subsequent edits.                                        |
| 2. Plan lifecycle             | Wizard snapshot loading, creation on completion, duplicate, plan selection, and dashboard eligibility                                                                           | Wizard completion saves before opening the workspace; reopened and duplicated plans retain captured inputs even when fresh data is unavailable. |
| 3. Funding and staffing       | Project balances/dates, employee/job assumptions including fee remission, hypothetical hires, and funding schedules                                                             | Review project editing, job editing, and allocation editing separately. Check FTE, date ranges, outside funding, and funding proportions. |
| 4. Expenses and details       | Monthly/one-time expenses, generated estimates, history windows, notes, and horizon                                                                                              | Explicit expenses survive regeneration; save/reload preserves the preview.                                                                |
| 5. Complete guided experience | Setup composed from existing editors, full project drilldowns, explanations, and controlled rollout                                                                              | Verify the complete workflow and genuine reuse.                                                                                           |

Every increment includes appropriate automated checks, a way to try the result,
independent code review, and a review with the user before moving on. Split a stage
into smaller changes when it contains separate behaviors. Accessibility, access
handling, error states, and responsiveness are acceptance criteria throughout.

AI service integration, effective-dated salary schedules, real-time collaboration,
automatic merging, event sourcing, and browser persistence of real portfolio data
are outside the proposed initial implementation. Deferring effective-dated salary
schedules is a confirmed Stage 0 decision.

### Production cleanup before completion

Remove temporary development aids as the production workflow replaces them.
The final feature review must confirm this cleanup is complete, including:

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

| Decision                        | Agreed behavior                                                                                                                   | Consequence                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| When a salary edit applies      | Change the job's assumed full-time rate throughout its remaining applicable forecast period, leaving historical actuals unchanged | Scheduling a raise for a future month is deferred. Existing COLA assumptions still need their own fixture.             |
| When an editor changes the plan | Apply changes the in-memory draft and forecast; Cancel leaves them unchanged                                                      | Partial typing stays inside the editor. This retains a clear cancellation boundary.                                    |
| When workspace edits are persisted | Explicit Save plan                                                                                                             | Navigation within a plan preserves the draft; leaving or reloading warns about unsaved work. Reload uses saved inputs. |

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
`setJobMonthlySalary`. The separate Vite preview entry provides synthetic inputs
without requiring authentication or a backend. Existing application routes and
production persistence were unchanged by that increment.

From `web/client`, run `npm run dev -- --host 127.0.0.1 --strictPort` and open
[the salary editor](http://127.0.0.1:5174/projections-preview.html?section=staffing&job=101).
The normal production build includes only `index.html`; it excludes this preview
entry and its fixture. Preview changes are in memory and reload restores the
fixture. Stage 1b adds synthetic saving controls and departure warnings below.

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

In the preview console, `window.walterProjectionPreview.read()` returns a
detached snapshot of the draft, location, results, revision, dirty state, and
pending editor status. Editing that returned object cannot mutate the live plan.

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
preview remains available for subsequent increments.

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

| Endpoint                           | Required preconditions                       | Behavior                                                                                                                                            |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /api/projections/{id}`        | Body `expectedUpdatedAt`, `expectedSeededAt` | Stores the whole submitted name, history window, projects, and jobs. `overwrite: true` accepts intervening ordinary edits within the same snapshot. |
| `POST /api/projections/{id}/reset` | Body `historyMonths`, `expectedUpdatedAt`    | Resets only the loaded version and advances both timestamps.                                                                                        |
| `DELETE /api/projections/{id}`     | Query `expectedUpdatedAt`                    | Deletes only the loaded version.                                                                                                                    |

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

Try the [local saving preview](http://127.0.0.1:5174/projections-preview.html?section=staffing).
Its synthetic server copy lives in this tab's memory. Full browser reload resets
the example; Leave preview and Return to saved plan exercise reopening that copy.
The scenario controls allow the following checks:

1. Apply a salary change and Save. Confirm the checkmark and the server copy.
2. Enable Hold save requests, Save, apply another salary, then Finish pending
   save. The earlier salary is saved and the later salary stays unsaved.
3. Apply a salary change, select Another user saves, and Save. Close the warning
   to continue editing, then Save again and choose Overwrite or Discard.
4. Select Fail before saving or Save, then lose response. The draft remains
   available for manual retry; no automatic readback occurs.
5. Reset or delete the synthetic saved plan before saving. Overwrite is blocked.
6. Use Leave preview with pending changes or a held save. Confirm Stay/Discard
   or Stay/Leave anyway. Reload with an edited salary buffer uses the browser's
   standard warning.

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

The [booked salary preview](http://127.0.0.1:5174/projections-preview.html?example=booked&section=overview&project=1)
uses the same workspace with illustrative benefit rates. Each project has
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

Try the [date-boundary preview](http://127.0.0.1:5174/projections-preview.html?example=dates&section=overview&project=1).
It uses the agreed February/March job and funding dates with illustrative benefit
rates. Project A forecasts $1,125 in February and $564.52 in March. Project B
forecasts zero because its funding never overlaps the job. Changing annual
salary from $120,000 to $132,000 changes A's forecasts to $1,237.50 and $620.97;
B stays at zero. The existing Apply/Cancel and synthetic saving flow remain
available. This adds only an example to the temporary preview covered by the
production cleanup checklist.

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

CBR is numeric in the plan model and client contract. Seeding defaults an absent
source rate to 0. The saved model uses a plain decimal property; it does not
convert old JSON nulls. Vacation defaults and supplied values remain unchanged.
No default rate, official vacation assessment mapping, or fee-remission policy
beyond the agreed rules is implied by this cleanup.

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

The calculator can reconstruct earlier remaining balances from the snapshot's
captured balance and past spending, but these are not observed historical month-end
balances. The outlook filters out those earlier rows. This presentation change
retains the saved history, generated estimates, and calculator results, including
snapshot-month actuals and personnel netting. Stage 1b remains open for final
validation and review.

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

The [fee preview](http://127.0.0.1:5174/projections-preview.html?example=fees&section=overview&project=1)
shows each project's April actuals of $400 alongside a $375 fee forecast,
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
start date is later. A hypothetical job with no start date, or a start in or
before the snapshot month, also uses the snapshot base. Moving a hypothetical
job's start date moves its salary base according to the same rule.

Use the existing job source flag and start date; no schema change is needed.
This settles future-hire COLA timing. Stage 1b remains open for final review.

The [future-hire preview](http://127.0.0.1:5174/projections-preview.html?example=future-hire&section=overview&project=1)
uses a 50% appointment split equally between two projects. Each project starts
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
optional `@SnapshotAt DATETIME2` parameter, and save the exact same timestamp.
The query derives its reporting month from that value. Omitting the optional
parameter uses `SYSUTCDATETIME()`. This keeps the history
window and forecast in the same month even when a request crosses midnight or
the database and application use different local time zones.

Deploy the updated SQL procedure before the application that supplies the new
parameter. Existing saved plans keep their captured timestamps and inputs.
This change aligns period selection without synchronizing source imports;
Stage 1b remains open for final review.

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

Run the [executable calculation examples](../web/client/src/test/lib/piProjection.review.ts)
from `web/client`:

```sh
node scripts/review-projection-calculations.ts
```

They exercise the calculator and salary operation, check salary scaling, and
print examples for the deferred calculation questions. Conditional alternatives
are not regression assertions.

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
3, 6, or 12 months and defaults to 3. The response has ID 0 and no saved-plan
audit metadata; it retains the captured UTC snapshot timestamp. The response
is not cached. Opening existing plans remains independent of fresh seed data.

The server's `ProjectionSeedPolicy` owns fresh selection and grouping, including
the existing Create and explicit Reset paths that call the same seeder:

- Keep the seed query's project-level PI membership and ACTIVE project scope.
  Dashboard display rules do not broaden portfolio membership.
- Exclude internal tasks with status `Inactive`. For other project types, use
  the latest award end date across the project's tasks; exclude the project
  only when that date is before the saved UTC capture date. Keep missing dates
  and awards ending on the capture date. Award dates select projects; project
  dates continue to bound their forecasts.
- Group eligible tasks into one projection project. Sum category budgets,
  monthly actuals, and history-window estimates from retained tasks only.
  Preserve the earliest start and latest end among retained project dates.
- Keep excluded funding lines as outside funding, including their supplied
  shares and dates. Do not redistribute them to retained projects. A known
  excluded task is kept separate from an unmatched task.

Personnel is requested for the original seed project set so excluded allocations
remain available for that mapping. An empty seed skips the personnel query.
Fresh policy does not run when opening or saving a plan.

This increment changes the server boundary. Stage 2b adds the wizard and creates
plans from its reviewed inputs. No new settings column or persistence schema is
needed for Stage 2a.
Deploy the updated seed procedure before this application version so the source
provides `TaskStatus` and `AwardEndDate`. Older result sets omit those fields;
they cannot support the agreed exclusions.

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

Stage 2a and this increment are accepted. This increment introduced an interim
wizard with Plan, Staffing, and Review steps. Stage 3a replaces Plan with Funding
sources. The final sequence is
Funding sources, Staffing, Expenses, and Review; Other expenses remains an
option for the third step's label. Plan selects a name and a 3-, 6-,
or 12-month averaging window. Continue captures the portfolio once; later edits
and query refreshes do not recapture it. Staffing reuses the salary editor, and
Review shows the snapshot date and each project's balance and remaining forecast.
The averaging window is fixed after capture; canceling setup allows a different
window. Funding, employee settings, and expense editors follow in their owning
stages. Existing plan settings are sufficient; later metadata editors should
not store settings inside an arbitrary project record.

Clean up `NewProjectionWizard.tsx` as the remaining steps are added, including
using TanStack Form for input state and validation. This is a follow-up to the
accepted flow, not a prerequisite for this increment. Preserve the tested
creation retry and navigation behavior during that refactor.

The Create endpoint requires a reviewed draft containing the captured UTC
timestamp, funding sources, and appointments, plus the name, history window,
and creation key. It validates the document structure and source references,
then assigns the saved identity and audit metadata without another seed read.
Duplicate authorizes the source and copies its stored inputs without
consulting current financial or personnel sources. Normal Save retains its
existing concurrency checks.

Create and Duplicate use a client-generated creation key. A nullable key column
and filtered unique index per PI let concurrent requests return one saved row.
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

Status: accepted and verified locally. A review for remaining legacy assumptions
precedes the staffing editors. Publication and deployment have not been performed.

### Agreed document names and ownership

The plan contains `FundingSources` and `Appointments`. Each appointment has
`Allocations` referencing a `FundingSourceId`. Use `ProjectionFundingSource`,
`ProjectionAppointment`, and `ProjectionFundingAllocation` for their model types.
Keep actual project/task identifiers distinct from the plan-local source ID.

Appointments remain separate because one appointment can draw from several
sources and survives source removal. Expenses remain under their source for
the current rules. The future Expenses step can present those expenses together
without adding a third top-level collection. Reconsider expense ownership if
unallocated or split expenses become a requirement.

Use `FundingSources` and `Appointments` for the database column names as well
as the domain and API names. This is a greenfield system. Keep one current
document format without aliases for prototype fields, old request shapes,
or old navigation keys. Sources record their kind and capture timestamp explicitly.

Source IDs need only be unique among the plan's current sources. Removed IDs
may be reused by later additions. Plan and section bookmarks are supported;
durable bookmarks to a particular funding source after removal are outside the
current scope. Do not add a persisted source ID counter for that guarantee.

### Source selection and identity

Each imported project/task pair is an independent funding source, even when all
tasks of a project are selected. Keep its balances, costs, and allocations
separate. A project rollup summarizes its tasks without letting a task surplus
hide another task's shortfall. Rollup and graph toggles can follow later.

List projects with expandable tasks. Select all eligible tasks by default;
users can omit a whole project or individual tasks. Simplify the presentation
for a single-task project. Existing authorization and eligibility rules still
apply. Prevent the same task from contributing its finances twice.

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

For now, the initial roster includes only people paid on the selected projects.
This is deliberately project-level: someone paid only on an unchecked task of
a selected project still appears, with that task's share unallocated. Narrowing
the roster to selected tasks is a possible later refinement. Searching for other
people the PI pays on outside projects is also deferred.

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

Verify task independence, selected-project roster filtering, omitted and
unmatched allocations, fresh additions to older snapshots, future availability
of planned funds, financial-only additions, removal/re-addition, and preservation
of existing employee assumptions and older plans. Review this increment before
proceeding to the remaining staffing and allocation editors.

### Implementation and verification

The wizard now uses Funding sources → Staffing → Review. Funding sources includes
the plan name, averaging window, task selection, and shared source editors. The
initial Continue filters staffing to selected parent projects once. Subsequent
source changes preserve the roster. Expenses will join the wizard when its
editor is implemented in Stage 4.

The saved workspace has a Funding sources section with Apply/Cancel dialogs,
fresh authorized imports, planned funding, and confirmed removal. Source editor
URLs support direct navigation and Back/Forward. Pending typing participates in
the existing departure guard. The wizard and source forms use TanStack Form.

The new source catalog and import endpoints use the existing task-grained seed
query and authorization rules. Import returns captured finances and expense
estimates without reading personnel or saving a plan. No additional datamart
procedure change is needed for Stage 3a; the Stage 2a deployment prerequisite
still applies.

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

## Questions to resolve in their owning stages

| Before                        | Question or example                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before exposing reset/refresh | Define their separate meanings, treatment of local edits, and snapshot replacement behavior.                                                                                            |
| Stage 3                       | How do funding schedules behave at appointment/project boundaries, at zero FTE, and when FTE changes? Verify outside funding and distinguish incomplete assumptions from invalid edits. |
| Stage 4                       | Which generated estimates are replaced when the history window changes? When does editing an estimate turn it into an explicit planned expense?                                         |
| Stage 5                       | Verify per-project shortfalls remain visible despite surpluses elsewhere, and decide feature-flag rollout criteria.                                                                     |
| Later integration             | Define proposal batches, stale-preview handling, bounded undo, authentication, and interactions with pending form edits.                                                                |

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
