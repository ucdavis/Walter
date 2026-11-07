# Projection calculations

A projection combines a saved financial snapshot with assumptions about future
costs. Editing an assumption changes the forecast while preserving booked
spending. Reopening a saved plan does not advance its snapshot date.

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

```text
snapshot balance = budget - spent to date - commitments
```

Budget, spent to date, and commitments are totals captured at the snapshot date.
Monthly actuals are the booked cost totals for each category and month. They
describe spending during that month, rather than the money remaining at its end.

Spent to date includes costs already booked in the snapshot month. Those costs
remain visible as actuals and are not deducted from the snapshot balance again.
Only additional forecast spending reduces that balance. This calculation assumes
the booked actuals are included in the captured balance.

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
across funding shares without FTE or COLA scaling. The current calculation does
not prorate it by day and treats it as an additional forecast cost; the personnel
remainder formula does not apply to it. Entering the same fees as both an explicit
expense and a job's fee-remission amount would count them twice.

Fee remission uses month-based job and funding windows and the project's end
month. Its current calculation does not enforce the project's start date or
require exact day overlap within a month.

The forecast does not determine fee-remission eligibility or look up tuition
and fees. See [Graduate Studies' tuition and fee remission guidance](https://grad.ucdavis.edu/tuition-and-fee-remission)
for those rules.

### Open fee-remission question

Category 08 Fellowship & Scholarships includes costs beyond employee fee
remission. Its historical recurring estimate and entered employee fee amounts
currently both contribute to the forecast. How should the forecast distinguish
other category 08 costs from fee remission and avoid counting the same fees
twice? This remains unresolved; category 08 continues to use its historical
estimate alongside any employee fee amounts.

## Cost-of-living adjustments

COLA compounds annually in the configured month after the snapshot month.
For a $2,500 monthly project salary and a 3% July COLA, the cost becomes $2,575
in the first July, $2,652.25 in the second, and $2,731.8175 in the third.
Calculations retain precision; the UI formats amounts as currency.

The salary input is treated as the rate at the snapshot date. If the snapshot
is in July, a July increase is not applied again that year. The following July
receives the next increase. These assumptions stay tied to the saved snapshot
when the plan is reopened.
