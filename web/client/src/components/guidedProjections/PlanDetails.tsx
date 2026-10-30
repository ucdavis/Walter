import { useId, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ProjectionPlan } from '@/components/guidedProjections/planModel.ts';
import { withHistoryMonths } from '@/components/guidedProjections/serverPlan.ts';
import PlanningPeriodSelect from '@/components/guidedProjections/PlanningPeriodSelect.tsx';
import { useProjectionDialog } from '@/components/projections/useProjectionDialog.ts';

export function PlanDetailsModal({
  onApply,
  onClose,
  plan,
}: {
  onApply: (plan: ProjectionPlan) => void;
  onClose: () => void;
  plan: ProjectionPlan;
}) {
  const ref = useProjectionDialog();
  const titleId = useId();
  const [draft, setDraft] = useState(() => structuredClone(plan));
  const error = draft.name.trim() ? null : 'Give your plan a name.';
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
          if (!error) {
            onApply(draft);
            onClose();
          }
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-main-border bg-base-200 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-2xl font-semibold" id={titleId}>
              Plan details
            </h2>
            <p className="mt-1 text-sm text-base-content/70">
              Change the name, planning period, or purpose of this plan.
            </p>
          </div>
          <button
            aria-label="Close plan details"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="p-5 sm:p-6">
          <PlanDetails plan={draft} update={setDraft} />
          {error && (
            <p className="mt-4 text-sm text-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-main-border px-5 py-4 sm:px-6">
          <button className="btn btn-outline" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={Boolean(error)}
            type="submit"
          >
            Save changes
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function PlanDetails({
  plan,
  update,
}: {
  plan: ProjectionPlan;
  update: (plan: ProjectionPlan) => void;
}) {
  return (
    <div className="@container mb-8">
      {plan.serverProjection && (
        <label className="mb-5 flex flex-col gap-2 text-sm font-medium">
          Spending average
          <select
            className="select w-full"
            onChange={(event) =>
              update(withHistoryMonths(plan, Number(event.target.value)))
            }
            value={plan.historyMonths}
          >
            <option value={3}>Previous 3 months</option>
            <option value={6}>Previous 6 months</option>
            <option value={12}>Previous 12 months</option>
          </select>
          <span className="font-normal text-base-content/70">
            Changing the window replaces expenses based on historical spending.
            Monthly and one-time expenses stay as entered.
          </span>
        </label>
      )}
      <div className="mb-5 grid grid-cols-1 gap-5 @xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
          Plan name
          <input
            className="input w-full text-base"
            maxLength={200}
            onChange={(event) => update({ ...plan, name: event.target.value })}
            value={plan.name}
          />
        </label>
        <PlanningPeriodSelect
          months={plan.months}
          onChange={(months) => update({ ...plan, months })}
        />
      </div>
      <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
        <span className="flex flex-wrap items-baseline gap-2">
          What are you exploring?{' '}
          <span className="text-sm font-normal text-base-content/70">
            Optional
          </span>
        </span>
        <input
          className="input w-full text-base"
          maxLength={2000}
          onChange={(event) => update({ ...plan, note: event.target.value })}
          placeholder="For example, supplies for next field season"
          value={plan.note}
        />
      </label>
    </div>
  );
}
