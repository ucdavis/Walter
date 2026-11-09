# Projection calculations

A projection combines captured financial inputs with assumptions about future
costs. Each imported funding source has its own capture date. Editing an
assumption changes the forecast while preserving booked spending. Reopening a
saved plan does not advance its capture dates.

A funding source is one project/task pair or an entered planned source. Tasks
keep separate balances and allocations even when every task of a project is
selected. A project rollup does not allow one task's surplus to cover another
task's shortfall. A source's editable name does not change its captured
project or task identity.

## Fresh snapshot selection

Fresh snapshots begin with active projects where the person is the project-level
PI. Internal tasks marked `Inactive` are excluded. Other project types are
excluded when their latest award end date is before the UTC capture date.
Missing award end dates and awards ending on the capture date remain eligible.
Award expiry determines inclusion. Source dates determine forecast eligibility;
imported tasks initially inherit their project's dates, which the plan can edit.

Eligible tasks remain independent sources, with their own category balances,
monthly costs, and captured expense averages. Initial staffing includes people
paid on the selected projects, including people paid only on an unchecked task
of one of those projects. Deliberately unchecked tasks leave their shares
unallocated. Blank or unmatched personnel task identifiers also leave funding
unallocated rather than assigning it to another task. Existing outside funding,
including funding excluded by source eligibility, remains separate.

Removing a source removes its expenses and allocations while retaining employee
assumptions. It does not redistribute those allocations or fill the gap with
outside funding. Adding the source again captures fresh financial inputs and
expense estimates without restoring old edits or importing staffing. Opening or
saving an existing plan preserves its captured inputs without refreshing them.

## Salary and benefits

Salary is required as an explicit full-time rate before saving; zero is valid.
Fresh imported drafts can contain missing salaries until reviewed. Before annual
salary adjustments, each
funding source's salary cost for a full month is:

```text
full-time monthly salary × appointment FTE × source share of the appointment
```

For example, a $120,000 full-time annual salary is $10,000 per month. At 50% FTE,
the appointment costs $5,000 per month. If two projects each fund half the
appointment, each pays $2,500. Funding rows show both the 50% appointment share
and its equivalent of 25% full-time FTE.

Benefits are calculated from each funding source's salary cost:

```text
benefits = salary cost × (composite benefit rate + vacation cost rate)
```

The example below uses illustrative rates of 30% for composite benefits and 10%
for vacation. These are not current UC Davis rates.

| Per project, full forecast month | Annual salary $120,000 | Annual salary $132,000 |
| -------------------------------- | ---------------------: | ---------------------: |
| Salary                           |                 $2,500 |                 $2,750 |
| Benefits plus vacation           |                 $1,000 |                 $1,100 |
| Total                            |                 $3,500 |                 $3,850 |

Changing salary preserves FTE, funding shares, and booked actuals. Changing FTE
preserves each allocation's share of the appointment. For example, increasing
an equally split 50% appointment to 75% increases each source's full-time share
from 25% to 37.5%. FTE may be zero through 100%; one value applies throughout
the appointment's eligible forecast.

