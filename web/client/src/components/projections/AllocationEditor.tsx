import {
  CalendarDaysIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import {
  allocationRangeMatches,
  getAllocationEditorSeed,
  validateFundingReplacement,
  type AllocationRange,
  type AllocationShare,
} from '@/lib/projectionAllocations.ts';
import { isPlanningDate } from '@/lib/date.ts';
import { sourceLabel } from '@/lib/projectionSources.ts';
import type { PendingAllocationEditor } from '@/lib/projectionWorkspace.ts';
import type {
  ProjectionAppointment,
  ProjectionDraft,
} from '@/queries/projections.ts';
import {
  fundingMonthLabel,
  fundingMonthRange,
  fundingMonths,
} from '@/components/projections/fundingTimelineDates.ts';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';

export interface AllocationEditorHandle {
  read: () => PendingAllocationEditor;
}

type EditorShare = {
  id: string;
  originalPercent: number | null;
  originalText: string;
  percent: string;
  source: string;
};
const percentText = (value: number) =>
  String(Number((value * 100).toPrecision(12)));
const shareInput = (share: AllocationShare): EditorShare => ({
  id: crypto.randomUUID(),
  originalPercent: share.percent,
  originalText: percentText(share.percent),
  percent: percentText(share.percent),
  source:
    share.fundingSourceId === null ? 'outside' : String(share.fundingSourceId),
});

export function AllocationEditor({
  appointment,
  forecastWindow,
  month,
  onApply,
  onClose,
  plan,
  ref,
}: {
  appointment: ProjectionAppointment;
  forecastWindow: { endMonth: string; startMonth: string };
  month: string;
  onApply: (
    range: AllocationRange,
    shares: AllocationShare[]
  ) => { error: string; ok: false } | { ok: true };
  onClose: () => void;
  plan: ProjectionDraft;
  ref?: Ref<AllocationEditorHandle>;
}) {
  const [seed] = useState(() => getAllocationEditorSeed(appointment, month));
  const [applyError, setApplyError] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const selectedMonthRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedMonthRef.current?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
    });
  }, []);
  const returnFocusTo = useCallback(
    () =>
      document.getElementById(`funding-${appointment.id}-${month}`) ??
      document.getElementById(`edit-funding-${appointment.id}`),
    [appointment.id, month]
  );
  const form = useAppForm({
    defaultValues: {
      end: seed.range.endDate ?? fundingMonthRange(month).endDate!,
      mode: 'dates' as 'dates' | 'entire' | 'throughEnd',
      shares: seed.shares.map(shareInput),
      start: seed.range.startDate ?? fundingMonthRange(month).startDate!,
    },
    onSubmit: () => {
      const result = onApply(range, shares);
      if (result.ok) {
        onClose();
      } else {
        setApplyError(result.error);
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const range: AllocationRange = {
    endDate: values.mode === 'dates' ? values.end : null,
    startDate: values.mode === 'entire' ? null : values.start,
  };
  const shares: AllocationShare[] = values.shares.map((share) => ({
    fundingSourceId: share.source === 'outside' ? null : Number(share.source),
    // Preserve imported precision when the displayed percentage is unchanged.
    percent:
      share.originalPercent !== null && share.percent === share.originalText
        ? share.originalPercent
        : Number(share.percent) / 100,
  }));
  const validationMessage = values.shares.some(
    (share) => !share.source || !share.percent.trim()
  )
    ? 'Choose a funding source and enter an appointment percentage for every allocation.'
    : validateFundingReplacement(plan, appointment.id, range, shares);
  const total = shares.reduce((sum, share) => sum + share.percent, 0);
  const months = fundingMonths(forecastWindow);
  if (!months.includes(month)) {
    months.push(month);
    months.sort();
  }
  useImperativeHandle(ref, () => ({
    read: () => ({
      appointmentId: appointment.id,
      hasChanges: form.state.isDirty,
      kind: 'allocation',
      validationMessage,
    }),
  }));
  const effectiveStart = range.startDate ?? appointment.startDate;
  const effectiveEnd = range.endDate ?? appointment.endDate;
  const outsideAppointment =
    Boolean(
      range.startDate &&
        appointment.endDate &&
        range.startDate > appointment.endDate
    ) ||
    Boolean(
      range.endDate &&
        appointment.startDate &&
        range.endDate < appointment.startDate
    );
  const coverageStart =
    [effectiveStart, appointment.startDate]
      .filter((date) => date !== null)
      .sort()
      .at(-1) ?? null;
  const coverageEnd =
    [effectiveEnd, appointment.endDate]
      .filter((date) => date !== null)
      .sort()[0] ?? null;
  const limitedSources = plan.content.fundingSources.filter(
    (source) =>
      shares.some(
        (share) => share.fundingSourceId === source.id && share.percent > 0
      ) &&
      ((source.startDate !== null &&
        (coverageStart === null || source.startDate > coverageStart)) ||
        (source.endDate !== null &&
          (coverageEnd === null || source.endDate < coverageEnd)))
  );
  const partlyOutsideAppointment =
    !outsideAppointment &&
    (Boolean(
      range.startDate &&
        appointment.startDate &&
        range.startDate < appointment.startDate
    ) ||
      Boolean(
        range.endDate &&
          appointment.endDate &&
          range.endDate > appointment.endDate
      ));
  const fullMonths =
    values.mode === 'dates' &&
    range.startDate &&
    range.endDate &&
    isPlanningDate(range.startDate) &&
    isPlanningDate(range.endDate) &&
    range.startDate <= range.endDate &&
    range.startDate ===
      fundingMonthRange(range.startDate.slice(0, 7)).startDate &&
    range.endDate === fundingMonthRange(range.endDate.slice(0, 7)).endDate
      ? (Number(range.endDate.slice(0, 4)) -
          Number(range.startDate.slice(0, 4))) *
          12 +
        Number(range.endDate.slice(5, 7)) -
        Number(range.startDate.slice(5, 7)) +
        1
      : null;
  const replaceLabel =
    values.mode === 'entire'
      ? 'Replace entire appointment'
      : values.mode === 'throughEnd'
        ? 'Replace through appointment end'
        : fullMonths
          ? `Replace ${fullMonths} ${fullMonths === 1 ? 'month' : 'months'}`
          : 'Replace selected dates';
  return (
    <ProjectionDialog
      edgeToEdge
      header={(titleId) => (
        <header className="border-b border-main-border bg-base-200 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2
              className="min-w-0 text-2xl font-semibold break-words"
              id={titleId}
            >
              {appointment.name} funding
            </h2>
            <div className="flex items-center gap-3">
              <span
                aria-live="polite"
                className={`badge badge-soft gap-2 p-3 ${total > 1 ? 'badge-error' : 'badge-primary'}`}
              >
                <CalendarDaysIcon aria-hidden="true" className="size-4" />
                {Number.isFinite(total)
                  ? `${percentText(total)}% allocated`
                  : 'Enter shares'}
              </span>
              <button
                aria-label="Close funding editor"
                className="btn btn-ghost btn-sm btn-square"
                onClick={onClose}
                type="button"
              >
                <XMarkIcon aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-base-content/80">
            Editing {fundingMonthLabel(month)}. Expand the range to replace
            nearby months with this same setup.
          </p>
        </header>
      )}
      initialFocusRef={startRef}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      title={`${appointment.name} funding`}
    >
      <form
        className="min-w-0 max-w-full"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validationMessage) {
            void form.handleSubmit();
          }
        }}
      >
        <div className="grid min-w-0 grid-cols-1 gap-6 p-5 sm:p-6">
          <section aria-label="Apply range" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-3">
                <h3 className="text-base font-semibold">Apply range</h3>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    aria-pressed={values.mode === 'dates'}
                    className={`btn btn-xs ${values.mode === 'dates' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => form.setFieldValue('mode', 'dates')}
                    type="button"
                  >
                    Specific dates
                  </button>
                  <button
                    aria-pressed={values.mode === 'entire'}
                    className={`btn btn-xs ${values.mode === 'entire' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => form.setFieldValue('mode', 'entire')}
                    type="button"
                  >
                    Entire appointment
                  </button>
                  <button
                    aria-pressed={values.mode === 'throughEnd'}
                    className={`btn btn-xs ${values.mode === 'throughEnd' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => form.setFieldValue('mode', 'throughEnd')}
                    type="button"
                  >
                    Through appointment end
                  </button>
                </div>
              </div>
              <div className="grid min-w-0 w-full gap-3 sm:w-auto sm:grid-cols-2">
                <form.Field name="start">
                  {(field) => (
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      Start date
                      <input
                        aria-label="Start date"
                        className="input input-bordered w-full"
                        disabled={values.mode === 'entire'}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        ref={startRef}
                        required={values.mode !== 'entire'}
                        type="date"
                        value={
                          values.mode === 'entire'
                            ? (appointment.startDate ?? '')
                            : field.state.value
                        }
                      />
                      {values.mode === 'entire' && (
                        <span className="text-sm text-base-content/80">
                          {appointment.startDate
                            ? 'Uses appointment start'
                            : 'Appointment has no start limit'}
                        </span>
                      )}
                    </label>
                  )}
                </form.Field>
                <form.Field name="end">
                  {(field) => (
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      End date
                      <input
                        aria-label="End date"
                        className="input input-bordered w-full"
                        disabled={values.mode !== 'dates'}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        required={values.mode === 'dates'}
                        type="date"
                        value={
                          values.mode === 'dates'
                            ? field.state.value
                            : (appointment.endDate ?? '')
                        }
                      />
                      {values.mode !== 'dates' && (
                        <span className="text-sm text-base-content/80">
                          {appointment.endDate
                            ? 'Uses appointment end'
                            : 'Continues until the appointment ends'}
                        </span>
                      )}
                    </label>
                  )}
                </form.Field>
              </div>
            </div>
            <div
              aria-label="Months to replace"
              className="flex min-w-0 w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain rounded-md border border-main-border bg-base-200 p-3"
            >
              {months.map((value) => {
                const bounds = fundingMonthRange(value);
                const active =
                  (!appointment.startDate ||
                    appointment.startDate <= bounds.endDate!) &&
                  (!appointment.endDate ||
                    appointment.endDate >= bounds.startDate!);
                const selected =
                  (!range.startDate || range.startDate <= bounds.endDate!) &&
                  (!range.endDate || range.endDate >= bounds.startDate!);
                const intersection = {
                  endDate:
                    range.endDate && range.endDate < bounds.endDate!
                      ? range.endDate
                      : bounds.endDate,
                  startDate:
                    range.startDate && range.startDate > bounds.startDate!
                      ? range.startDate
                      : bounds.startDate,
                };
                const same =
                  !validationMessage &&
                  allocationRangeMatches(
                    appointment,
                    selected ? intersection : bounds,
                    shares
                  );
                return (
                  <button
                    aria-pressed={selected}
                    className={`min-w-28 shrink-0 rounded-sm border px-3 py-2 text-left text-sm ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-main-border bg-base-100 text-base-content/80'}`}
                    key={value}
                    onClick={() => {
                      form.setFieldValue('mode', 'dates');
                      form.setFieldValue(
                        'start',
                        value < month
                          ? bounds.startDate!
                          : seed.range.startDate!
                      );
                      form.setFieldValue(
                        'end',
                        value > month ? bounds.endDate! : seed.range.endDate!
                      );
                    }}
                    ref={value === month ? selectedMonthRef : undefined}
                    type="button"
                  >
                    <span className="block font-semibold">
                      {fundingMonthLabel(value)}
                    </span>
                    <span className="mt-1 block text-xs">
                      {!active
                        ? 'Not active'
                        : same
                          ? 'Same allocation'
                          : selected
                            ? 'Will change'
                            : 'Different allocation'}
                    </span>
                  </button>
                );
              })}
            </div>
            {partlyOutsideAppointment && (
              <p className="mt-3 text-sm text-base-content/80" role="status">
                Appointment dates: {appointment.startDate ?? 'No start limit'}{' '}
                to {appointment.endDate ?? 'no end limit'}. Funding outside
                these dates stays inactive. Use Edit appointment to extend them.
              </p>
            )}
            {outsideAppointment && (
              <p
                className="mt-3 rounded-lg border border-warning bg-warning/10 p-3 text-sm"
                role="status"
              >
                This period has no active appointment dates. Applying funding
                will keep these months inactive. Use Edit appointment to change
                the appointment dates first.
              </p>
            )}
            {seed.mixed && (
              <p className="mt-2 text-sm text-base-content/80">
                Funding changes within {fundingMonthLabel(month)}. The first
                unchanged portion is selected with its exact dates. Expanding
                the period replaces the other splits too.
              </p>
            )}
          </section>
          <section aria-label="Funding split" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Funding split</h3>
                <p className="mt-1 text-sm text-base-content/80">
                  Shares are percentages of the appointment. This appointment is{' '}
                  {percentText(appointment.fte)}% FTE.
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() =>
                  form.pushFieldValue('shares', {
                    id: crypto.randomUUID(),
                    originalPercent: null,
                    originalText: '',
                    percent: '',
                    source: '',
                  })
                }
                type="button"
              >
                <PlusIcon aria-hidden="true" className="size-4" /> Add
                allocation
              </button>
            </div>
            <form.Field mode="array" name="shares">
              {(field) => (
                <div className="mt-3 space-y-3">
                  {field.state.value.map((share, index) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
                      key={share.id}
                    >
                      <form.Field name={`shares[${index}].source`}>
                        {(source) => (
                          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                            Funding source
                            <select
                              aria-label={`Funding source ${index + 1}`}
                              className="select min-w-0 w-full"
                              onBlur={source.handleBlur}
                              onChange={(event) =>
                                source.handleChange(event.target.value)
                              }
                              value={source.state.value}
                            >
                              <option value="">Choose a source</option>
                              <option value="outside">Outside this plan</option>
                              {plan.content.fundingSources.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {sourceLabel(item)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </form.Field>
                      <form.Field name={`shares[${index}].percent`}>
                        {(percent) => (
                          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                            Share %
                            <input
                              aria-label={`Appointment share ${index + 1} (%)`}
                              className="input min-w-0 w-full"
                              inputMode="decimal"
                              onBlur={percent.handleBlur}
                              onChange={(event) =>
                                percent.handleChange(event.target.value)
                              }
                              value={percent.state.value}
                            />
                            {share.percent.trim() &&
                              Number.isFinite(shares[index].percent) && (
                                <span className="text-xs">
                                  {Number(
                                    (
                                      shares[index].percent *
                                      appointment.fte *
                                      100
                                    ).toFixed(2)
                                  )}
                                  % FTE
                                </span>
                              )}
                          </label>
                        )}
                      </form.Field>
                      <button
                        aria-label={`Remove allocation ${index + 1}`}
                        className="btn btn-ghost btn-square mt-6 text-error"
                        onClick={() => field.removeValue(index)}
                        type="button"
                      >
                        <TrashIcon aria-hidden="true" className="size-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </form.Field>
            {values.shares.length === 0 ? (
              <p className="mt-3 text-sm">
                Applying will leave the selected period unallocated.
              </p>
            ) : (
              Number.isFinite(total) &&
              total !== 1 && (
                <p className="mt-3 text-sm">
                  Total: {percentText(total)}% of appointment ·{' '}
                  {percentText(total * appointment.fte)}% full-time FTE.{' '}
                  {total < 1
                    ? 'Some funding is unallocated.'
                    : total > 1
                      ? 'Funding exceeds 100% of the appointment.'
                      : ''}
                </p>
              )
            )}
            {!outsideAppointment && limitedSources.length > 0 && (
              <div
                className="mt-3 rounded-lg border border-warning bg-warning/10 p-3 text-sm"
                role="status"
              >
                <p>
                  These funding sources do not cover the whole selected period:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {limitedSources.map((source) => (
                    <li key={source.id}>
                      {sourceLabel(source)}:{' '}
                      {source.startDate ?? 'No start limit'} to{' '}
                      {source.endDate ?? 'no end limit'}.
                    </li>
                  ))}
                </ul>
                <p className="mt-2">
                  Allocations outside these dates stay in the plan but provide
                  no funding or costs. Entire appointment does not extend
                  funding source dates. Choose another funding source or edit
                  its dates in Funding sources.
                </p>
              </div>
            )}
          </section>
        </div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-main-border px-5 py-4 sm:px-6">
          {(validationMessage || applyError) && (
            <p
              className="alert alert-error alert-soft w-full text-sm"
              id={errorId}
              role="alert"
            >
              {validationMessage ?? applyError}
            </p>
          )}
          <button className="btn btn-outline" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            aria-describedby={validationMessage ? errorId : undefined}
            className="btn btn-primary"
            disabled={Boolean(validationMessage)}
            type="submit"
          >
            {replaceLabel}
          </button>
        </footer>
      </form>
    </ProjectionDialog>
  );
}
