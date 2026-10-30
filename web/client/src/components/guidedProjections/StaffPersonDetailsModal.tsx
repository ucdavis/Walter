import { useId, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type {
  ProjectionJob,
  ProjectionLookups,
} from '@/queries/projections.ts';
import type { PlanStaff } from '@/components/guidedProjections/planModel.ts';
import { useProjectionDialog } from '@/components/projections/useProjectionDialog.ts';

export default function StaffPersonDetailsModal({
  isServerPlan,
  lookups,
  onApply,
  onClose,
  person,
}: {
  isServerPlan: boolean;
  lookups?: ProjectionLookups;
  onApply: (person: PlanStaff) => void;
  onClose: () => void;
  person: PlanStaff;
}) {
  const ref = useProjectionDialog();
  const titleId = useId();
  const [draft, setDraft] = useState(() => structuredClone(person));
  const error = !draft.name.trim()
    ? 'Enter a name for this person.'
    : draft.serverJob?.startDate &&
        draft.serverJob.endDate &&
        draft.serverJob.startDate > draft.serverJob.endDate
      ? 'Appointment end must be on or after the start date.'
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
              Salary & person details
            </h2>
            <p className="mt-1 text-sm text-base-content/70">{person.name}</p>
          </div>
          <button
            aria-label="Close person details"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>label:first-child]:col-span-full">
            <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
              Name
              <input
                autoFocus
                className="input w-full text-base"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    name: event.target.value,
                  })
                }
                value={draft.name}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
              Annual full-time salary
              <input
                className="input w-full text-base"
                min={0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    annualSalary: nonNegativeNumber(event.target.value),
                    salaryMissing: isServerPlan
                      ? event.target.value === ''
                      : undefined,
                  })
                }
                step="any"
                type="number"
                value={draft.salaryMissing ? '' : draft.annualSalary}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
              {isServerPlan ? 'CBR %' : 'Fringe %'}
              <input
                className="input w-full text-base"
                min={0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    fringeRate: nonNegativeNumber(event.target.value),
                    ...(draft.serverJob && {
                      serverJob: {
                        ...draft.serverJob,
                        cbrRate:
                          event.target.value === ''
                            ? null
                            : nonNegativeNumber(event.target.value) / 100,
                      },
                    }),
                  })
                }
                step="any"
                type="number"
                value={
                  draft.serverJob?.cbrRate === null ? '' : draft.fringeRate
                }
              />
            </label>
            {draft.serverJob && (
              <JobDetails lookups={lookups} person={draft} update={setDraft} />
            )}
          </div>
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

function nonNegativeNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function JobDetails({
  lookups,
  person,
  update,
}: {
  lookups?: ProjectionLookups;
  person: PlanStaff;
  update: (person: PlanStaff) => void;
}) {
  const job = person.serverJob!;
  const patch = (changes: Partial<ProjectionJob>) =>
    update({ ...person, serverJob: { ...job, ...changes } });
  const jobCodeValue = `${job.rateSet}|${job.jobCode ?? ''}`;
  const hasJobCode = lookups?.jobCodes.some(
    (code) => `${code.rateSet}|${code.jobCode}` === jobCodeValue
  );

  return (
    <>
      <label className="col-span-full grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
        Job code and rate set
        <select
          className="select w-full text-base"
          onChange={(event) => {
            const code = lookups?.jobCodes.find(
              (entry) =>
                `${entry.rateSet}|${entry.jobCode}` === event.target.value
            );
            if (code) {
              update({
                ...person,
                fringeRate: (code.cbr ?? 0) * 100,
                serverJob: {
                  ...job,
                  cbrRate: code.cbr,
                  jobCode: code.jobCode,
                  rateSet: code.rateSet,
                  title: code.title,
                  vacationAccrualRate: code.vacationAccrual ?? 0,
                },
              });
            }
          }}
          value={jobCodeValue}
        >
          {!hasJobCode && (
            <option value={jobCodeValue}>
              {job.jobCode
                ? `${job.jobCode} · ${job.rateSet}`
                : 'Choose job code'}
            </option>
          )}
          {lookups?.jobCodes.map((code) => (
            <option
              key={`${code.rateSet}|${code.jobCode}`}
              value={`${code.rateSet}|${code.jobCode}`}
            >
              {code.jobCode} · {code.title ?? 'Untitled job'} · {code.rateSet}
            </option>
          ))}
        </select>
      </label>
      <JobNumber
        label="Appointment FTE"
        max={1}
        onChange={(value) => {
          const fte = value ?? 0;
          update({
            ...person,
            serverJob: { ...job, fte },
            // Keep the funding distribution unchanged when appointment effort changes.
            splits: person.splits.map((split) => ({
              ...split,
              percent:
                job.fte > 0
                  ? (split.percent * fte) / job.fte
                  : (split.serverEntry?.percent ?? 0) * fte * 100,
            })),
          });
        }}
        step={0.01}
        value={job.fte}
      />
      <JobNumber
        label="Vacation accrual %"
        onChange={(value) => patch({ vacationAccrualRate: (value ?? 0) / 100 })}
        value={job.vacationAccrualRate * 100}
      />
      <JobNumber
        label="Annual COLA %"
        onChange={(value) => patch({ colaRate: (value ?? 0) / 100 })}
        value={job.colaRate * 100}
      />
      <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
        COLA month
        <select
          className="select w-full text-base"
          onChange={(event) => patch({ colaMonth: Number(event.target.value) })}
          value={job.colaMonth}
        >
          {[
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ].map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <JobNumber
        label="Monthly fee remission"
        onChange={(value) => patch({ feeRemissionMonthly: value })}
        value={job.feeRemissionMonthly}
      />
      <div className="col-span-full grid grid-cols-2 gap-2.5">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
          Appointment starts
          <input
            className="input w-full text-base"
            max={job.endDate ?? undefined}
            onChange={(event) =>
              patch({ startDate: event.target.value || null })
            }
            type="date"
            value={job.startDate ?? ''}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
          Appointment ends
          <input
            className="input w-full text-base"
            min={job.startDate ?? undefined}
            onChange={(event) => patch({ endDate: event.target.value || null })}
            type="date"
            value={job.endDate ?? ''}
          />
        </label>
      </div>
      <p className="col-span-full text-sm font-normal text-base-content/70">
        Blank appointment dates leave the job open for the planning period. Fee
        remission is the monthly total for the appointment.
      </p>
      {(person.salaryMissing || job.cbrRate === null) && (
        <p className="col-span-full text-sm font-normal text-warning">
          Enter the missing salary or CBR before relying on this projection.
          Missing values currently contribute zero cost.
        </p>
      )}
    </>
  );
}

function JobNumber({
  label,
  max,
  onChange,
  step = 'any',
  value,
}: {
  label: string;
  max?: number;
  onChange: (value: number | null) => void;
  step?: number | 'any';
  value: number | null;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-base-content/70">
      {label}
      <input
        className="input w-full text-base"
        max={max}
        min={0}
        onChange={(event) =>
          onChange(
            event.target.value === ''
              ? null
              : nonNegativeNumber(event.target.value)
          )
        }
        step={step}
        type="number"
        value={value === null ? '' : Number(value.toFixed(6))}
      />
    </label>
  );
}
