import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { ProjectionForecastWindow } from '@/lib/piProjection.ts';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  computeExpenseForecast,
  getSourceForecastWindow,
} from '@/lib/piProjection.ts';
import { ExpenseSourceLink } from '@/components/projections/ExpenseSourceLink.tsx';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function AddedExpensesTable({
  forecastWindow,
  onEdit,
  onRemove,
  onSelectSource,
  sources,
}: {
  forecastWindow: ProjectionForecastWindow;
  onEdit: (sourceId: number, id: number) => void;
  onRemove: (sourceId: number, id: number) => void;
  onSelectSource: (id: number) => void;
  sources: ProjectionFundingSource[];
}) {
  const expenses = sources.flatMap((source) =>
    source.expenses.map((item) => ({ item, source }))
  );
  return (
    <section aria-label="Added expenses">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Added expenses</h3>
      </div>
      {expenses.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-base-300">
          <table className="table walter-table text-sm min-w-[44rem]">
            <thead className="bg-base-200/60">
              <tr>
                <th>Expense</th>
                <th>Funding source</th>
                <th>Schedule</th>
                <th className="text-right">Entered amount</th>
                <th className="text-right">Forecast total</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(({ item, source }) => {
                const window = getSourceForecastWindow(source, forecastWindow);
                const forecast = computeExpenseForecast(
                  source,
                  item,
                  forecastWindow
                );
                const end =
                  item.endMonth?.slice(0, 7) ??
                  source.endDate?.slice(0, 7) ??
                  window.endMonth;
                return (
                  <tr
                    className="hover:bg-base-200/40"
                    key={`${source.id}:${item.id}`}
                  >
                    <th className="font-normal" scope="row">
                      <span className="font-semibold">{item.description}</span>
                      <span className="mt-1 block text-xs text-base-content/70">
                        {item.expenditureCategory}
                      </span>
                    </th>
                    <td>
                      <ExpenseSourceLink
                        onSelect={onSelectSource}
                        source={source}
                      />
                    </td>
                    <td>
                      {item.kind === 'OneTime' ? (
                        `One time: ${fundingMonthLabel(item.startMonth.slice(0, 7))}`
                      ) : (
                        <>
                          {fundingMonthLabel(item.startMonth.slice(0, 7))}{' '}
                          through {fundingMonthLabel(end)}
                          <span className="mt-1 block text-xs text-base-content/70">
                            {item.endMonth
                              ? 'Fixed end month'
                              : source.endDate
                                ? 'Follows source end'
                                : 'Follows forecast end'}
                          </span>{' '}
                        </>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {formatCurrency(item.amount)}
                      {item.kind === 'Monthly' ? ' / month' : ''}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {formatCurrency(forecast.total)}
                      {item.amount !== 0 && !forecast.hasEligibleDates && (
                        <span className="mt-1 block text-xs text-base-content/70">
                          No eligible dates in the forecast period.
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          aria-label={`Edit expense ${item.description}`}
                          className="btn btn-ghost btn-sm text-primary"
                          onClick={() => onEdit(source.id, item.id)}
                          type="button"
                        >
                          <PencilSquareIcon
                            aria-hidden="true"
                            className="size-4"
                          />
                          Edit
                        </button>
                        <button
                          aria-label={`Remove expense ${item.description}`}
                          className="btn btn-ghost btn-sm"
                          onClick={() => onRemove(source.id, item.id)}
                          type="button"
                        >
                          <TrashIcon aria-hidden="true" className="size-4" />
                          <span className="sr-only">Remove</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm">
          No added expenses for the selected funding sources.
        </p>
      )}
    </section>
  );
}
