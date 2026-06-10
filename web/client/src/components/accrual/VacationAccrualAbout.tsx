import {
  ArrowLongLeftIcon,
  CalculatorIcon,
  ChartBarIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  ScaleIcon,
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
    <section>
      <h2 className="h2">{title}</h2>
      <div className="fancy-data">
        <table className="table walter-table walter-subtable">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th className="w-1/2 font-semibold">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportNote({
  children,
  Icon,
  iconClassName,
  title,
}: {
  children: string;
  Icon: typeof CalculatorIcon;
  iconClassName: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon className={`mt-1 h-5 w-5 shrink-0 ${iconClassName}`} />
      <div>
        <h3 className="stat-label-lg">{title}</h3>
        <p className="mt-1 text-sm text-base-content/70">{children}</p>
      </div>
    </div>
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
  const backLink = departmentCode ? (
    <Link
      className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-primary no-underline"
      params={{ departmentCode }}
      to="/accruals/department/$departmentCode"
    >
      <ArrowLongLeftIcon className="h-4 w-4" />
      Back to Department
    </Link>
  ) : (
    <Link
      className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-primary no-underline"
      to="/accruals/overview"
    >
      <ArrowLongLeftIcon className="h-4 w-4" />
      Back to Overview
    </Link>
  );

  return (
    <main className="mt-8">
      <div className="container">
        <section className="section-margin">
          {backLink}
          <div className="space-y-2">
            <h1 className="h1">About This Report</h1>
            <h3 className="subtitle">
              Vacation accrual assumptions and cost model
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ReportNote
              Icon={CalculatorIcon}
              iconClassName="text-primary"
              title="Cost Model"
            >
              monthly accrual hours x hourly rate x (1 + benefits load)
            </ReportNote>
            <ReportNote
              Icon={ScaleIcon}
              iconClassName="text-error"
              title="At Cap Threshold"
            >
              {`${percentFormatter.format(data.atCapThresholdPct)}% and above is treated as at cap.`}
            </ReportNote>
            <ReportNote
              Icon={InformationCircleIcon}
              iconClassName="text-info"
              title="Scope"
            >
              These assumptions make the report directionally useful; they do
              not replace detailed payroll accounting.
            </ReportNote>
          </div>
        </section>

        <section className="section-margin">
          <div className="mb-4">
            <h2 className="h2">Lost Cost Formula</h2>
            <p className="mt-1">
              Lost cost per employee is estimated only when the employee is
              classified as at cap.
            </p>
          </div>

          <div className="grid gap-6 grid-cols-1">
            <div>
              <div className="rounded bg-base-100 px-4 py-3 font-mono text-sm md:text-base">
                monthly accrual hours x hourly rate x (1 + benefits load)
              </div>
              <p className="mt-4 text-sm text-base-content/70">
                The report treats this as an estimated unrecoverable accrual
                cost for the latest month-end snapshot. It is a planning
                estimate, not a payroll posting.
              </p>
            </div>

            <div className="space-y-3 text-sm text-base-content/75">
              <div className="flex gap-2">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>
                  Monthly accrual hours come from the latest positive accrual
                  history when available.
                </span>
              </div>
              <div className="flex gap-2">
                <ChartBarIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  Waste rate is lost cost divided by estimated monthly accrual
                  charges.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="section-margin">
          <div className="grid gap-8 xl:grid-cols-2">
            <AssumptionsTable rows={thresholdRows} title="Status Thresholds" />
            <AssumptionsTable rows={benefitsRows} title="Benefits Loads" />
          </div>
        </section>
      </div>
    </main>
  );
}