CBR defaults to 20% for hypothetical hires and missing imported rates. This is
an editable planning assumption for the expected postdoc-heavy roster. Supplied
rates, including zero, are preserved. Use lookup rate explicitly applies a
job-code/rate-set estimate; changing a selection alone does not replace an
entered rate. Existing saved plans retain their assumptions when defaults or
lookup values change. The vacation cost rate defaults to 0, and supplied
vacation values are preserved. The vacation field represents an additional
salary-based cost in this calculator; it does not track an employee's vacation
hours. UC Davis's title-code CBR mapping is a planning estimate rather than
confirmation of an individual employee's rate. See the
[CBR and vacation assessment guidance](https://financeandbusiness.ucdavis.edu/finance/costing-policy-analysis/cbr)
and [CBR lookup guidance](https://financeandbusiness.ucdavis.edu/finance/costing-policy-analysis/cbr/cbr-lookup).

## Personnel dates and partial months

Salary and benefits apply only on dates when the funding source, appointment, and
funding entry are all active. Start and end dates are inclusive. The calculator counts calendar
days, including weekends, within each month:

```text
monthly personnel estimate = full-month cost at the funding share
                             × eligible days / calendar days in the month
```

For a full-month funding share of $2,500 salary and $1,000 benefits:

| Eligible dates               |  Salary | Benefits |
| ---------------------------- | ------: | -------: |
| February 20 through 28, 2026 | $803.57 |  $321.43 |
| March 1 through 5, 2026      | $403.23 |  $161.29 |

An appointment ending March 10 has no eligible days with funding starting March 31.
A source starting April 1 has no salary or benefits forecast before April.

For a $5,000 monthly appointment funded entirely by Project A through March 15
and Project B starting March 16, the salary allocations are $2,419.35 to A and
$2,580.65 to B. Calculations retain precision until amounts are displayed.

Changing appointment dates preserves explicit funding dates. Removing an
appointment removes its allocations and forecast costs; captured booked costs
remain. A hypothetical hire requires a start date and may have an open end.

Funding percentages are used as entered. Missing funding is not redistributed,
and overlapping allocations are not scaled down. An allocation ending March 15
and another starting March 15 both include that day. Plans can be saved with
funding gaps or overlaps.

## Snapshot balance

An imported source's snapshot time records when Walter begins capturing its
inputs. Its UTC date anchors its history window, forecast months, and
partial-month calculations. Sources captured together share that timestamp;
adding a source later does not change existing sources' timestamps. Every
source records its own timestamp explicitly.

In the financial rules below, snapshot month means the individual source's
capture month. Employee salary and COLA bases remain tied to the original plan
snapshot or the planned hire's starting rate, as described below.

Portfolio totals, monthly costs, and personnel data arrive through separate
imports. The plan uses the latest available inputs from each source. Their
refresh times can differ, so the snapshot does not guarantee that all inputs
are complete through one financial cutoff.

```text
snapshot balance = budget - spent to date - commitments
planning balance = snapshot balance + scenario adjustment
```

Budget, spent to date, and commitments are totals captured at the snapshot date.
Changing a planning balance preserves these captured figures and records the
difference separately. The adjustment changes the starting balance once; it is
not an expense or recurring income.

An entered planned source has no captured spending. Its full entered amount
becomes available on its start date, with no earlier available balance or
forecast spending. The amount is not reduced by a probability of receiving it.
It retains the original plan's time anchor, even if entered later. Its forecast
begins in the later of the original plan snapshot month or its start month.

Monthly actuals are the booked cost totals for each category and month. They
describe spending during that month, rather than the money remaining at its end.

The calculation treats booked snapshot-month costs as already included in spent
to date. Those costs remain visible as actuals and are not deducted from the
snapshot balance again. Only additional forecast spending reduces that balance.
This assumes the captured monthly actuals and portfolio totals align. Different
import timings can break that assumption and affect the resulting forecast.

Commitments remain reserved throughout the forecast. Planned costs, including
generated recurring estimates, reduce the balance without being offset against
those commitments. The captured commitment totals are grouped by category and
do not identify which forecast expenses fulfill them, so the same obligation
can be counted twice.

For example, a $100,000 budget with $40,000 spent and $10,000 committed starts
at $50,000. If the forecast also includes the same $10,000 purchase, it shows
$40,000 remaining. This overlap can understate the available balance. The
calculator does not automatically reconcile commitments with forecast costs.

Each source keeps its own balance. A surplus on one task does not cover a
shortfall on another. Its outlook and monthly detail begin in its capture month,
or the availability month for later planned funding, and continue through its
forecast horizon. The snapshot month shows booked actuals and additional
forecast spending. The calculator does not reconstruct balances for earlier
months from the captured balance and past spending.

Historical monthly spending remains in the saved plan. Its averages supply
generated recurring expense estimates for the selected history window.
Snapshot-month spending also remains available for the personnel calculation
below. Reopening a plan preserves these captured costs and dates.

For example, an October plan can add a task in November with $50,000 available,
including $2,000 of booked November salary. If November's salary estimate is
$5,000, the added source forecasts the $3,000 unbooked remainder and ends at
$47,000. It does not apply November's balance back in October or deduct the
booked $2,000 again. Existing October sources and employee salary assumptions
remain unchanged.

## Snapshot-month personnel costs

For each funding source, salary and benefits are calculated separately. The
calculator first sums the eligible-day estimates for all relevant appointments across the entire
source snapshot month, then subtracts the amount already booked for that source
and category. Costs booked to one task do not offset another task's estimate:

```text
additional personnel forecast = max(month's personnel estimate - booked actual, 0)
month-end balance = planning balance - total additional forecast spending
```

| Salary estimate for one source | Booked this month | Additional forecast |
| ------------------------------ | ----------------: | ------------------: |
| $2,500                         |            $1,000 |              $1,500 |
| $2,750                         |            $1,000 |              $1,750 |
| $900                           |            $1,000 |                  $0 |

Reducing an estimate below the booked amount does not refund booked costs.
Salary and benefits use separate comparisons because their postings can arrive
at different times. Eligible days before the snapshot date still contribute to
the estimate because their costs may not yet be booked. For a March 20 snapshot,
a appointment active March 1 through 10 with a $1,000 estimate and $800 booked costs
still forecasts $200. The calculator does not also prorate personnel to days
after the snapshot. Later months use their eligible-day estimates.

Credits are negative actuals and follow the same formula. A zero estimate with
a $100 booked credit produces $100 of additional forecast. This adjustment
also applies to credits booked after a source's end month, while that end date
continues to limit appointment and expense forecasts.

## Additional expenses and fee remission

The source history averages used for recurring estimates exclude categories
01 Salaries and Wages, 02 Fringe Benefits, and 04 Equipment. Category 08 Fellowship
& Scholarships remains included. Booked actuals remain available for balances
and snapshot-month personnel netting.

Explicit monthly and one-time expenses are additional planned costs, including
expenses assigned to salary, benefits, or fee categories. They are added after
the personnel calculation and are not reduced by booked personnel costs.

Recurring expenses, including generated estimates, are prorated for days when
the funding source is active within their applicable months. Source start and
end dates are inclusive.
In the snapshot month, only days after the snapshot date count. The snapshot day
itself is excluded.

For a $310 monthly expense and an October 16 snapshot:

| Source dates                       | Eligible days         | Additional forecast |
| ---------------------------------- | --------------------- | ------------------: |
| Active throughout October          | October 17 through 31 |                $150 |
| Ends October 20                    | October 17 through 20 |                 $40 |
| Starts October 20, ends October 31 | October 20 through 31 |                $120 |

Later months use all days when the source is active. A fully active month uses
the full monthly amount; a month with no eligible days has no recurring forecast.

One-time expenses use their full amount when the specified month overlaps the
source's dates and is the snapshot month or later. They are not prorated by day.
For an October 16 snapshot, a $1,000 October expense still adds $1,000 if the
source ended October 10. The expense specifies a month, not a posting date.
Entries outside the eligible months stay in the saved plan but do not contribute
to the forecast; changing the dates can make them applicable again.

A appointment's fee-remission amount is the appointment's total monthly cost. It is split
across funding shares without FTE or COLA scaling, then prorated by calendar days
when the funding source, appointment, and funding entry are all active. Start and end
dates are inclusive. No overlap means no fee forecast.

```text
monthly fee forecast = appointment's monthly fee × funding share
                       × eligible days / calendar days in the month
```

For a $1,500 monthly appointment fee and a 50% funding share:

| Eligible dates    | Eligible days | Fee forecast |
| ----------------- | ------------: | -----------: |
| June 1 through 15 |      15 of 30 |         $375 |
| June 1 through 30 |      30 of 30 |         $750 |

The snapshot month uses all eligible days, including those before the snapshot
date. For a June 20 snapshot, the June 1 through 15 example still adds $375.
The fee forecast is additional spending and is not reduced by booked
category 08 costs, because that category also contains other fellowship and
scholarship costs. A $750 full-month fee forecast remains $750 even with $400
already booked in category 08. The $400 remains visible as actuals and is already
included in the snapshot balance under the inclusion assumption described above.

Generated category 08 estimates and explicit monthly/one-time expenses remain
additional costs. Entering the same fees as both an explicit expense and a appointment's
fee-remission amount would count them twice. No standard fee amount is supplied
automatically.

The forecast does not determine whether an employee qualifies for fee remission
or look up tuition and fees. See [Graduate Studies' tuition and fee remission guidance](https://grad.ucdavis.edu/tuition-and-fee-remission)
for those rules.

### Open fee-remission question

Category 08 Fellowship & Scholarships includes costs beyond employee fee
remission. Its historical recurring estimate and entered employee fee amounts
currently both contribute to the forecast. How should the forecast distinguish
other category 08 costs from fee remission and avoid counting the same fees
twice? This remains unresolved; category 08 continues to use its historical
estimate alongside any employee fee amounts.

## Annual salary adjustments

Fresh appointments default to a 3% annual adjustment in July. The rate and month
are editable per appointment. Negative adjustments above -100% model recurring
salary reductions; zero leaves salary unchanged. Saved plans retain their rate
and month when defaults change.

The adjustment, also called COLA, compounds annually in the configured month.
For appointments captured in the original plan snapshot, the entered salary is
the full-time rate at that date. The first adjustment occurs in the configured
month strictly after the original plan snapshot month, even if the appointment
starts later. If that snapshot is in July, a July adjustment is not applied
again that year; the following July receives the next adjustment.

For a $2,500 monthly project salary and a 3% July COLA, the cost becomes $2,575
in the first applicable July, $2,652.25 in the second, and $2,731.8175 in the third.
Calculations retain precision; the UI formats amounts as currency.

For a hypothetical hire starting after the original plan snapshot month, the
entered salary is the full-time rate at the appointment's start. Its first COLA occurs
in the configured month strictly after the start month. No increase applies in
the start month.

With a January 2026 plan snapshot, an August 2026 hire at $120,000 annually and a 3%
July COLA has a full-time monthly rate of $10,000 in August 2026, $10,300 in
July 2027, and $10,609 in July 2028. A July 2026 hire also receives its first
increase in July 2027.

A hypothetical hire starting in or before the original plan snapshot month
uses that snapshot date as its salary base. Moving its start
date changes that base according to the same rule. Reopening the plan preserves
the saved snapshot and appointment dates. Adding a funding source with a later capture date does
not change salary bases.
