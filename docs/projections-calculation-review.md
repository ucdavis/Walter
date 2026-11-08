# Projection calculations

A projection combines a saved financial snapshot with assumptions about future
costs. Editing an assumption changes the forecast while preserving booked
spending. Reopening a saved plan does not advance its snapshot date.

## Fresh snapshot selection

Fresh snapshots begin with active projects where the person is the project-level
PI. Internal tasks marked `Inactive` are excluded. Other project types are
excluded when their latest award end date is before the UTC capture date.
Missing award end dates and awards ending on the capture date remain eligible.
Award expiry determines inclusion; project dates determine forecast eligibility.

Eligible tasks are combined into one projection project. Category balances,
monthly costs, and captured expense averages are summed across retained tasks.
Funding assigned to excluded tasks or projects remains outside the plan, with
its original share and dates; it is not redistributed to retained projects.
Opening or saving an existing plan preserves its captured inputs, including
older plans that still have separate task records.

## Salary and benefits

Salary is entered as a full-time rate. Before cost-of-living adjustments, each
project's salary cost for a full month is:

```text
full-time monthly salary × appointment FTE × project share of the appointment
```

For example, a $120,000 full-time annual salary is $10,000 per month. At 50% FTE,
the appointment costs $5,000 per month. If two projects each fund half the
appointment, each pays $2,500. The UI expresses each project's share as 25% of
full-time salary.

Benefits are calculated from each project's salary cost:

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

