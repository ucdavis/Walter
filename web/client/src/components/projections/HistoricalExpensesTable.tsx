import { formatCurrency } from '@/lib/currency.ts';
import { computeExpenseForecast } from '@/lib/piProjection.ts';
import { getHistoricalExpenseRows } from '@/lib/projectionExpenses.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function HistoricalExpensesTable({
  historyMonths,
  onEdit,
  onRestore,
  source,
}: {
  historyMonths: number;
  onEdit: (category: string) => void;
  onRestore: (category: string) => void;
  source: ProjectionFundingSource;
}) {
  const historical = getHistoricalExpenseRows(source, historyMonths);
  return (
    <section aria-label="Historical expense estimates">
      <h3 className="text-xl font-semibold">Historical estimates</h3>
      <p className="mt-2 text-sm">
        Monthly amounts use the selected history window. Custom amounts stay in
        place until you restore the historical amount.
      </p>
      {historical.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="table table-sm min-w-[40rem]">
            <thead>
              <tr>
                <th>Category</th>
                <th>Monthly amount</th>
                <th>Forecast total</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {historical.map((row) => {
                const forecast = computeExpenseForecast(source, {
                  amount: row.effectiveAmount,
                  endMonth: null,
                  kind: 'Monthly',
                  startMonth: null,
                });
                const captured = source.runRates.some(
                  (rate) =>
                    rate.expenditureCategory === row.expenditureCategory &&
                    rate.historyMonths === historyMonths
                );
                return (
                  <tr key={row.expenditureCategory}>
                    <th className="font-normal" scope="row">
                      <span className="font-medium">
                        {row.expenditureCategory}
                      </span>
                      <span className="mt-1 block text-xs">
                        {captured
                          ? `${historyMonths}-month average: ${formatCurrency(row.baselineAmount)}`
                          : 'No costs captured in this window'}
                      </span>
                    </th>
                    <td>
                      {formatCurrency(row.effectiveAmount)}
                      <span className="mt-1 block text-xs">
                        {row.overrideAmount === null ? 'Historical' : 'Custom'}
                        {row.effectiveAmount === 0 ? ' · Off' : ''}
                      </span>
                    </td>
                    <td>
                      {formatCurrency(forecast.total)}
                      {row.effectiveAmount !== 0 &&
                        !forecast.hasEligibleDates && (
                          <span className="mt-1 block text-xs">
                            No eligible dates in the forecast period.
                          </span>
                        )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          aria-label={`Edit historical amount for ${row.expenditureCategory}`}
                          className="btn btn-outline btn-sm"
                          onClick={() => onEdit(row.expenditureCategory)}
                          type="button"
                        >
                          Edit amount
                        </button>
                        {row.overrideAmount !== null && (
                          <button
                            aria-label={`Use historical amount for ${row.expenditureCategory}`}
                            className="btn btn-ghost btn-sm"
                            onClick={() => onRestore(row.expenditureCategory)}
                            type="button"
                          >
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
          No historical expense categories were captured for this source.
        </p>
      )}
    </section>
  );
}
