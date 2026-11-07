# Projections calculation review

Source review completed November 6, 2026, against `b508164b`. Saving is accepted.
The user accepted the snapshot-month rule below. Its correction is now implemented
for review; the other findings remain open.

## What the examples establish

Run from `web/client`:

```sh
node scripts/review-projection-calculations.ts
```

The [review examples](../web/client/src/test/lib/piProjection.review.ts) invoke
the existing calculator and salary operation. They check the agreed salary
scaling and existing additive-rate arithmetic, then print seven review
examples alongside independently worked alternatives. Those alternatives are
not regression assertions or accepted business rules.

The fixed salary example uses a $120,000 full-time annual rate, a 50%
appointment, and two projects each covering half the appointment. For this
arithmetic example only, use 30% CBR and 10% vacation assessment. These are
illustrative inputs, not current UC Davis rates.

| Per project, full forecast month | Before edit | After edit to $132,000 |
| -------------------------------- | ----------: | ---------------------: |
| Salary                           |      $2,500 |                 $2,750 |
| Benefits plus vacation           |      $1,000 |                 $1,100 |
| Total                            |      $3,500 |                 $3,850 |

The salary operation preserves FTE, funding shares, and captured actuals.
This is a full forecast month. It does not settle how a partly booked snapshot
month should work.

## Starting balance and the snapshot month

`SpentToDate` is an inception-to-date expense total, not spending through the
previous month. The portfolio import maps source `cat_itd_exp` into
`PpmExpenses`; the projection seed copies that value into `SpentToDate`.
Before this correction, the calculator started with
`budget - spentToDate - committed`, but treated that current balance as the
previous month's closing balance.

Consequences:

- Nonpersonnel current-month actuals were subtracted again.
- Salary and fringe current-month actuals were hidden in the calculated rows,
  while a whole forecast month was subtracted from a balance that already
  includes those booked costs.
- Historical end balances are reconstructed backward using current budgets and
  commitments. They are not observed historical balances.

Read-only SELECT checks against `WalterDev` confirmed exact reconciliation for
both an internal example and a sponsored task/category example: source ITD
expenses equaled prior-period detail plus current-month detail. In those cases,
the extra current-month deduction is demonstrably duplicate spending. Some
other categories did not reconcile. This verifies the defect, but does not
establish universal equality or a common cutoff across the two feeds.

Source paths:

- [Portfolio import](../pipelines/pipeline/RefreshFacultyDeptPortfolio.json)
- [Seed budgets and actuals](../datamart/StoredProcedures/usp_GetProjectionSeed.sql)
- [Current balance calculation](../web/client/src/lib/piProjection.ts)

### Accepted snapshot-month rule

Keep booked costs visible and unchanged. Start with the captured current
balance and deduct only additional forecast spending. For salary and fringe,
compute the remaining current-month estimate separately per project/category,
after summing all relevant jobs:

```text
remaining month forecast = max(full month estimate - booked month actual, 0)
month end balance = captured current balance - remaining month forecast
```

This calculation assumes the booked detail is already included in the captured
balance. Handling mismatched source cutoffs remains unresolved.

| Salary example for one project | Booked this month | Additional forecast |
| ------------------------------ | ----------------: | ------------------: |
| Planned month $2,500           |            $1,000 |              $1,500 |
| Edited planned month $2,750    |            $1,000 |              $1,750 |
| Edited planned month $900      |            $1,000 |                  $0 |

This avoids treating a lower salary assumption as a refund of booked costs.
Salary and fringe need separate comparisons because payroll and benefit
postings can arrive at different times. Future full months retain the agreed
salary formula. This rule is an estimate of costs still to be booked, not a
calendar-day payroll proration or a reconstruction of individual payroll runs.

For recurring nonpersonnel spending, the existing partial-month estimate can
remain an additional cost, without subtracting booked actuals again. Explicit
expenses remain additive even when assigned to a personnel category; the
booked-cost subtraction applies to the aggregate job estimate. The current
day convention excludes the snapshot day: October 16 leaves 15 of 31 days.
One-time expenses remain explicit additional planned charges. Fee-remission
handling needs its own decision because it can also be included in run rates.

The executable October example has current totals that explicitly include its
current-month actuals:

| Category      | Before correction | After correction |
| ------------- | ----------------: | ---------------: |
| Salary        |           $75,000 |          $77,500 |
| Fringe        |           $30,000 |          $31,000 |
| Supplies      |            $7,750 |           $7,850 |
| Fee remission |            $5,750 |           $6,500 |

The fee result stops deducting its booked $750 again, but retains the existing
$1,500 additional forecast. Treating that input as a full-month target would
instead give $7,250. That fee policy remains undecided.

Recommend showing historical actuals without claiming historical end balances.
Current budgets, commitments, and a limited expense history are insufficient to
reconstruct historical financial positions.

## Date boundaries

Two examples reveal bounds problems independently of the partial-month policy:

- An April 1 project receives January through March salary, fringe, and expenses.
  The calculator checks project end dates but ignores project start dates.
- A job ending March 10 and funding starting March 31 produce a full March
  charge despite having no overlapping dates. Job and funding windows are each
  reduced to months before being combined.

Recommend enforcing project start/end bounds and actual overlap among the job,
funding, and project windows. Whether a valid partial month should receive a
whole-month cost or daily proration remains a separate decision. Sequential
funding schedules within one month also need an explicit example before funding
editing is added.

## Benefits, COLA, and fee remission

