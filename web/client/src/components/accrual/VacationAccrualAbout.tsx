import {
  ArrowLongLeftIcon,
  CalculatorIcon,
  ChartBarIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import { type AccrualAssumptionsResponse } from '@/queries/accrual.ts';

type AssumptionRow = {
  label: string;
  value: string;
};

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const compactPercentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

function AssumptionsTable({
  rows,
  title,
}: {
  rows: AssumptionRow[];
  title: string;
}) {
  return (
    <section className="card bg-base-100 border border-main-border shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title">{title}</h2>
        <div className="overflow-x-auto">
          <table className="table table-zebra">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th className="font-semibold">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function VacationAccrualAbout({
  data,
  departmentCode,
}: {
  data: AccrualAssumptionsResponse;
  departmentCode?: string;
}) {
  const thresholdRows: AssumptionRow[] = [
    {
      label: 'At Cap',
      value: `${percentFormatter.format(data.atCapThresholdPct)}% and above`,
    },
    {
      label: 'Approaching Cap',
      value: `${percentFormatter.format(data.approachingThresholdPct)}% to ${percentFormatter.format(data.atCapThresholdPct - 0.1)}%`,
    },
    {
      label: 'Active',
      value: `Below ${percentFormatter.format(data.approachingThresholdPct)}%`,
    },
  ];

  const benefitsRows: AssumptionRow[] = data.benefitsRates.map((row) => ({
    label: row.label,
    value: `${compactPercentFormatter.format(row.rate * 100)}% composite benefits load`,
  }));

  return (
    <main className="mt-8">
      <div className="container">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="badge badge-outline badge-primary">
                Vacation Accruals
              </div>
              <div className="space-y-2">
                <h1 className="h1">About This Report</h1>
                <p className="max-w-3xl text-lg text-base-content/70">
                  This page summarizes the current assumptions behind the
                  vacation accrual overview, with a focus on how estimated lost
                  cost is calculated for employees who are near or at their
                  accrual cap.
                </p>
              </div>
            </div>

            {departmentCode ? (
              <Link
                className="btn btn-outline"
                params={{ departmentCode }}
                to="/accruals/department/$departmentCode"
              >
                <ArrowLongLeftIcon className="h-4 w-4" />
                Back to Department
              </Link>
            ) : (
              <Link className="btn btn-outline" to="/accruals/overview">
                <ArrowLongLeftIcon className="h-4 w-4" />
                Back to Overview
              </Link>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <section className="card bg-base-100 border border-main-border shadow-sm lg:col-span-2">
              <div className="card-body gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] uppercase text-base-content/70">
                  <CalculatorIcon className="h-5 w-5 text-primary" />
                  <span>Lost Cost Formula</span>
                </div>
                <p className="text-base-content/75">
                  Lost cost per employee is estimated only when the employee is
                  classified as at cap.
                </p>
                <div className="rounded-box bg-base-200/60 px-5 py-4 font-mono text-sm md:text-base">
                  monthly accrual hours × hourly rate × (1 + benefits load)
                </div>
                <p className="text-sm text-base-content/70">
                  The report treats this as an estimated unrecoverable accrual
                  cost for the latest month-end snapshot. It is a planning
                  estimate, not a payroll posting.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 border border-main-border shadow-sm">
              <div className="card-body gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] uppercase text-base-content/70">
                  <InformationCircleIcon className="h-5 w-5 text-info" />
                  <span>Scope</span>
                </div>
                <p className="text-sm text-base-content/75">
                  Current assumptions apply to the accrual report only. They are
                  intended to make the report understandable and directionally
                  useful, not to replace detailed payroll accounting.
                </p>
              </div>
            </section>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <AssumptionsTable rows={thresholdRows} title="Status Thresholds" />
            <AssumptionsTable rows={benefitsRows} title="Benefits Loads" />
          </section>

          <section>
            <section className="card bg-base-100 border border-main-border shadow-sm">
              <div className="card-body gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] uppercase text-base-content/70">
                  <ChartBarIcon className="h-5 w-5 text-accent" />
                  <span>Other Notes</span>
                </div>
                <p className="text-sm text-base-content/75">
                  Monthly accrual hours come from the latest positive accrual
                  history when available. The department detail shows the
                  employee-level accrual and cap values that drive the report.
                </p>
                <p className="text-sm text-base-content/75">
                  Waste rate on the overview is shown as lost cost divided by
                  estimated monthly accrual charges. Because lost cost includes
                  benefits load, that percentage can exceed 100% in some cases.
                </p>
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}
