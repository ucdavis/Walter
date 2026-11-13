import { useState } from 'react';
import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '@/lib/currency.ts';

export interface BudgetEditorRow {
  category: string;
  change: number;
  initial: number;
  initialRecorded?: boolean;
  remaining: number | null;
  revised: number;
}

export function SourceBudgetEditor({
  categories,
  initialPlanned,
  onAdjust,
  onMove,
  onPendingChange,
  onReset,
  rows,
}: {
  categories: string[];
  initialPlanned: boolean;
  onAdjust: (category: string, amount: number) => void;
  onMove: (from: string, to: string, amount: number) => void;
  onPendingChange: (pending: boolean) => void;
  onReset: () => void;
  rows: BudgetEditorRow[];
}) {
  const [action, setAction] = useState<'move' | 'adjust' | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const numeric = amount.trim() ? Number(amount) : Number.NaN;
  const wholeCents = Math.round(numeric * 100) / 100 === numeric;
  const valid =
    Boolean(to) &&
    Number.isFinite(numeric) &&
    numeric >= 0 &&
    wholeCents &&
    (action !== 'move' || (Boolean(from) && from !== to && numeric > 0));
  function close() {
    setAction(null);
    setFrom('');
    setTo('');
    setAmount('');
    setDirection('add');
    onPendingChange(false);
  }
  const donor = rows.find((row) => row.category === from)?.revised ?? 0;
  const changes = rows.filter((row) => row.change !== 0);
  const total = rows.reduce((sum, row) => sum + row.revised, 0);
  return (
    <section aria-label="Edit category budget" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Category budget</h3>
        <p className="text-sm">
          Total <strong>{formatCurrency(total)}</strong>
        </p>
      </div>
      <p className="text-sm text-base-content/70">
        Budget changes apply to the whole source. Salary, fringe, and indirect
        budgets change only when you select them.
      </p>
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
              <th className="text-right">Net change</th>
              <th className="text-right">Revised available</th>
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
                <td className="text-right whitespace-nowrap">
                  {row.change > 0 ? '+' : ''}
                  {formatCurrency(row.change)}
                </td>
                <td
                  className={`text-right whitespace-nowrap ${row.revised < 0 ? 'text-error font-semibold' : ''}`}
                >
                  {formatCurrency(row.revised)}
                </td>
                <td
                  className={`text-right whitespace-nowrap ${row.remaining !== null && row.remaining < 0 ? 'text-error font-semibold' : ''}`}
                >
                  {row.remaining === null ? '—' : formatCurrency(row.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="text-sm">
          Choose a category with Adjust funding to add its budget, including
          zero.
        </p>
      )}
      {changes.length > 0 && (
        <p aria-label="Net budget changes" className="text-sm">
          {changes
            .map(
              (row) =>
                `${row.category} ${row.change > 0 ? '+' : ''}${formatCurrency(row.change)}`
            )
            .join(' · ')}
        </p>
      )}
      {!action ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setAction('move');
              onPendingChange(true);
            }}
            type="button"
          >
            <ArrowsRightLeftIcon aria-hidden="true" className="size-4" />
            Move budget
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setAction('adjust');
              onPendingChange(true);
            }}
            type="button"
          >
            <BanknotesIcon aria-hidden="true" className="size-4" />
            Adjust funding
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onReset}
            type="button"
          >
            <ArrowPathIcon aria-hidden="true" className="size-4" />
            Reset budget changes
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-base-300 bg-base-200/30 p-3 space-y-3">
          <h4 className="font-semibold">
            {action === 'move' ? 'Move budget' : 'Adjust funding'}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {action === 'move' && (
              <label className="text-sm">
                From category
                <select
                  className="select select-sm mt-1 w-full"
                  onChange={(event) => setFrom(event.target.value)}
                  value={from}
                >
                  <option value="">Choose category</option>
                  {rows.map((row) => (
                    <option key={row.category}>{row.category}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm">
              {action === 'move' ? 'To category' : 'Category'}
              <select
                className="select select-sm mt-1 w-full"
                onChange={(event) => setTo(event.target.value)}
                value={to}
              >
                <option value="">Choose category</option>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            {action === 'adjust' && (
              <label className="text-sm">
                Change
                <select
                  className="select select-sm mt-1 w-full"
                  onChange={(event) =>
                    setDirection(event.target.value as typeof direction)
                  }
                  value={direction}
                >
                  <option value="add">Add funding</option>
                  <option value="subtract">Subtract funding</option>
                </select>
              </label>
            )}
            <label className="text-sm">
              Amount
              <input
                className="input input-sm mt-1 w-full"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                value={amount}
              />
            </label>
          </div>
          {Number.isFinite(numeric) && !wholeCents && (
            <p className="text-sm text-error" role="alert">
              Enter an amount with at most two decimal places.
            </p>
          )}
          {action === 'move' && from && Number.isFinite(numeric) && (
            <p className={`text-sm ${donor - numeric < 0 ? 'text-error' : ''}`}>
              {from}: {formatCurrency(donor)} →{' '}
              {formatCurrency(donor - numeric)}
              {donor - numeric < 0
                ? '. This move leaves the donor category negative.'
                : ''}
            </p>
          )}
          <p className="text-sm text-base-content/70">
            {action === 'move'
              ? 'Moving budget keeps the source total unchanged.'
              : 'Adjusting funding changes the source total.'}
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={!valid}
              onClick={() => {
                if (action === 'move') {
                  onMove(from, to, numeric);
                } else {
                  onAdjust(to, direction === 'add' ? numeric : -numeric);
                }
                close();
              }}
              type="button"
            >
              {action === 'move' ? 'Move amount' : 'Apply adjustment'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={close}
              type="button"
            >
              Cancel {action === 'move' ? 'move' : 'adjustment'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
