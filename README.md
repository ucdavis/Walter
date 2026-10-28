# Walter

Warehouse Analytics and Ledger Tools for Enterprise Reporting

## Overview

Walter includes:

- `datamart/`: The data mart schema, scripts, and CI/CD pipelines.
- `web/`: The web application for data visualization and reporting.

Instructions for setting up and using each component are provided in their respective directories.

## Vacation accrual reporting

The department detail report includes two fields based on vacation usage history:

- **Last Vacation** is the latest reporting date with positive vacation usage across all available history through the employee's snapshot. It is not the actual day leave was taken. A later zero-usage report in the same month does not hide earlier usage.
- **Projected**, exported as **Months to Cap**, estimates time to the balance cap using the monthly accrual estimate minus average monthly usage. Usage includes signed corrections and totals all distinct reporting dates in each month, counting repeated position rows once per date. The average uses the six most recent observed months, including the current reporting month when available. Shorter histories use fewer months; missing months are not filled with zeros.

The monthly accrual estimate uses the latest positive period award, with the existing cap-tier fallback. See the [accrual calculator](web/server.core/Services/AccrualOverviewCalculator.cs) for duplicate handling, fallback, and rounding rules. Notification projection and vacation-date fields use the same calculator.

## Getting Started (Web)

Open the `/web` directory in VSCode and choose "Reopen in Container" to set up the development environment.

From there, read the instructions in `/web/README.md`.

## Getting Started (Data Mart)

TBD
