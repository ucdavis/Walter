import { useEffect, useRef } from 'react';
import { SourceOutlookAppointments } from '@/components/projections/SourceOutlookAppointments.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { FRINGE_CATEGORY, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import type { SourceOutlook } from '@/lib/projectionOutlook.ts';
import { sourceCapturedBalance } from '@/lib/projectionSources.ts';
import type {
  ProjectionNavigation,
  ProjectionResults,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

export function SourceOutlookDetails({
  draft,
  onNavigate,
  outlook,
  results,
}: {
  draft: ProjectionDraft;
  onNavigate: (location: ProjectionNavigation) => void;
  outlook: SourceOutlook;
  results: ProjectionResults;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { source } = outlook;
  useEffect(() => {
    headingRef.current?.focus();
  }, [source.id]);

  return (
    <section aria-label={`${outlook.label} details`} className="mt-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="break-words text-xl font-bold"
            ref={headingRef}
            tabIndex={-1}
          >
            {outlook.label} details
          </h3>
          <p className="mt-2 text-sm">
            {source.sourceKind === 'Planned'
              ? 'Planned funding'
              : `Captured ${source.capturedAt.slice(0, 10)}`}
            . Available {source.startDate ?? 'without a start limit'}
            {source.endDate
              ? ` through ${source.endDate}`
              : ', with no end date'}
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() =>
              onNavigate({ section: 'funding', source: source.id })
            }
            type="button"
          >
            Edit funding source
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() =>
              onNavigate({ section: 'expenses', source: source.id })
            }
            type="button"
          >
            Edit other expenses
          </button>
        </div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {source.sourceKind !== 'Planned' && (
          <div>
            <dt>Captured balance</dt>
            <dd className="font-semibold">
              {formatCurrency(sourceCapturedBalance(source))}
            </dd>
          </div>
        )}
        <div>
          <dt>Planning balance</dt>
          <dd className="font-semibold">
            {formatCurrency(outlook.planningBalance)}
          </dd>
        </div>
      </dl>
      {outlook.outside && (
        <p className="text-sm">
          This source starts after the forecast period and contributes no
          forecast costs or balance in this period. Its entered funding and
          allocations remain saved.
        </p>
      )}
      <SourceForecastCosts outlook={outlook} />
      <SourceMonthlyAmounts outlook={outlook} />
      <SourceOutlookAppointments
        appointments={draft.content.appointments}
        onNavigate={onNavigate}
        results={results}
        sourceId={source.id}
      />
    </section>
  );
}

function SourceForecastCosts({ outlook }: { outlook: SourceOutlook }) {
  const salary =
    outlook.categories.find(
      ({ expenditureCategory }) => expenditureCategory === SALARY_CATEGORY
    )?.forecast ?? 0;
  const fringe =
    outlook.categories.find(
      ({ expenditureCategory }) => expenditureCategory === FRINGE_CATEGORY
    )?.forecast ?? 0;
  const amounts = [
    { amount: salary, label: 'Salary' },
    { amount: fringe, label: 'Fringe' },
    {
      amount: outlook.forecast - salary - fringe,
      label: 'Other forecast costs',
    },
  ];
  return (
    <section aria-label="Net forecast cost breakdown">
      <h4 className="font-semibold">Net forecast costs</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        {amounts.map(({ amount, label }) => (
          <div className="rounded-box bg-base-200 p-3" key={label}>
            <dt className="text-sm">{label}</dt>
            <dd className="mt-1 text-lg font-semibold">
              {formatCurrency(amount)}
            </dd>
          </div>
        ))}
      </dl>
      <details className="mt-4">
        <summary className="cursor-pointer font-medium">
          Forecast costs by category
        </summary>
        {outlook.categories.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table w-full">
              <caption className="sr-only">
                {outlook.label} forecast costs by category
              </caption>
              <thead>
                <tr>
                  <th scope="col">Expenditure category</th>
                  <th className="text-right" scope="col">
                    Net forecast costs
                  </th>
                </tr>
              </thead>
              <tbody>
                {outlook.categories.map(({ expenditureCategory, forecast }) => (
                  <tr key={expenditureCategory}>
                    <th scope="row">{expenditureCategory}</th>
                    <td className="text-right whitespace-nowrap">
                      {formatCurrency(forecast)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm">No forecast costs in this period.</p>
        )}
      </details>
    </section>
  );
}

function SourceMonthlyAmounts({ outlook }: { outlook: SourceOutlook }) {
  return (
    <details>
      <summary className="cursor-pointer font-medium">
        Monthly balances and costs
      </summary>
      <h4 className="mt-3 font-semibold">{outlook.label} by month</h4>
      <p className="mt-2 text-sm">
        Booked costs in the capture month are already included in the captured
        balance. Net forecast costs are additional expected spending, including
        planned credits.
      </p>
      {outlook.months.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="table w-full whitespace-nowrap">
            <caption className="sr-only">
              Monthly actuals, forecast, and remaining balance for{' '}
              {outlook.label}
            </caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Booked costs</th>
                <th scope="col">Net forecast costs</th>
                <th scope="col">End balance</th>
              </tr>
            </thead>
            <tbody>
              {outlook.months.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{month.month}</th>
                  <td>{formatCurrency(month.actual)}</td>
                  <td>{formatCurrency(month.forecast)}</td>
                  <td
                    className={
                      month.remaining < 0 ? 'font-semibold text-error' : ''
                    }
                  >
                    {formatCurrency(month.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm">
          No monthly balance or costs in this forecast period.
        </p>
      )}
    </details>
  );
}
