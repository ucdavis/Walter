# ProjectionLab demo

Run `npm run demo` in `web/client`, then choose **Projections** in the menu or
project details. The planner opens at
`http://127.0.0.1:5175/projections/9000000001`. It is available only in Vite's
demo mode. The normal build returns a not-found page for that route.

The timeline, allocation editor, charts, and calculations were ported from the
local ProjectionLab prototype. Click a person's month to change funding splits
or apply them across a range. Funding balances, dates, rates, and people can be
edited inline; rows can also be added or deleted. Changes stay in component state.
Reset plan, leaving the page, or reloading restores the current demo dataset.

The plan uses the same seed and snapshot month as Walter's other demo screens.
It excludes both closed projects and begins at the snapshot, without charging
historical expenses again.

| Planner field | Demo data |
| --- | --- |
| Sponsored funding source | One row per active project, summing category balances |
| Internal funding source | One row per task, keeping its fund and task identifiers |
| Starting balance | Available balance after actual expenses and commitments |
| Indirect percentage | Project burden rate multiplied by 100 |
| Annual salary | Full-time monthly rate multiplied by 12 |
| Fringe percentage | Composite benefit rate multiplied by 100 |
| Monthly allocation | FTE multiplied by distribution percentage, assigned to its project and task |
| Allocation dates | Snapshot onward, intersected with job, funding, and project dates |
| Undated internal funds | Planning horizon through the snapshot month plus 13 months |

As in the prototype, months that overlap a date range count as full months.
Drawdown includes salary, fringe, and indirect costs. It excludes future
non-personnel expenses. A negative balance is shown as a deficit; it does not
prevent editing. Allocation totals above 100% and allocations outside funding
dates cannot be saved. Removing all funding splits clears the selected months.
