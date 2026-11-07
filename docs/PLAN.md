# Projections implementation plan

Status: Stage 1a accepted. Stage 1b server save contract implemented; user review pending.
Updated November 6, 2026.

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
- Work in stages. Exercise the result and review its code before moving to the
  next stage. Prefer small, understandable changes and shared rules.
- Make the workspace inspectable in memory and support direct navigation to
  meaningful sections and editing targets.
- The salary calculation below and the three [Stage 0 workflow decisions](#stage-0-confirmed-decisions)
  are agreed: salary changes apply throughout the remaining applicable forecast
  period, editors use Apply/Cancel, and plans use explicit Save plan.
- Stage 1b uses the existing `UpdatedAt` timestamp for concurrency and saves the
  whole applied draft. A conflict offers Overwrite or Discard. The confirmed
  behavior and implementation stops are recorded below.

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
example, `setJobMonthlySalary` identifies a job and an explicit full-time monthly
amount. Later operations can change FTE, replace a funding schedule, or regenerate
spending estimates. Avoid arbitrary field paths as the public editing contract.

Salary edits target a stable job or appointment ID. A Person's name does not
identify a particular appointment. Keep the distinctions between Person, IAM ID,
and Employee ID in [CONTEXT.md](../CONTEXT.md).

Projects and jobs already have projection-local IDs. Persist stable expense and
funding-entry IDs when those editors are added. Do not use names or array positions
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

A proposed saved-plan address is
`/projections/{iamId}/{planId}?section=staffing&job={jobId}`. Add project, allocation,
expense, and month targets as their editors arrive. Validate targets, reveal and
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

- Add a seed-only read so opening a fresh draft does not create a saved row.
- Support saving an edited new draft and duplicating a snapshot without reseeding.
- Check a server concurrency token on mutations that can discard another edit.
- Persist plan settings and stable nested IDs cleanly as their features arrive.
- Validate structure, references, dates, and numeric values while allowing
  supported incomplete assumptions such as a missing salary.
- Keep captured source facts unchanged by scenario editors. Editing a scenario
  must not modify upstream accounting or personnel source records.
- Make history-window changes explicit in the draft. Saving should preserve the
  reviewed estimates instead of unexpectedly regenerating them.

Retain document storage rather than introducing a relational planning subsystem.
The demo stores plan settings inside a project record; the rebuild needs an
explicit plan-level metadata decision. Stage 1b reuses `UpdatedAt` and `SeededAt`
without adding a database column. Settle settings before the lifecycle or details
features that require them.

Fresh seed eligibility should have one named, tested owner. Apply dashboard rules,
group eligible tasks by project, and preserve excluded allocations as outside
funding rather than silently redistributing them. Current filters must not rewrite
an already saved snapshot. Decide the owning boundary in Stage 2.

## Stages and review stops

| Stage                         | Deliverable                                                                                                                                                                      | Review focus                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Behavior agreement         | Agreed salary calculation, edit timing, draft behavior, and navigation expectations for a small synthetic portfolio                                                              | Product decisions confirmed. Keep later questions assigned to their owning stages.                                                        |
| 1a. One local salary edit     | Open a representative plan; link to a job; edit and cancel salary; recalculate a useful project outlook; navigate without losing edits; invoke the same operation without the UI | State ownership, calculation clarity, component boundaries, keyboard behavior, and responsiveness.                                        |
| 1b. Save that edit            | Real saved-plan loading, conditional save, reload, failure recovery, and unsaved-change handling                                                                                 | Failed and conflicting saves preserve work; an in-flight response does not erase subsequent edits.                                        |
| 2. Plan lifecycle             | Fresh unsaved seed, save-as-new, duplicate, plan selection, and dashboard eligibility                                                                                            | Reopened and duplicated plans retain captured inputs; saved plans remain usable when fresh data is unavailable.                           |
| 3. Funding and staffing       | Project balances/dates, remaining job assumptions, hypothetical hires, and funding schedules                                                                                     | Review project editing, job editing, and allocation editing separately. Check FTE, date ranges, outside funding, and funding proportions. |
| 4. Expenses and details       | Monthly/one-time expenses, generated estimates, history windows, notes, and horizon                                                                                              | Explicit expenses survive regeneration; save/reload preserves the preview.                                                                |
| 5. Complete guided experience | Setup composed from existing editors, full project drilldowns, explanations, and controlled rollout                                                                              | Verify the complete workflow and genuine reuse.                                                                                           |

Every increment includes appropriate automated checks, a usable preview,
independent code review, and a review with the user before moving on. Split a stage
into smaller changes when it contains separate behaviors. Accessibility, access
handling, error states, and responsiveness are acceptance criteria throughout.

AI service integration, effective-dated salary schedules, real-time collaboration,
automatic merging, event sourcing, and browser persistence of real portfolio data
are outside the proposed initial implementation. Deferring effective-dated salary
schedules is a confirmed Stage 0 decision.

## Stage 0 confirmed decisions

The salary arithmetic and these product choices were confirmed on November 6, 2026:

| Decision                        | Agreed behavior                                                                                                                   | Consequence                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| When a salary edit applies      | Change the job's assumed full-time rate throughout its remaining applicable forecast period, leaving historical actuals unchanged | Scheduling a raise for a future month is deferred. Existing COLA assumptions still need their own fixture.             |
| When an editor changes the plan | Apply changes the in-memory draft and forecast; Cancel leaves them unchanged                                                      | Partial typing stays inside the editor. This retains a clear cancellation boundary.                                    |
| When a plan is persisted        | Explicit Save plan                                                                                                                | Navigation within a plan preserves the draft; leaving or reloading warns about unsaved work. Reload uses saved inputs. |

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

The reusable workspace owns one plan session, uses the existing
`computePiProjection` calculation, and changes salary through
`setJobMonthlySalary`. The separate Vite preview entry provides synthetic inputs
without requiring authentication or a backend. Existing application routes and
production persistence are unchanged.

From `web/client`, run `npm run dev -- --host 127.0.0.1 --strictPort` and open
[the salary editor](http://127.0.0.1:5174/projections-preview.html?section=staffing&job=101).
The normal production build includes only `index.html`; it excludes this preview
entry and its fixture. Preview changes are in memory and reload restores the
fixture. Save and unsaved-navigation warnings remain Stage 1b work.

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
preview remains available while the server save contract is built separately.

## Stage 1b confirmed decisions

These decisions were confirmed after reviewing the saving and conflict cases:

- **Normal Save** captures the whole applied draft and the exact `UpdatedAt`
  originally loaded. The database checks that timestamp as part of the write.
- **Conflict** offers Overwrite or Discard. There is no field comparison,
  selective reapplication, or automatic merge in v1.
- **Overwrite** captures the current applied draft when clicked. It replaces
  the saved editable document, including other users' ordinary edits that arrive
  after the warning. The user does not need to confirm the same overwrite again.
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
  Save never silently applies unfinished text in an editor.
- **Failed saves** retain local work. A lost response is an unconfirmed outcome;
  check saved state before retrying. An expired login must not redirect away
  from the draft without recovery.

Reset versus refresh needs its own product discussion before either action is
exposed in the new workspace. Stage 1b protects against the existing reset
endpoint without adding a reset/refresh UI.

### Stage 1b implementation stops

1. **Server save contract, current increment.** Use the existing timestamps for
   atomic checks, whole-document save and overwrite, and guarded reset/delete.
   Review the code and test against SQL Server before proceeding.
2. **Normal saving in the workspace.** Load a saved plan, save the applied draft,
   acknowledge the submitted version, preserve later edits, and handle failures.
3. **Conflict and departure behavior.** Add Overwrite/Discard, snapshot/deletion
   recovery, and Stay/Discard navigation handling. Exercise two browser tabs.

The current increment changes no frontend behavior. Its server contract requires
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

Save retains the existing whole `Projects`/`Jobs` payload contract, including its
captured history arrays, while preserving server-owned identity, snapshot, and
audit metadata. It does not merge or clear fields from the submitted document.
This also lets overwrite restore a project removed by an ordinary edit within
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
| `POST /api/projections/{id}/reset` | Body `expectedUpdatedAt`                     | Resets only the loaded version and advances both timestamps.                                                                                        |
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

The saved-plan client mutation still needs the new request fields in the next
increment. No save UI is connected yet. Review this server increment before
starting frontend saving or conflict handling.

## Questions to resolve in their owning stages

| Before                        | Question or example                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 1b                      | Verify benefit/vacation rates, fee remission, COLA, project date bounds, and current-month actuals against agreed examples. Do not infer correctness from the synthetic demo's totals.  |
| Stage 2                       | Where will plan settings live? Verify duplicate semantics, seed eligibility, task grouping, and saved-snapshot independence.                                                            |
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
