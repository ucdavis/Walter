import {
  PencilSquareIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import type { ProjectionForecastWindow } from '@/lib/piProjection.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { computeExpenseForecast } from '@/lib/piProjection.ts';
import { getHistoricalExpenseRows } from '@/lib/projectionExpenses.ts';
import { ExpenseSourceLink } from '@/components/projections/ExpenseSourceLink.tsx';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function HistoricalExpensesTable({
  forecastWindow,
  historyMonths,
  onEdit,
  onRestore,
  onSelectSource,
  sources,
}: {
  forecastWindow: ProjectionForecastWindow;
  historyMonths: number;
  onEdit: (sourceId: number, category: string) => void;
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
  return (
    <section aria-label="Historical expense estimates">
      <h3 className="text-base font-semibold">Historical estimates</h3>
      <p className="mt-1 text-sm text-base-content/80">
        Monthly amounts use the selected history window. Custom amounts stay in
        place until you restore the historical amount.
      </p>
      {historical.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-base-300">
          <table className="table walter-table text-sm min-w-[40rem]">
            <thead className="bg-base-200/60">
              <tr>
                <th>Category</th>
                <th>Funding source</th>
                <th className="text-right">Monthly amount</th>
                <th className="text-right">Forecast total</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
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
                const captured = source.runRates.some(
                  (rate) =>
                    rate.expenditureCategory === row.expenditureCategory &&
                    rate.historyMonths === historyMonths
                );
                return (
                  <tr
                    className="hover:bg-base-200/40"
                    key={`${source.id}:${row.expenditureCategory}`}
                  >
                    <th className="font-normal" scope="row">
                      <span className="font-semibold">
                        {row.expenditureCategory}
                      </span>
                      <span className="mt-1 block text-xs text-base-content/70">
                        {captured
                          ? `${historyMonths}-month average: ${formatCurrency(row.baselineAmount)}`
                          : 'No costs captured in this window'}
                      </span>
                    </th>
                    <td>
                      <ExpenseSourceLink
                        onSelect={onSelectSource}
                        source={source}
                      />
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {formatCurrency(row.effectiveAmount)}
                      <span className="mt-1 block text-xs text-base-content/70">
                        {row.overrideAmount === null ? 'Historical' : 'Custom'}
                        {row.effectiveAmount === 0 ? ' · Off' : ''}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {formatCurrency(forecast.total)}
                      {row.effectiveAmount !== 0 &&
                        !forecast.hasEligibleDates && (
                          <span className="mt-1 block text-xs text-base-content/70">
                            No eligible dates in the forecast period.
                          </span>
                        )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          aria-label={`Edit historical amount for ${row.expenditureCategory}`}
                          className="btn btn-ghost btn-sm text-primary"
                          onClick={() =>
                            onEdit(source.id, row.expenditureCategory)
                          }
                          type="button"
                        >
                          <PencilSquareIcon
                            aria-hidden="true"
                            className="size-4"
                          />
                          Edit amount
                        </button>
                        {row.overrideAmount !== null && (
                          <button
                            aria-label={`Use historical amount for ${row.expenditureCategory}`}
                            className="btn btn-ghost btn-sm"
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
          No historical expense categories were captured for the selected
          funding sources.
        </p>
      )}
    </section>
  );
}
