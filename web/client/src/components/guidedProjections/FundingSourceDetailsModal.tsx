import { useId, useState } from 'react';
import { TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { PlanFunding } from '@/components/guidedProjections/defaults.ts';
import { useProjectionDialog } from '@/components/projections/useProjectionDialog.ts';

export default function FundingSourceDetailsModal({
  fund,
  isServerPlan,
  onApply,
  onClose,
  onRemove,
}: {
  fund: PlanFunding;
  isServerPlan: boolean;
  onApply: (fund: PlanFunding) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const ref = useProjectionDialog();
  const titleId = useId();
  const [draft, setDraft] = useState(() => structuredClone(fund));
  const error = !draft.name.trim()
    ? 'Enter a funding source name.'
    : !draft.startDate || !draft.endDate || draft.startDate > draft.endDate
      ? 'Choose an end date on or after the start date.'
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
          if (!error) {
            onApply(draft);
            onClose();
          }
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-main-border bg-base-200 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-2xl font-semibold" id={titleId}>
              Funding source details
            </h2>
            <p className="mt-1 text-sm text-base-content/70">{fund.name}</p>
          </div>
          <button
            aria-label="Close funding source details"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-2 font-medium min-w-0 text-sm sm:col-span-2">
              Funding source name
              <input
                autoFocus
                className="input w-full text-base"
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                value={draft.name}
              />
            </label>
            {!isServerPlan && (
              <label className="flex min-w-0 flex-col gap-2 font-medium min-w-0 text-sm sm:col-span-2">
                Description
                <input
                  className="input w-full text-base"
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  value={draft.description ?? ''}
                />
              </label>
            )}
            {!isServerPlan && (
              <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
                Indirect rate %
                <input
                  className="input w-full text-base"
                  min={0}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      indirectRate: Math.max(0, readNumber(event.target.value)),
                    })
                  }
                  step="any"
                  type="number"
                  value={draft.indirectRate}
                />
              </label>
            )}
            <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
              Available balance
              <input
                className="input w-full text-base tabular-nums"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    startingBalance: readNumber(event.target.value),
                  })
                }
                required
                step="any"
                type="number"
                value={draft.startingBalance}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
              Start date
              <input
                className="input w-full text-base"
                max={draft.endDate}
                onChange={(event) => {
                  if (
                    event.target.value &&
                    event.target.value <= draft.endDate
                  ) {
                    setDraft({ ...draft, startDate: event.target.value });
                  }
                }}
                type="date"
                value={draft.startDate}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
              End date
              <input
                className="input w-full text-base"
                min={draft.startDate}
                onChange={(event) => {
                  if (
                    event.target.value &&
                    event.target.value >= draft.startDate
                  ) {
                    setDraft({ ...draft, endDate: event.target.value });
                  }
                }}
                type="date"
                value={draft.endDate}
              />
            </label>
          </div>
          {error && (
            <p className="mt-4 text-sm text-error" role="alert">
              {error}
            </p>
          )}
          <p className="mt-5 text-sm text-base-content/60">
            Removing this source also removes its funding shares and expenses
            from this plan. Affected staffing time becomes open.
          </p>
        </div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-main-border px-5 py-4 sm:px-6">
          <button
            className="btn btn-ghost me-auto text-error"
            onClick={onRemove}
            type="button"
          >
            <TrashIcon aria-hidden="true" className="size-5" /> Remove funding
            source
          </button>
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

function readNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
