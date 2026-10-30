import { useEffect, useId, useRef, useState } from 'react';
import {
  CalendarDaysIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  OUTSIDE_FUNDING_ID,
  planMonths,
  type PlanStaff,
  type ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';
import {
  allocationInMonth,
  replaceStaffAllocation,
  type StaffAllocation,
} from '@/components/guidedProjections/staffAllocation.ts';
import {
  isFundingSourceActiveInMonth,
  monthLabel,
} from '@/components/projections/projection.ts';
import { useProjectionDialog } from '@/components/projections/useProjectionDialog.ts';
import { useRevealItem } from '@/shared/hooks/useRevealItem.ts';

export default function StaffAllocationModal({
  month,
  onApply,
  onClose,
  person,
  plan,
}: {
  month: string;
  onApply: (person: PlanStaff) => void;
  onClose: () => void;
  person: PlanStaff;
  plan: ProjectionPlan;
}) {
  const ref = useProjectionDialog();
  const { registerItem, revealItem } = useRevealItem();
  const titleId = useId();
  const descriptionId = useId();
  const selectedMonthRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedMonthRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    });
  }, []);
  const [start, setStart] = useState(month);
  const [end, setEnd] = useState(month);
  const [shares, setShares] = useState(() => allocationInMonth(person, month));
  const months = planMonths(plan);
  const funds = plan.funding.filter((fund) =>
    plan.selectedFunding.includes(fund.id)
  );
  const selected = months.filter((value) => value >= start && value <= end);
  const appointment = (person.serverJob?.fte ?? 1) * 100;
  const total = shares.reduce((sum, share) => sum + share.percent, 0);
  const nextFundingId =
    funds.find((fund) => !shares.some((share) => share.fundingId === fund.id))
      ?.id ??
    (plan.serverProjection &&
    !shares.some((share) => share.fundingId === OUTSIDE_FUNDING_ID)
      ? OUTSIDE_FUNDING_ID
      : undefined);
  const error =
    !start ||
    !end ||
    start > month ||
    end < month ||
    start < months[0] ||
    end > months.at(-1)!
      ? 'Choose a range within the planning period that includes the selected month.'
      : shares.some(
            (share) =>
              !Number.isFinite(share.percent) ||
              share.percent < 0 ||
              share.percent > 100
          )
        ? 'Each share must be between 0% and 100%.'
        : shares.some(
              (share) =>
                !funds.some((fund) => fund.id === share.fundingId) &&
                !(
                  plan.serverProjection &&
                  share.fundingId === OUTSIDE_FUNDING_ID
                )
            )
          ? 'Choose an included funding source for each share.'
          : new Set(shares.map((share) => share.fundingId)).size !==
              shares.length
            ? 'Use each funding source once.'
            : total > appointment + 0.000_01
              ? `Shares total ${formatPercent(total)}. Reduce them to ${formatPercent(appointment)} or less.`
              : null;

  function updateShare(id: string, changes: Partial<StaffAllocation>) {
    setShares((current) =>
      current.map((share) =>
        share.id === id ? { ...share, ...changes } : share
      )
    );
  }

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-auto rounded-lg border border-main-border bg-base-100 p-0 text-base text-base-content shadow-xl backdrop:bg-base-content/30"
      onCancel={onClose}
      ref={ref}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!error) {
            onApply(replaceStaffAllocation(person, shares, start, end));
            onClose();
          }
        }}
      >
        <header className="border-b border-main-border bg-base-200 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-2xl font-semibold" id={titleId}>
              {person.name} allocation
            </h2>
            <div className="flex items-center gap-3">
              <span
                aria-live="polite"
                className={`badge badge-soft gap-2 p-3 ${total > appointment + 0.000_01 ? 'badge-error' : 'badge-primary'}`}
              >
                <CalendarDaysIcon aria-hidden="true" className="size-4" />
                {formatPercent(total)} allocated
              </span>
              <button
                aria-label="Close allocation"
                className="btn btn-ghost btn-sm btn-square"
                onClick={onClose}
                type="button"
              >
                <XMarkIcon aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
          <p
            className="mt-2 text-sm leading-relaxed text-base-content/70"
            id={descriptionId}
          >
            Editing {monthLabel(month)}. Expand the range to replace nearby
            months with this same setup.
          </p>
        </header>
        <div className="grid gap-6 p-5 sm:p-6">
          <section aria-label="Apply range">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <h3 className="text-base font-semibold">Apply range</h3>
              <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Start month
                  <input
                    className="input w-full"
                    max={month}
                    min={months[0]}
                    onChange={(event) => setStart(event.target.value)}
                    required
                    type="month"
                    value={start}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  End month
                  <input
                    className="input w-full"
                    max={months.at(-1)}
                    min={month}
                    onChange={(event) => setEnd(event.target.value)}
                    required
                    type="month"
                    value={end}
                  />
                </label>
              </div>
            </div>
            <div
              aria-label="Months to replace"
              className="flex gap-2 overflow-x-auto rounded-md border border-main-border bg-base-200 p-3"
            >
              {months.map((value) => (
                <button
                  aria-pressed={value >= start && value <= end}
                  className={`min-w-28 shrink-0 rounded-sm border px-3 py-2 text-left text-sm ${value >= start && value <= end ? 'border-primary bg-primary/10 text-primary' : 'border-main-border bg-base-100 text-base-content/70'}`}
                  key={value}
                  onClick={() => {
                    setStart(value < month ? value : month);
                    setEnd(value > month ? value : month);
                  }}
                  ref={value === month ? selectedMonthRef : undefined}
                  type="button"
                >
                  <span className="block font-semibold">
                    {monthLabel(value)}
                  </span>
                  <span className="mt-1 block text-xs">
                    {allocationKey(allocationInMonth(person, value)) ===
                    allocationKey(shares)
                      ? 'Same allocation'
                      : value >= start && value <= end
                        ? 'Will change'
                        : 'Different allocation'}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section aria-label="Funding split">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Funding split</h3>
                <p className="mt-1 text-sm text-base-content/70">
                  Shares are percentages of full-time salary. This appointment
                  is {formatPercent(appointment)}.
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                disabled={!nextFundingId}
                onClick={() => {
                  const id = crypto.randomUUID();
                  setShares((current) => [
                    ...current,
                    {
                      fundingId: nextFundingId!,
                      id,
                      percent: Math.max(0, appointment - total),
                    },
                  ]);
                  revealItem(id, { block: 'nearest' });
                }}
                type="button"
              >
                <PlusIcon aria-hidden="true" className="size-4" /> Add funding
                source
              </button>
            </div>
            <div className="grid gap-3">
              {shares.map((share, index) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
                  key={share.id}
                  ref={(element) => registerItem(share.id, element)}
                >
                  <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                    Project
                    <select
                      aria-label={`${person.name} project ${index + 1}`}
                      className="select w-full"
                      onChange={(event) =>
                        updateShare(share.id, { fundingId: event.target.value })
                      }
                      value={share.fundingId}
                    >
                      {!funds.some((fund) => fund.id === share.fundingId) &&
                        share.fundingId !== OUTSIDE_FUNDING_ID && (
                          <option value={share.fundingId}>
                            Project not included
                          </option>
                        )}
                      {plan.serverProjection && (
                        <option value={OUTSIDE_FUNDING_ID}>
                          Outside portfolio
                        </option>
                      )}
                      {funds.map((fund) => (
                        <option key={fund.id} value={fund.id}>
                          {fund.name}
                          {fund.serverProject?.taskNumber
                            ? ` · Task ${fund.serverProject.taskNumber}`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Share %
                    <input
                      aria-label={`${person.name} share ${index + 1}`}
                      className="input w-full"
                      max={100}
                      min={0}
                      onChange={(event) =>
                        updateShare(share.id, {
                          percent: Number(event.target.value),
                        })
                      }
                      required
                      step="any"
                      type="number"
                      value={share.percent}
                    />
                  </label>
                  <button
                    aria-label={`Remove ${person.name} funding share ${index + 1}`}
                    className="btn btn-ghost btn-square text-error"
                    onClick={() =>
                      setShares((current) =>
                        current.filter((row) => row.id !== share.id)
                      )
                    }
                    type="button"
                  >
                    <TrashIcon aria-hidden="true" className="size-5" />
                  </button>
                </div>
              ))}
              {!shares.length && (
                <p className="rounded-md bg-base-200 p-4 text-sm text-base-content/70">
                  No funding assigned. Add a source, or apply to leave these
                  months open.
                </p>
              )}
            </div>
            {funds
              .filter(
                (fund) =>
                  shares.some(
                    (share) => share.fundingId === fund.id && share.percent > 0
                  ) &&
                  selected.some(
                    (value) => !isFundingSourceActiveInMonth(fund, value)
                  )
              )
              .map((fund) => (
                <p className="mt-3 text-sm text-warning" key={fund.id}>
                  {fund.name} only charges from{' '}
                  {monthLabel(fund.startDate.slice(0, 7))} through{' '}
                  {monthLabel(fund.endDate.slice(0, 7))}. Months outside those
                  dates stay open.
                </p>
              ))}
            {error && (
              <p className="mt-4 text-sm text-error" role="alert">
                {error}
              </p>
            )}
          </section>
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
            Replace {selected.length}{' '}
            {selected.length === 1 ? 'month' : 'months'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

const formatPercent = (value: number) => `${Number(value.toFixed(1))}%`;

function allocationKey(shares: StaffAllocation[]) {
  return JSON.stringify(
    shares
      .filter((share) => share.percent > 0)
      .map((share) => [share.fundingId, share.percent] as const)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}
