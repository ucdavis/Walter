# Walter

Warehouse Analytics and Ledger Tools for Enterprise Reporting

## Overview

Walter includes:

- `datamart/`: The data mart schema, scripts, and CI/CD pipelines.
- `web/`: The web application for data visualization and reporting.

Instructions for setting up and using each component are provided in their respective directories.

## Managing user roles

Open **User Management** from the Admin Dashboard. Search with at least three characters from a name, email, campus username, or IAM ID. Results are limited to 25 people; refine the query if needed. Select a person to view their roles, choose a role and select **Add Role**, or use the remove button beside an existing role.

See the [admin eligibility, account linking, and refresh rules](CONTEXT.md#relationships) if a person is missing or a grant cannot resolve their account.

## Vacation accrual reporting

The department detail report includes two fields based on vacation usage history:

- **Last Vacation** is the latest reporting date with positive vacation usage across all available history through the employee's snapshot. It is not the actual day leave was taken. A later zero-usage report in the same month does not hide earlier usage.
- **Projected**, exported as **Months to Cap**, estimates time to the balance cap using the monthly accrual estimate minus average monthly usage. Usage includes signed corrections and totals all distinct reporting dates in each month, counting repeated position rows once per date. The average uses the six most recent observed months, including the current reporting month when available. Shorter histories use fewer months; missing months are not filled with zeros.

The monthly accrual estimate uses the latest positive period award, with the existing cap-tier fallback. See the [accrual calculator](web/server.core/Services/AccrualOverviewCalculator.cs) for duplicate handling, fallback, and rounding rules. Notification projection and vacation-date fields use the same calculator.

## Projection plans

From a person's Projects overview, open Projections and choose New plan. Work
through Funding sources, Staffing, Other expenses, and Review, then choose
Create plan to save the reviewed scenario and open its workspace. Canceling
before submission leaves no saved plan. Workspace edits require Save plan;
Apply accepts an editor's changes into the draft.

If **Save plan** reports a conflict, choose **Discard and reload** to replace
your draft with the latest saved plan. Choose **Close** to keep your draft for
reference.

Open a saved plan from Your plans. Duplicate copies its saved version after
pending changes are saved. Plan details contains the permanent Delete action,
which requires confirmation. Scenario edits do not change upstream accounting.

Open **Plan changes** beside **Plan details** for a read-only comparison with the
captured inputs. The report shows the capture date and counts affected
appointments and funding sources. It uses applied draft edits and shows **Plan
has unsaved edits** when the draft differs from the saved plan. Restoring a
captured value clears its change from the report.

**Staffing** shows changes to appointment assumptions, including full-time base
salary, FTE, dates, benefits, and fees. It also lists proposed appointments and
appointments excluded from this plan. Expand **Funding allocation** to see
changed shares by date range, including outside-plan funding. Adjacent periods
with the same changes appear together. When personnel data marks an appointment
as Unsplit, the report labels its original funding shares unavailable.

**Funding** lists proposed sources and imported tasks with date or budget edits.
A task added to or removed from scope can still count as affected when its
staffing allocations change. For an edited task, the report shows captured and
planned funding dates and displays the task's capture date if it differs from
the plan's capture date. It shows original and revised available balances and
signed adjustments for changed categories and the source total. A redistribution
shows a zero net adjustment for the source. A newly budgeted category can appear
with a revised balance of $0.

See the [calculation reference](docs/projections-calculation-review.md) for
funding, salary, expense, and budget rules.

## Getting Started (Web)

Open the `/web` directory in VSCode and choose "Reopen in Container" to set up the development environment.

From there, read the instructions in `/web/README.md`.

## Getting Started (Data Mart)

TBD
