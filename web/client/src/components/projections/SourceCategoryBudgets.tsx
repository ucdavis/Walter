import type { Ref } from 'react';
import { formatCurrency } from '@/lib/currency.ts';
import { FRINGE_CATEGORY, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import type { SourceFundingBalance } from '@/lib/projectionFundingBalances.ts';

export function SourceCategoryBudgets({
  balance,
  headingRef,
  sourceIdentity,
}: {
  balance: SourceFundingBalance;
  headingRef?: Ref<HTMLHeadingElement>;
  sourceIdentity?: string;
}) {
  if (balance.basis === 'unknown') {
    return (
      <p className="rounded-box border border-base-300 p-3 text-sm">
        Funding basis unknown. Salary and fringe budget restrictions cannot be
        determined from this source’s project type. Overall balances and
        forecast costs remain available.
      </p>
    );
  }
  if (balance.basis !== 'sponsored') {
    return null;
  }
  const total = balance.categories.reduce(
    (sum, row) => ({
      captured: sum.captured + row.capturedAvailable,
      forecast: sum.forecast + row.forecast,
      remaining: sum.remaining + (row.endRemaining ?? 0),
    }),
    { captured: 0, forecast: 0, remaining: 0 }
  );
  return (
    <section aria-label="Category budget balances">
      <h4 className="scroll-mt-24 font-semibold" ref={headingRef} tabIndex={-1}>
        Category budget balances
      </h4>
      {sourceIdentity && (
        <p className="mt-1 text-sm font-medium break-words">{sourceIdentity}</p>
      )}
      <p className="mt-2 text-sm text-base-content/70">
        Salary and fringe have separate budgets. A positive source overall
        balance does not cover a shortfall in either category. Planning balance
        adjustments are shown separately.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="table table-sm w-full">
          <caption className="sr-only">
            Captured category budgets and remaining balances at plan end
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th className="text-right" scope="col">
                Starting available
              </th>
              <th className="text-right" scope="col">
                Net forecast costs
              </th>
              <th className="text-right" scope="col">
                Remaining at plan end
              </th>
            </tr>
          </thead>
          <tbody>
            {balance.categories.map((row) => {
              const personnel =
                row.expenditureCategory === SALARY_CATEGORY
                  ? 'salary'
                  : row.expenditureCategory === FRINGE_CATEGORY
                    ? 'fringe'
                    : null;
              const missing = !row.budgetRecorded && !row.isBalanceAdjustment;
              return (
                <tr key={row.expenditureCategory}>
                  <th scope="row">
                    {row.isBalanceAdjustment
                      ? 'Planning balance adjustment'
                      : row.expenditureCategory}
                    {missing && personnel && row.hasCharges && (
                      <span className="mt-1 block font-normal text-error">
                        No {personnel} budget recorded
                      </span>
                    )}
                  </th>
                  <td
                    className={`text-right whitespace-nowrap ${row.capturedAvailable < 0 ? 'font-semibold text-error' : ''}`}
                  >
                    {missing ? '—' : formatCurrency(row.capturedAvailable)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {formatCurrency(row.forecast)}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap ${row.endRemaining !== null && row.endRemaining < 0 ? 'font-semibold text-error' : ''}`}
                  >
                    {row.endRemaining === null ||
                    (missing && row.endRemaining === 0)
                      ? '—'
                      : formatCurrency(row.endRemaining)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Source overall</th>
              <td className="text-right whitespace-nowrap">
                {formatCurrency(total.captured)}
              </td>
              <td className="text-right whitespace-nowrap">
                {formatCurrency(total.forecast)}
              </td>
              <td className="text-right whitespace-nowrap">
                {balance.months.size ? formatCurrency(total.remaining) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
