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
| Funding source | One row per active project, summing all task and category balances |
| Starting balance | Available balance after actual expenses and commitments |
| Indirect percentage | Project burden rate multiplied by 100 |
| Annual salary | Full-time monthly rate multiplied by 12 |
| Fringe percentage | Composite benefit rate multiplied by 100 |
| Monthly allocation | FTE multiplied by distribution percentage, assigned to its project |
| Allocation dates | Snapshot onward, intersected with job, funding, and project dates |
| Undated internal funds | Planning horizon through the snapshot month plus 13 months |

As in the prototype, months that overlap a date range count as full months.
Drawdown includes salary, fringe, and indirect costs. It excludes future
non-personnel expenses. A negative balance is shown as a deficit; it does not
prevent editing. Allocation totals above 100% and allocations outside funding
dates cannot be saved. Removing all funding splits clears the selected months.

## Projection copilot

The copilot sits beside the timeline. **What stands out** shows calculated
shortfalls and available balances immediately, and updates as the plan changes.
**Explain the gap**, **Explore a hire**, and the question box send the current
demo plan to OpenAI. Answers can include a temporary proposal. **Explore
scenario** opens an expanded comparison of that same proposal; edits there also
update the compact preview. **Apply to plan** updates the timeline. **Undo change**
restores the previous plan unless you have made another manual edit afterward.
Resetting the plan clears the conversation and proposals.

The demo defaults to `gpt-5.6-luna` with low reasoning effort. Its Vite server
reads `OPENAI_API_KEY` from the process environment or `web/client/.env.demo.local`.
It also supports the existing `OpenAI__ApiKey` in `web/server/.env` as a fallback.
Override the model with `PROJECTION_AI_MODEL` in the client demo environment file.
Restart `npm run demo` after changing these settings. Keep these variables
unprefixed: a `VITE_` prefix would expose them to the browser.

```dotenv
OPENAI_API_KEY=your-local-key
PROJECTION_AI_MODEL=gpt-5.6-luna
```

The local-only `/__demo/projections/chat` handler keeps credentials on the server.
It uses the OpenAI Responses API with a `preview_scenario` function, which
validates proposed edits and runs the same projection engine as the browser.
Calculated effects return to the model before it explains the proposal. The
model cannot apply a plan. Changed plans invalidate outstanding proposals, and
responses arriving after a manual edit are rejected as stale. API failures show
an error with Retry; there is no simulated AI fallback. Requests use `store: false`;
the current demo plan and recent conversation are still sent to OpenAI for each
question. This handler is absent from normal development and production builds.

Supported changes are new hires, allocation splits over a month range, full-time
salary/fringe changes, and funding balance/rate/date changes. Salary changes apply
to all of a person's allocations. Funding balance changes apply at the start of
the fund; they do not model a later deposit. Purchases and future non-personnel
expenses remain outside the projection model. Grant eligibility is an explicit
assumption, not inferred from an available balance.

For a quick demo:

1. Choose **Explain the gap** for Morgan Reed support.
2. Ask: “Preview a grad student named Casey at 50%, January through June 2027,
   on Pollinator funding, with $98,400 full-time annual salary and 2% fringe.
   Assume eligible grant work.”
3. Ask: “What about only three months, starting in January?”
4. Open **Explore scenario**, adjust assumptions, then **Apply to plan** and
   **Undo change**.

Dates in the example assume the September 2026 demo snapshot. Use dates within
the current funding window if the snapshot has changed.
