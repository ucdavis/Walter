import { useId, useState } from 'react';
import { TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { PlanExpense } from '@/components/guidedProjections/defaults.ts';
import { useProjectionDialog } from '@/components/projections/useProjectionDialog.ts';
import { monthLabel } from '@/components/projections/projection.ts';

export default function ExpenseDetailsModal({
  categories,
  expense,
  isNew,
  onApply,
  onClose,
  onRemove,
}: {
  categories: string[];
  expense: PlanExpense;
  isNew: boolean;
  onApply: (expense: PlanExpense) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const ref = useProjectionDialog();
  const titleId = useId();
  const endMonthId = useId();
  const [draft, setDraft] = useState(() => structuredClone(expense));
  const projected = draft.serverExpense?.kind === 'Projected';
  const category = draft.serverExpense?.expenditureCategory ?? 'Other expenses';
  const options = categories.includes(category)
    ? categories
    : [...categories, category];
  const endMonth = draft.serverExpense?.endMonth?.slice(0, 7) ?? '';
  const error = !draft.name.trim()
    ? 'Enter an expense name.'
    : !Number.isFinite(draft.amount) || draft.amount < 0
      ? 'Enter an amount of zero or more.'
      : !draft.month
        ? 'Choose a starting month.'
        : draft.frequency === 'monthly' && endMonth && endMonth < draft.month
          ? 'Choose an ending month on or after the starting month.'
          : null;
  return (
    <dialog
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100vw-2rem))] max-w-none overflow-auto rounded-lg border border-main-border bg-base-100 p-0 text-base text-base-content shadow-xl backdrop:bg-base-content/30"
      onCancel={onClose}
      ref={ref}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (error) {
            return;
          }
          onApply({
            ...draft,
            serverExpense: {
              ...draft.serverExpense!,
              amount: draft.amount,
              description: projected
                ? draft.serverExpense!.description
                : draft.name,
              endMonth:
                draft.frequency === 'once'
                  ? null
                  : draft.serverExpense!.endMonth,
              kind: projected
                ? 'Projected'
                : draft.frequency === 'once'
                  ? 'OneTime'
                  : 'Monthly',
              startMonth: projected
                ? draft.serverExpense!.startMonth
                : `${draft.month}-01`,
            },
          });
          onClose();
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-main-border bg-base-200 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-2xl font-semibold" id={titleId}>
              {isNew ? 'Add expense' : 'Expense details'}
            </h2>
            <p className="mt-1 text-sm text-base-content/80">
              {projected
                ? 'Adjust this historical estimate for your plan.'
                : 'Plan a monthly or one-time cost for this project.'}
            </p>
          </div>
          <button
            aria-label="Close expense details"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {projected ? (
              <div className="sm:col-span-2">
                <p className="text-sm text-base-content/80">
                  Expenditure category
                </p>
                <p className="mt-1 font-semibold">{category}</p>
                <p className="mt-2 text-sm text-base-content/80">
                  Monthly from {monthLabel(draft.month)} through plan end.
                </p>
              </div>
            ) : (
              <>
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  Expense name
                  <input
                    autoFocus
                    className="input w-full"
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    required
                    value={draft.name}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  Expenditure category
                  <select
                    className="select w-full"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        serverExpense: {
                          ...draft.serverExpense!,
                          expenditureCategory: event.target.value,
                        },
                      })
                    }
                    value={category}
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Frequency
                  <select
                    className="select w-full"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        frequency:
                          event.target.value === 'once' ? 'once' : 'monthly',
                      })
                    }
                    value={draft.frequency}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="once">One time</option>
                  </select>
                </label>
              </>
            )}
            <label className="grid gap-1.5 text-sm font-medium">
              {draft.frequency === 'monthly' ? 'Monthly amount' : 'Amount'}
              <input
                autoFocus={projected}
                className="input w-full"
                min={0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    amount:
                      event.target.value === ''
                        ? Number.NaN
                        : Number(event.target.value),
                  })
                }
                required
                step="0.01"
                type="number"
                value={Number.isFinite(draft.amount) ? draft.amount : ''}
              />
            </label>
            {!projected && (
              <>
                <label className="grid gap-1.5 text-sm font-medium">
                  {draft.frequency === 'monthly' ? 'Starting month' : 'Month'}
                  <input
                    className="input w-full"
                    onChange={(event) =>
                      setDraft({ ...draft, month: event.target.value })
                    }
                    required
                    type="month"
                    value={draft.month}
                  />
                </label>
                {draft.frequency === 'monthly' && (
                  <div className="grid gap-1.5 text-sm font-medium">
                    <label htmlFor={endMonthId}>Ending month</label>
                    <input
                      aria-describedby={`${endMonthId}-help`}
                      className="input w-full"
                      id={endMonthId}
                      min={draft.month}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          serverExpense: {
                            ...draft.serverExpense!,
                            endMonth: event.target.value
                              ? `${event.target.value}-01`
                              : null,
                          },
                        })
                      }
                      type="month"
                      value={endMonth}
                    />
                    <span
                      className="text-sm font-normal text-base-content/80"
                      id={`${endMonthId}-help`}
                    >
                      Leave blank to run through plan end.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          {error && (
            <p
              className="mt-4 rounded-md bg-error/10 p-3 text-sm text-error"
              role="status"
            >
              {error}
            </p>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-main-border px-5 py-4 sm:px-6">
          {!isNew && (
            <button
              className="btn btn-error btn-outline btn-sm mr-auto"
              onClick={onRemove}
              type="button"
            >
              <TrashIcon aria-hidden="true" className="size-4" />
              Remove expense
            </button>
          )}
          <button className="btn btn-outline" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={Boolean(error)}
            type="submit"
          >
            {isNew ? 'Add expense' : 'Save changes'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
