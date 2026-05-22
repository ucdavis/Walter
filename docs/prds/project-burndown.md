# Project Burndown PRD

## Problem Statement

Project users can see the current reported balance and the personnel currently funded on a project, but they cannot see whether the available balance is likely to last through the next several months. The project page forces users to manually combine the project balance, award end date, funding dates, job dates, FTE, distribution percentage, salary, and composite benefit rate to understand when a project may run out of funds.

Users need a forward-looking **Project Burndown** that starts from the latest reported project balance and projects the remaining balance over time using expected future costs. For the first version, that forecast should use **Projected Personnel Cost** only, while leaving the data model ready for later non-personnel forecast components.

## Solution

Add a **Project Burndown** section to the project detail page after the financial baseline and before the deeper task/personnel details. The section displays a monthly line chart beginning at the current reported project balance. Each following monthly point subtracts the projected personnel costs active during that month. The forecast runs through the earlier of the project end date or the default 12-month horizon. If the project has no end date, the default 12-month horizon is used.

The chart should make risk obvious: balances continue below zero rather than being clamped, a dashed zero reference line marks the deficit threshold, and the balance line/data points turn red after the projected balance falls below zero. Hovering a monthly data point shows the remaining balance, total projected spend for that month, and the personnel cost breakdown that caused that month's movement.

## User Stories

1. As a project viewer, I want to see a projected balance trend on a project page, so that I can understand whether the project is likely to run out of funds.
2. As a project viewer, I want the forecast to start from the current reported project balance, so that I can tie the projection back to the financial baseline I already trust.
3. As a project viewer, I want the first chart point to show the starting balance before future projected costs are subtracted, so that the forecast baseline is clear.
4. As a project viewer, I want each later monthly point to show the balance after that month's projected personnel costs, so that I can see the trend month by month.
5. As a project viewer, I want the chart to stop at the project end date when one exists, so that the forecast does not imply spending beyond the project's relevant period.
6. As a project viewer, I want projects without an end date to still show a useful default projection, so that missing end-date data does not block planning.
7. As a project viewer, I want the default projection to cover up to 12 monthly periods, so that I get enough forward-looking signal without an overly long chart.
8. As a project viewer, I want projected personnel costs to match the Monthly Total currently displayed in the personnel table, so that the chart agrees with the detailed personnel data.
9. As a project viewer, I want salary, FTE, distribution percent, and composite benefit costs to be reflected in projected personnel cost, so that personnel costs are not understated.
10. As a project viewer, I want personnel costs to apply only in months where the funding and job windows overlap the month, so that ended or not-yet-started assignments do not distort the forecast.
11. As a project viewer, I want partial-month funding to count as a full projected monthly cost, so that the monthly chart remains easy to interpret.
12. As a project viewer, I want future-dated funding rows to start costing in the first projected month they overlap, so that upcoming planned personnel costs are included at the right time.
13. As a project viewer, I want ended funding rows to stop costing after their final overlapping month, so that costs do not continue indefinitely.
14. As a project viewer, I want open funded positions to count in the forecast, so that planned staffing costs are not hidden just because an employee is not currently assigned.
15. As a project viewer, I want open positions labeled clearly in the tooltip, so that I can distinguish assigned employees from funded vacancies.
16. As a project viewer, I want balances to continue below zero when projected costs exceed available balance, so that I can see the size of the projected deficit.
17. As a project viewer, I want a zero reference line, so that I can quickly see when the project crosses into deficit.
18. As a project viewer, I want the chart to turn red after projected balance goes below zero, so that the risk is visually obvious.
19. As a project viewer, I want hover details for each monthly point, so that I can understand what caused that month's balance change.
20. As a project viewer, I want the hover details to include remaining balance and total projected spend, so that I can understand both position and movement.
21. As a project viewer, I want the hover details to include a personnel breakdown by employee or open position, so that I can identify the cost drivers.
22. As a project viewer, I want the hover breakdown to include salary, composite benefit cost, and total for each contributor, so that the monthly total is explainable.
23. As a project viewer, I want people or positions that do not contribute cost in a month excluded from that month's tooltip, so that the tooltip explains only that month's movement.
24. As a project viewer, I want the chart to wait for personnel data before rendering, so that I am not shown a misleading personnel-only forecast.
25. As a project viewer, I want a local loading state while personnel data is loading, so that I know the forecast is being prepared.
26. As a project viewer, I want a local error state if personnel data fails to load, so that I know why the forecast is unavailable.
27. As a project viewer, I want the burndown located near the current financial details, so that the baseline and forecast are read together.
28. As a future maintainer, I want the projection rules isolated from chart rendering, so that date and cost behavior can be tested without brittle UI tests.
29. As a future maintainer, I want the projection data shape to support future non-personnel components, so that average historical costs can be added later without replacing the chart contract.

