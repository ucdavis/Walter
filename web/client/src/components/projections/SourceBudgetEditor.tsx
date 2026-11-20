import { useEffect, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';

export interface BudgetEditorRow {
  category: string;
  initial: number;
  initialRecorded?: boolean;
  remaining: number | null;
  revised: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;

function parseAmount(text: string) {
  const value = text.trim() ? Number(text) : Number.NaN;
  return Number.isFinite(value) && cents(value) === value ? value : null;
}

export function SourceBudgetEditor({
  categories,
  initialPlanned,
  onErrorChange,
  onReset,
  onSet,
  rows,
}: {
  categories: string[];
  initialPlanned: boolean;
  onErrorChange: (error: string | null) => void;
  onReset: () => void;
  onSet: (category: string, amount: number) => void;
  rows: BudgetEditorRow[];
}) {
  const sum = cents(rows.reduce((total, row) => total + row.revised, 0));
  const [total, setTotal] = useState(sum.toFixed(2));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const totalAmount = parseAmount(total);
  const difference = totalAmount === null ? 0 : cents(sum - totalAmount);
  const error =
    totalAmount === null ||
    Object.values(drafts).some((text) => parseAmount(text) === null)
      ? 'Enter amounts with at most two decimal places.'
      : difference !== 0
        ? `Categories add up to ${formatCurrency(sum)}, ${formatCurrency(Math.abs(difference))} ${difference > 0 ? 'over' : 'under'} the project total.`
        : null;
  useEffect(() => {
    onErrorChange(error);
    return () => onErrorChange(null);
  }, [error, onErrorChange]);
  const unused = categories.filter(
    (category) => !rows.some((row) => row.category === category)
  );
  return (
    <section aria-label="Edit category budget" className="space-y-3">
      <h3 className="font-semibold">Category budget</h3>
      <p className="text-sm text-base-content/70">
        Enter the project total and the budget for each category. The categories
        must add up to the total.
      </p>
      <label className="flex flex-col gap-2 text-sm sm:max-w-xs">
        Project total
        <input
          className="input input-bordered w-full"
          inputMode="decimal"
          onChange={(event) => setTotal(event.target.value)}
          value={total}
        />
      </label>
      <div className="overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th>Category</th>
              <th className="text-right">
                {initialPlanned
                  ? 'Initial planned funding'
                  : 'Captured available'}
              </th>
              <th className="text-right">Budget</th>
              <th className="text-right">Forecast remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category}>
                <th scope="row">{row.category}</th>
                <td className="text-right whitespace-nowrap">
                  {row.initialRecorded === false
                    ? '—'
                    : formatCurrency(row.initial)}
                </td>
                <td className="text-right">
                  <input
                    aria-label={`Budget for ${row.category}`}
                    className="input input-sm w-32 text-right"
                    inputMode="decimal"
                    onChange={(event) => {
                      const text = event.target.value;
                      setDrafts((current) => ({
                        ...current,
                        [row.category]: text,
                      }));
                      const amount = parseAmount(text);
                      if (amount !== null) {
                        onSet(row.category, amount);
                      }
                    }}
                    value={drafts[row.category] ?? row.revised.toFixed(2)}
                  />
                </td>
                <td
                  className={`text-right whitespace-nowrap ${row.remaining !== null && row.remaining < 0 ? 'text-error font-semibold' : ''}`}
                >
                  {row.remaining === null ? '—' : formatCurrency(row.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Categories total</th>
              <td />
              <td
                className={`text-right whitespace-nowrap font-semibold ${difference !== 0 ? 'text-error' : ''}`}
              >
                {formatCurrency(sum)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {unused.length > 0 && (
          <select
            aria-label="Add category"
            className="select select-sm w-auto"
            onChange={(event) => {
              if (event.target.value) {
                onSet(event.target.value, 0);
              }
            }}
            value=""
          >
            <option value="">Add category</option>
            {unused.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onReset} type="button">
          <ArrowPathIcon aria-hidden="true" className="size-4" />
          Reset budget changes
        </button>
      </div>
    </section>
  );
}
