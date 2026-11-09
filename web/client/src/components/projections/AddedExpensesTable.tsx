import type { ProjectionForecastWindow } from '@/lib/piProjection.ts';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  computeExpenseForecast,
  getSourceForecastWindow,
} from '@/lib/piProjection.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function AddedExpensesTable({
  forecastWindow,
  onAdd,
  onEdit,
  onRemove,
  source,
}: {
  forecastWindow: ProjectionForecastWindow;
  onAdd: () => void;
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
  source: ProjectionFundingSource;
}) {
  const window = getSourceForecastWindow(source, forecastWindow);
  return (
    <section aria-label="Added expenses">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Added expenses</h3>
        <button
          className="btn btn-outline"
          onClick={() => onAdd()}
          type="button"
        >
          Add expense
        </button>
      </div>
      {source.expenses.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="table table-sm min-w-[44rem]">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Schedule</th>
                <th>Entered amount</th>
                <th>Forecast total</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {source.expenses.map((item) => {
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
                  <tr key={item.id}>
                    <th className="font-normal" scope="row">
                      <span className="font-medium">{item.description}</span>
                      <span className="mt-1 block text-xs">
                        {item.expenditureCategory}
                      </span>
                    </th>
                    <td>
                      {item.kind === 'OneTime' ? (
                        `One time: ${fundingMonthLabel(item.startMonth.slice(0, 7))}`
                      ) : (
                        <>
                          {fundingMonthLabel(item.startMonth.slice(0, 7))}{' '}
                          through {fundingMonthLabel(end)}
                          <span className="mt-1 block text-xs">
                            {item.endMonth
                              ? 'Fixed end month'
                              : source.endDate
                                ? 'Follows source end'
                                : 'Follows forecast end'}
                          </span>{' '}
                        </>
                      )}
                    </td>
                    <td>
                      {formatCurrency(item.amount)}
                      {item.kind === 'Monthly' ? ' / month' : ''}
                    </td>
                    <td>
                      {formatCurrency(forecast.total)}
                      {item.amount !== 0 && !forecast.hasEligibleDates && (
                        <span className="mt-1 block text-xs">
                          No eligible dates in the forecast period.
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          aria-label={`Edit expense ${item.description}`}
                          className="btn btn-outline btn-sm"
                          onClick={() => onEdit(item.id)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          aria-label={`Remove expense ${item.description}`}
                          className="btn btn-ghost btn-sm"
                          onClick={() => onRemove(item.id)}
                          type="button"
                        >
                          Remove
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
        <p className="mt-3 text-sm">No added expenses for this source.</p>
      )}
    </section>
  );
}