| Area             | Existing behavior                                                                 | Review direction                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| CBR and vacation | Salary multiplied by the sum of two rates                                         | Arithmetic is consistent when both inputs are known; missing inputs must be distinguished from genuine zero.                |
| COLA             | Compounds annually after the snapshot month                                       | Consistent with a base salary expressed as of the snapshot. Keep this interpretation explicit.                              |
| Snapshot in July | July COLA is not applied again that year                                          | Appropriate if the captured salary is already the snapshot's rate; source freshness remains relevant.                       |
| Future hire      | An August hire can receive a July increase before starting                        | Decide whether a new hire's entered salary is a snapshot-date rate or the agreed starting salary when that editor is added. |
| Fee remission    | Fixed monthly job amount multiplied by funding share, without FTE or COLA scaling | Confirm the unit and eligible months before adding the editor; do not activate the unused $1,500 placeholder as a default.  |
| Fee run rates    | Category 08 contributes to generated nonpersonnel expenses                        | Adding a job-level fee can overlap those estimates; choose a single owner for that cost before enabling it.                 |

With a 3% July COLA, the example's per-project salary is $2,500 before the first
increase, then $2,575, $2,652.25, and $2,731.8175 in successive Julys. The
calculator retains precision and the UI formats dollars for display. Reopening
a saved plan does not advance its snapshot or apply new increases automatically.

UC Davis documents CBR and vacation leave assessments separately. Its title-code
CBR mapping is a planning estimate, not confirmation of an individual employee's
rate. Those sources support keeping the captured inputs explicit rather than
presenting this forecast as payroll-exact. [CBR and VLA](https://financeandbusiness.ucdavis.edu/finance/costing-policy-analysis/cbr),
[CBR lookup guidance](https://financeandbusiness.ucdavis.edu/finance/costing-policy-analysis/cbr/cbr-lookup).

Fee remission depends on eligibility, tuition/fees, and appointment timing; it
is not a universal salary percentage. A user-entered monthly planning amount can
be useful, but it should not imply automatic policy eligibility or fee lookup.
[Graduate Studies guidance](https://grad.ucdavis.edu/tuition-and-fee-remission).

## Source completeness and limits

The read-only `WalterDev` checks also found:

- Portfolio rows satisfy `budget - spent - committed = reported balance` within
  two cents in the inspected dataset. The seed stores those inputs unchanged.
- Portfolio, monthly costs, and personnel refresh separately; portfolio load
  dates also vary across rows. Seeding does not establish a shared source cutoff.
- The SQL seed selects its reporting month using server-local `GETDATE()`, while
  the application timestamps the snapshot in UTC and the calculator uses UTC.
  Those month anchors can disagree around month-end. Use a consistent reporting
  month when correcting the snapshot boundary.
- Salary/FTE/funding inputs use the agreed full-time-rate units. Cognos earn-code
  shares are multiplied into the distribution share by the seeder.
- The inspected benefits lookup contains DVCMP and UCANR sets, but no DVMED set.
  Some current funding rows in the other sets also lack a matching lookup.
  This is source-table evidence, not a count of affected seedable portfolios.
- All vacation assessment values in the inspected lookup are null. The seeder
  converts missing vacation to zero; missing CBR also becomes zero in calculation.
  A zero-cost forecast therefore does not establish that an assessment is zero.
- The existing single-project projection intentionally excludes vacation, while
  the PI calculator adds it when supplied. Agreement with that older page is
  not by itself an acceptance test for this feature.
- Committed amounts are already reserved in the starting balance. Source data
  does not identify which forecast expenses satisfy each commitment, so this
  review does not establish that every commitment and forecast are disjoint.

Recommend visible incomplete-assumption feedback when source rates are missing,
while retaining the agreed ability to save incomplete plans. Existing saved
vacation values cannot distinguish a missing lookup from genuine zero because
seeding already discarded that distinction. Reliable feedback requires preserving
it. Supplying missing rate data and handling commitment overlap need explicit
scope; silently inventing rates or treating every missing value as an
authoritative zero is inappropriate.

## Next implementation boundary

1. Review the implemented snapshot-month rule, corrected balance consumption,
   and display of booked actuals. Cover downward salary edits as well as increases.
2. Review the date examples and enforce valid bounds. Settle partial-month
   treatment before adding funding-schedule editing.
3. Add clear treatment of missing cost assumptions. Keep fee eligibility,
   hypothetical-hire rate dates, and more detailed expense/commitment ownership
   with their relevant later editors.

Review each correction before moving to Stage 2. This increment changes only
snapshot-month calculation and its explanation, examples, and tests. Save
contracts, authentication, schemas, source data, and future-month formulas are
unchanged. Source cutoff alignment and historical balance presentation remain
open alongside the other calculation findings.

## Verification

The initial source review passed its executable examples, 18 calculator and
workspace tests, TypeScript checking, and ESLint. Independent reviewers checked
the arithmetic and distinction between demonstrated defects and proposed rules.
The current correction adds regression coverage for the accepted rule and a
booked-cost preview for exercising it through the salary editor.

The 38 focused calculator, workspace, and UI tests passed. The new UI regression
failed before the correction, showing hidden actuals and an excessive forecast.
TypeScript, changed-file ESLint, the executable review, and the production build
passed. Independent code review found no blocking defects. React Doctor scored
97/100 with a component-size warning on the existing workspace component; this
increment adds only its short explanation. The build retains its existing CSS,
module-directive, and bundle-size warnings.