Changing salary preserves FTE, funding shares, and booked actuals. CBR defaults
to 0 when no rate is supplied. The vacation cost rate also defaults to 0, and
supplied values are preserved. The vacation field represents an additional
salary-based cost in this calculator; it does not track an employee's vacation
hours. UC Davis's title-code CBR mapping is a planning estimate rather than
confirmation of an individual employee's rate. See the
[CBR and vacation assessment guidance](https://financeandbusiness.ucdavis.edu/finance/costing-policy-analysis/cbr)
and [CBR lookup guidance](https://financeandbusiness.ucdavis.edu/finance/costing-policy-analysis/cbr/cbr-lookup).

## Personnel dates and partial months

Salary and benefits apply only on dates when the project, job, and funding entry
are all active. Start and end dates are inclusive. The calculator counts calendar
days, including weekends, within each month:

```text
monthly personnel estimate = full-month cost at the funding share
                             × eligible days / calendar days in the month
```

For a full-month project share of $2,500 salary and $1,000 benefits:

| Eligible dates               |  Salary | Benefits |
| ---------------------------- | ------: | -------: |
| February 20 through 28, 2026 | $803.57 |  $321.43 |
| March 1 through 5, 2026      | $403.23 |  $161.29 |

A job ending March 10 has no eligible days with funding starting March 31.
A project starting April 1 has no salary or benefits forecast before April.

For a $5,000 monthly appointment funded entirely by Project A through March 15
and Project B starting March 16, the salary allocations are $2,419.35 to A and
$2,580.65 to B. Calculations retain precision until amounts are displayed.

Funding percentages are used as entered. Missing funding is not redistributed,
and overlapping allocations are not scaled down. An allocation ending March 15
and another starting March 15 both include that day. Plans can be saved with
funding gaps or overlaps.

## Snapshot balance

The snapshot time records when Walter begins capturing the plan's inputs. One
UTC snapshot date anchors the history window, forecast months, and partial-month
calculations. Reopening a plan preserves that date.

Portfolio totals, monthly costs, and personnel data arrive through separate
imports. The plan uses the latest available inputs from each source. Their
refresh times can differ, so the snapshot does not guarantee that all inputs
are complete through one financial cutoff.

```text
snapshot balance = budget - spent to date - commitments
```

Budget, spent to date, and commitments are totals captured at the snapshot date.
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

Each project keeps its own balance. A surplus on one project does not cover a
shortfall on another. The project outlook and its monthly detail begin in the
saved snapshot month and continue through the forecast horizon. The snapshot
month shows booked actuals and additional forecast spending. Earlier months
are not shown as historical month-end balances.

Historical monthly spending remains in the saved plan. Its averages supply
generated recurring expense estimates for the selected history window.
Snapshot-month spending also remains available for the personnel calculation
below. Reopening a plan preserves these captured costs and its snapshot date.

## Snapshot-month personnel costs

For each project, salary and benefits are calculated separately. The calculator
first sums the eligible-day estimates for all relevant jobs across the entire
snapshot month, then subtracts the amount already booked in that category:

```text
additional personnel forecast = max(month's personnel estimate - booked actual, 0)
month-end balance = snapshot balance - total additional forecast spending
```

| Salary estimate for one project | Booked this month | Additional forecast |
| ------------------------------- | ----------------: | ------------------: |
| $2,500                          |            $1,000 |              $1,500 |
| $2,750                          |            $1,000 |              $1,750 |
| $900                            |            $1,000 |                  $0 |

Reducing an estimate below the booked amount does not refund booked costs.
Salary and benefits use separate comparisons because their postings can arrive
at different times. Eligible days before the snapshot date still contribute to
the estimate because their costs may not yet be booked. For a March 20 snapshot,
a job active March 1 through 10 with a $1,000 estimate and $800 booked costs
still forecasts $200. The calculator does not also prorate personnel to days
after the snapshot. Later months use their eligible-day estimates.

Credits are negative actuals and follow the same formula. A zero estimate with
a $100 booked credit produces $100 of additional forecast. This adjustment
also applies to credits booked after a project's end month, while that end date
continues to limit job and expense forecasts.

## Additional expenses and fee remission

The source history averages used for recurring estimates exclude categories
01 Salaries and Wages, 02 Fringe Benefits, and 04 Equipment. Category 08 Fellowship
& Scholarships remains included. Booked actuals remain available for balances
and snapshot-month personnel netting.

Explicit monthly and one-time expenses are additional planned costs, including
expenses assigned to salary, benefits, or fee categories. They are added after
the personnel calculation and are not reduced by booked personnel costs.

Recurring expenses, including generated estimates, are prorated for project-active
days within their applicable months. Project start and end dates are inclusive.
In the snapshot month, only days after the snapshot date count. The snapshot day
itself is excluded.

For a $310 monthly expense and an October 16 snapshot:

| Project dates                      | Eligible days         | Additional forecast |
| ---------------------------------- | --------------------- | ------------------: |
| Active throughout October          | October 17 through 31 |                $150 |
| Ends October 20                    | October 17 through 20 |                 $40 |
| Starts October 20, ends October 31 | October 20 through 31 |                $120 |

Later months use all applicable project-active days. A fully active month uses
the full monthly amount; a month with no eligible days has no recurring forecast.

One-time expenses use their full amount when the specified month overlaps the
project's dates and is the snapshot month or later. They are not prorated by day.
For an October 16 snapshot, a $1,000 October expense still adds $1,000 if the
project ended October 10. The expense specifies a month, not a posting date.
Entries outside the eligible months stay in the saved plan but do not contribute
to the forecast; changing the dates can make them applicable again.

A job's fee-remission amount is the appointment's total monthly cost. It is split
across funding shares without FTE or COLA scaling, then prorated by calendar days
when the project, job, and funding entry are all active. Start and end dates are
inclusive. No overlap means no fee forecast.

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
additional costs. Entering the same fees as both an explicit expense and a job's
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

## Cost-of-living adjustments

COLA compounds annually in the configured month. For jobs captured in the
snapshot, the entered salary is the full-time rate at the snapshot date. The
first increase is in a configured COLA month strictly after the snapshot month,
even if the job starts later. If the snapshot is in July, a July increase is not
applied again that year; the following July receives the next increase.

For a $2,500 monthly project salary and a 3% July COLA, the cost becomes $2,575
in the first applicable July, $2,652.25 in the second, and $2,731.8175 in the third.
Calculations retain precision; the UI formats amounts as currency.

For a hypothetical hire starting after the snapshot month, the entered salary
is the full-time rate at the job's start. Its first COLA occurs in the configured
month strictly after the start month. No increase applies in the start month.

With a January 2026 snapshot, an August 2026 hire at $120,000 annually and a 3%
July COLA has a full-time monthly rate of $10,000 in August 2026, $10,300 in
July 2027, and $10,609 in July 2028. A July 2026 hire also receives its first
increase in July 2027.

A hypothetical hire with no start date, or a start in or before the snapshot
month, uses the snapshot date as its salary base. Moving its start date changes
that base according to the same rule. Reopening the plan preserves the saved
snapshot and job dates.