## Implementation Decisions

- Build a deep projection module that accepts a starting balance, a projection start month, an optional project end date, a default maximum month count, and personnel records. It returns monthly projection points with remaining balance, total monthly spend, and cost components.
- The projection module should not depend on chart rendering. Its interface should be stable enough for future non-personnel forecast components to be added alongside personnel components.
- Use the current project summary balance as the starting balance.
- Use the project award end date as the project end cap when present.
- Use a default maximum horizon of 12 monthly periods when no earlier project end date applies.
- If no project end date is present, use the default 12-month horizon.
- If the project end date is before the projection start, render only the starting point or an explanatory empty state rather than inventing future months.
- Use the same projected personnel cost behavior as the existing personnel table Monthly Total: distributed monthly salary plus composite benefit cost.
- Treat missing nullable numeric personnel fields the same way the current displayed Monthly Total behavior does; do not add extra explanatory messaging for missing composite benefit rates.
- A personnel funding distribution contributes to a projected month when both the funding window and the job window overlap any part of that month.
- Null funding end dates and null job end dates are treated as open-ended.
- Future-dated funding contributes only starting with the first projected month that overlaps the funding effective date.
- Partial-month overlap counts as a full projected monthly cost for that month.
- Include active funded open positions even when no employee is assigned.
- Use all rows returned by the project personnel query for the burndown cost basis, even if the personnel table hides open positions by default.
- Add a project-page section for **Project Burndown** after the financial details and before the additional/task/personnel sections.
- Reuse the existing personnel query already performed on the project detail page rather than issuing a duplicate request for the same project data.
- Show a local loading state while personnel data is pending.
- Show a local error state if personnel data fails to load.
- Use Recharts for the v1 chart, consistent with existing chart components.
- The chart should include a dashed zero reference line.
- The chart should allow negative projected balances and visually distinguish the below-zero portion in red.
- The chart tooltip should show the month, remaining balance, total projected spend, and a personnel breakdown for contributors in that month.
- The tooltip should label unassigned funded positions as open positions with their position description.
- V1 is chart-first. Do not add a separate monthly breakdown table or tabs yet.
- No server API or database changes are required for v1 if the existing project and personnel data remain sufficient.

## Testing Decisions

- Tests should focus on externally observable behavior: generated monthly projection points, included/excluded personnel contributors, rendered chart states, and tooltip contents.
- The projection module should have focused unit tests because it encodes the most important domain rules and can be tested without React or chart rendering.
- Projection tests should cover the starting balance point, default 12-month horizon, project-end-date cap, no-end-date behavior, negative balances, future funding starts, funding ends, job ends, null end dates, partial-month full-cost behavior, and open funded positions.
- Projection tests should cover the same monthly total cost basis used by the personnel table: distributed salary plus composite benefit cost.
- Component tests should verify that the project detail page shows the burndown section in the intended location once personnel data is available.
- Component tests should verify loading and error states for the burndown section.
- Component tests should verify that the chart exposes the key labels or accessible content needed to confirm the forecast is present without over-testing Recharts internals.
- Tooltip tests should verify the presence of remaining balance, total projected spend, and personnel/open-position breakdown for a representative month.
- Existing personnel table tests provide prior art for monthly salary, composite benefit, distribution percentage, and open-position behavior.
- Existing project chart and project funding chart tests provide prior art for chart component rendering and Recharts-based components.

## Out of Scope

- Non-personnel forecast costs based on historical average spend.
- User-selectable horizon controls.
- Fiscal-period-specific horizon rules beyond the default 12-month cap and project end date cap.
- A monthly breakdown table or tabbed view.
- New backend endpoints, stored procedures, or schema changes.
- Historical spend reporting as a primary purpose of the chart.
- Daily proration for partial-month funding.
- Exporting burndown data.
- Alerts, notifications, or automated warnings based on the projected deficit.

## Further Notes

- The domain glossary now defines **Project Burndown** as a forward-looking projection and **Projected Personnel Cost** as expected monthly project cost for a personnel funding distribution, including distributed salary and composite benefit rate costs.
- The first implementation should keep future non-personnel forecast components in mind by using a monthly cost-component model, but only personnel costs should be populated in v1.
- The visual direction from the spike is accepted: a zero reference line, negative balances below zero, and red styling after the projected balance crosses below zero.
