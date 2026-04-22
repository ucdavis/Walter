import {
  ArrowLongLeftIcon,
  CalculatorIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';

type AssumptionRow = {
  label: string;
  value: string;
};

const thresholdRows: AssumptionRow[] = [
  { label: 'At Cap', value: '96.0% and above' },
  { label: 'Approaching Cap', value: '80.0% to 95.9%' },
  { label: 'Active', value: 'Below 80.0%' },
];

const benefitsRows: AssumptionRow[] = [
  { label: 'FY Faculty', value: '41% composite benefits load' },
  { label: 'All other classes', value: '51% composite benefits load' },
];

const hourlyRateRows: AssumptionRow[] = [
  { label: 'FY Acad Admin', value: '$65.00/hr' },
  { label: 'FY Acad Coord', value: '$62.00/hr' },
  { label: 'FY Faculty', value: '$78.00/hr' },
  { label: 'FY Researcher', value: '$68.00/hr' },
  { label: 'MSP', value: '$52.00/hr' },
  { label: 'PSS', value: '$32.50/hr' },
  { label: 'SMG', value: '$72.00/hr' },
  { label: 'Fallback academic', value: '$70.00/hr' },
  { label: 'Fallback staff', value: '$45.00/hr' },
];

const accrualFallbackRows: AssumptionRow[] = [
  { label: '384+ cap hours', value: '16.00 hrs/month' },
  { label: '368+ cap hours', value: '15.33 hrs/month' },
  { label: '352+ cap hours', value: '14.67 hrs/month' },
  { label: '336+ cap hours', value: '14.00 hrs/month' },
  { label: '320+ cap hours', value: '13.33 hrs/month' },
  { label: '288+ cap hours', value: '12.00 hrs/month' },
  { label: '240+ cap hours', value: '10.00 hrs/month' },
  { label: 'Below 240 cap hours', value: '10.00 hrs/month' },
];

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

export function VacationAccrualAbout() {
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

            <Link className="btn btn-outline" to="/accruals">
              <ArrowLongLeftIcon className="h-4 w-4" />
              Back to Overview
            </Link>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <section className="card bg-base-100 border border-main-border shadow-sm lg:col-span-2">
              <div className="card-body gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] uppercase text-base-content/60">
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
                <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] uppercase text-base-content/60">
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

          <section className="grid gap-4 xl:grid-cols-2">
            <AssumptionsTable
              rows={hourlyRateRows}
              title="Hourly Rate Assumptions"
            />
            <AssumptionsTable
              rows={accrualFallbackRows}
              title="Monthly Accrual Fallback Tiers"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <section className="card bg-base-100 border border-main-border shadow-sm">
              <div className="card-body gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] uppercase text-base-content/60">
                  <CurrencyDollarIcon className="h-5 w-5 text-secondary" />
                  <span>Rate Selection</span>
                </div>
                <p className="text-sm text-base-content/75">
                  The report normalizes each employee into a reporting class,
                  then applies the corresponding hourly-rate bucket. If a class
                  does not match a configured bucket, the report falls back to
                  an academic default or a staff default.
                </p>
                <p className="text-sm text-base-content/75">
                  Benefits load is then layered on top of the base hourly rate
                  using the assumptions shown above.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 border border-main-border shadow-sm">
              <div className="card-body gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] uppercase text-base-content/60">
                  <ChartBarIcon className="h-5 w-5 text-accent" />
                  <span>Other Notes</span>
                </div>
                <p className="text-sm text-base-content/75">
                  Monthly accrual hours come from the latest positive accrual
                  history when available. If that history is missing or zero,
                  the report falls back to the cap-based tier table shown on
                  this page.
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
