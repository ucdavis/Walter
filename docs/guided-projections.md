# Guided projections demo

Run `npm run demo` from `web/client`. The navigation contains two projection tabs:

- **Guided projections** at `/guided-projections/9000000001`: the selected guided
  setup and live workspace, formerly concept D.
- **Projections** at `/projections/9000000001`: the original timeline and copilot,
  retained for comparison.

Both routes are available only in local demo mode. The earlier
`/projection-designs/9000000001` links redirect to guided projections. The three
unused concepts and design gallery have been removed.

Guided projections starts with the current Walter demo snapshot. Plans stay in
browser storage and do not update Walter project records or the original
projection demo. The storage key from the selected prototype is retained, so
saved plans carry forward. Copilot is absent from the guided version.

Create a plan, review the prefilled funding and people, add recurring or one-time
expenses, then open the workspace. Changes to saved plans update the results
and save automatically in this browser.

Staffing supports multiple project shares per person, each with its own
percentage and dates. Percentages refer to full-time salary, so a 50% appointment
can be split into two 25% shares. Overlapping shares above 100% show a validation
message and block setup completion. Older saved plans migrate to this model.

The live chart shows a separate balance for every project. Select a project
balance, chart line, or the shortfall summary to explore its first shortfall
month, ending balance, funded people, cost categories, and monthly balances.
While editing, the chart selector keeps the editor open. Combined balances
remain available as a secondary total.

Staffing uses the original projection engine, including each project's indirect
rate. Other expenses use simplified direct-cost estimates and do not yet
implement the full indirect-cost treatment for non-personnel expenses.

The implementation is under `web/client/src/components/guidedProjections/`.
This remains a demo plan model, not a production persistence design.
