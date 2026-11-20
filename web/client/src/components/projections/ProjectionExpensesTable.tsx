import { ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ExpenseSourceLink } from '@/components/projections/ExpenseSourceLink.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatProjectionCurrency as money } from '@/components/projections/projectionFormatting.ts';
import {
  computeExpenseForecast,
  type ProjectionForecastWindow,
} from '@/lib/piProjection.ts';
import { getHistoricalExpenseRows } from '@/lib/projectionExpenses.ts';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function ProjectionExpensesTable({
  forecastWindow,
  historyMonths,
  onEdit,
  onEditHistorical,
  onRemove,
  onRestore,
  onSelectSource,
  sources,
}: {
  forecastWindow: ProjectionForecastWindow;
  historyMonths: number;
  onEdit: (sourceId: number, id: number) => void;
  onEditHistorical: (sourceId: number, category: string) => void;
  onRemove: (sourceId: number, id: number) => void;
  onRestore: (sourceId: number, category: string) => void;
  onSelectSource: (id: number) => void;
  sources: ProjectionFundingSource[];
}) {
  const historical = sources.flatMap((source) =>
    getHistoricalExpenseRows(source, historyMonths).map((row) => ({
      row,
      source,
    }))
  );
  const added = sources.flatMap((source) =>
    source.expenses.map((item) => ({ item, source }))
  );
  return (
    <div
      aria-label="Plan expenses"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table className="table walter-table text-sm [&_th[scope=row]]:border-y-0!">
        <thead>
          <tr>
            <th scope="col">Expense</th>
            <th scope="col">Source</th>
            <th scope="col">Schedule</th>
            <th className="text-right" scope="col">
              Amount
            </th>
            <th className="text-right" scope="col">
              Plan total
            </th>
          </tr>
        </thead>
        <tbody aria-label="Historical expense estimates">
          <tr className="bg-base-200">
            <th colSpan={5} scope="rowgroup">
              Historical estimates
            </th>
          </tr>
          {historical.map(({ row, source }) => {
            const forecast = computeExpenseForecast(
              source,
              {
                amount: row.effectiveAmount,
                endMonth: null,
                kind: 'Monthly',
                startMonth: null,
              },
              forecastWindow
            );
            const firstMonth = forecast.months[0]?.month;
            const lastMonth = forecast.months.at(-1)?.month;
            return (
              <tr
                className="hover:bg-base-200/50"
                key={`${source.id}:${row.expenditureCategory}`}
                style={{
                  borderLeft: `3px solid ${projectExpenditureCategoryColor(row.expenditureCategory)}`,
                }}
              >
                <th className="min-w-56 font-normal" scope="row">
                  <p className="font-semibold">{row.expenditureCategory}</p>
                  <p className="mt-0.5 text-sm text-base-content/80">
                    {source.runRates.some(
                      (rate) =>
                        rate.expenditureCategory === row.expenditureCategory &&
                        rate.historyMonths === historyMonths
                    )
                      ? `${historyMonths}-month average: ${money(row.baselineAmount)}`
                      : 'No costs captured in this window'}
                  </p>
                  {row.overrideAmount !== null && (
                    <button
                      aria-label={`Use historical amount for ${row.expenditureCategory}`}
                      className="btn btn-ghost btn-sm mt-1 px-0"
                      onClick={() =>
                        onRestore(source.id, row.expenditureCategory)
                      }
                      type="button"
                    >
                      <ArrowUturnLeftIcon
                        aria-hidden="true"
                        className="size-4"
                      />
                      Use historical amount
                    </button>
                  )}
                </th>
                <td>
                  <span
                    className={`badge badge-soft badge-sm ${row.overrideAmount === null ? 'badge-neutral' : 'badge-primary'}`}
                  >
                    {row.overrideAmount === null ? 'Projected' : 'Custom'}
                    {row.effectiveAmount === 0 ? ' · Off' : ''}
                  </span>
                  <div className="mt-1">
                    <ExpenseSourceLink
                      onSelect={onSelectSource}
                      source={source}
                    />
                  </div>
                </td>
                <td className="text-sm whitespace-nowrap">
                  {firstMonth && lastMonth ? (
                    <>
                      <p>Monthly</p>
                      <p className="mt-0.5 text-base-content/80">
                        {fundingMonthLabel(firstMonth)} –{' '}
                        {fundingMonthLabel(lastMonth)}
                      </p>
                    </>
                  ) : (
                    <p className="text-base-content/80">
                      No active months in this plan
                    </p>
                  )}
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">
                  <button
                    aria-haspopup="dialog"
                    aria-label={`Edit historical amount for ${row.expenditureCategory}`}
                    className="input input-sm w-36 justify-end gap-1 text-right tabular-nums"
                    onClick={() =>
                      onEditHistorical(source.id, row.expenditureCategory)
                    }
                    type="button"
                  >
                    {money(row.effectiveAmount)}
                    <span className="text-xs text-base-content/80">/mo</span>
                  </button>
                </td>
                <td className="text-right font-semibold whitespace-nowrap tabular-nums">
                  {money(forecast.total)}
                  {row.effectiveAmount !== 0 && !forecast.hasEligibleDates && (
                    <span className="mt-1 block text-xs font-normal text-base-content/80">
                      No eligible dates in the forecast period.
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {!historical.length && (
            <tr>
              <td colSpan={5}>
                No historical expense categories were captured for the selected
                funding sources.
              </td>
            </tr>
          )}
        </tbody>
        <tbody aria-label="Added expenses">
          {(['Monthly', 'OneTime'] as const).map((kind) => (
            <ExpenseRows
              forecastWindow={forecastWindow}
              key={kind}
              kind={kind}
              onEdit={onEdit}
              onRemove={onRemove}
              onSelectSource={onSelectSource}
              rows={added.filter(({ item }) => item.kind === kind)}
            />
          ))}
          {!added.length && (
            <tr>
              <td className="p-6 text-center" colSpan={5}>
                <h3 className="font-semibold">No added expenses</h3>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseRows({
  forecastWindow,
  kind,
  onEdit,
  onRemove,
  onSelectSource,
  rows,
}: {
  forecastWindow: ProjectionForecastWindow;
  kind: 'Monthly' | 'OneTime';
  onEdit: (sourceId: number, id: number) => void;
  onRemove: (sourceId: number, id: number) => void;
  onSelectSource: (id: number) => void;
  rows: {
    item: ProjectionFundingSource['expenses'][number];
    source: ProjectionFundingSource;
  }[];
}) {
  if (!rows.length) {
    return null;
  }
  return (
    <>
      <tr className="bg-base-200">
        <th colSpan={5} scope="rowgroup">
          {kind === 'Monthly' ? 'Monthly expenses' : 'One-time expenses'}
        </th>
      </tr>
      {rows.map(({ item, source }) => {
        const forecast = computeExpenseForecast(source, item, forecastWindow);
        const firstMonth = forecast.months[0]?.month;
        const lastMonth = forecast.months.at(-1)?.month;
        return (
          <tr
            className="hover:bg-base-200/50"
            key={`${source.id}:${item.id}`}
            style={{
              borderLeft: `3px solid ${projectExpenditureCategoryColor(item.expenditureCategory)}`,
            }}
          >
            <th className="min-w-56 font-normal" scope="row">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{item.description}</p>
                  <p className="mt-0.5 text-sm text-base-content/80">
                    {item.expenditureCategory}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    aria-label={`Edit expense ${item.description}`}
                    className="btn btn-ghost btn-sm"
                    onClick={() => onEdit(source.id, item.id)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Remove expense ${item.description}`}
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => onRemove(source.id, item.id)}
                    type="button"
                  >
                    <TrashIcon aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </div>
            </th>
            <td>
              <span className="badge badge-soft badge-primary badge-sm">
                Planned
              </span>
              <div className="mt-1">
                <ExpenseSourceLink onSelect={onSelectSource} source={source} />
              </div>
            </td>
            <td className="text-sm whitespace-nowrap">
              <p>{kind === 'Monthly' ? 'Monthly' : 'One time'}</p>
              <p className="mt-0.5 text-base-content/80">
                {kind === 'OneTime'
                  ? fundingMonthLabel(item.startMonth.slice(0, 7))
                  : firstMonth && lastMonth
                    ? `${fundingMonthLabel(firstMonth)} – ${fundingMonthLabel(lastMonth)}`
                    : 'No active months in this plan'}
              </p>
            </td>
            <td className="text-right whitespace-nowrap tabular-nums">
              {money(item.amount)}
              {kind === 'Monthly' && (
                <span className="ml-1 text-xs text-base-content/80">/mo</span>
              )}
            </td>
            <td className="text-right font-semibold whitespace-nowrap tabular-nums">
              {money(forecast.total)}
              {item.amount !== 0 && !forecast.hasEligibleDates && (
                <span className="mt-1 block text-xs font-normal text-base-content/80">
                  No eligible dates in the forecast period.
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
