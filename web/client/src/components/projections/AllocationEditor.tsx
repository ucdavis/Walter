import {
  useCallback,
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
  const unavailable = values.shares.flatMap((share) => {
    const source = plan.content.fundingSources.find(
      ({ id }) => String(id) === share.source
    );
    if (!source) {
      return [];
    }
    const starts = [
      effectiveStart,
      appointment.startDate,
      source.startDate,
    ].filter((date) => date !== null);
    const ends = [effectiveEnd, appointment.endDate, source.endDate].filter(
      (date) => date !== null
    );
    return starts.length &&
      ends.length &&
      starts.sort().at(-1)! > ends.sort()[0]
      ? [sourceLabel(source)]
      : [];
  });
  return (
    <ProjectionDialog
      initialFocusRef={startRef}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      title={`Edit funding for ${appointment.name}`}
      wide
    >
      <p className="mt-2 text-sm">
        Replace appointment funding within the selected period. Allocations
        before and after it stay unchanged.
      </p>
      <form
        className="mt-5 space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validationMessage) {
            void form.handleSubmit();
          }
        }}
      >
        <section aria-label="Replacement period">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Replacement period</h3>
            <div className="flex flex-wrap gap-2">
              <button
                aria-pressed={values.mode === 'dates'}
                className="btn btn-outline btn-sm"
                onClick={() => form.setFieldValue('mode', 'dates')}
                type="button"
              >
                Specific dates
              </button>
              <button
                aria-pressed={values.mode === 'entire'}
                className="btn btn-outline btn-sm"
                onClick={() => form.setFieldValue('mode', 'entire')}
                type="button"
              >
                Entire appointment
              </button>
              <button
                aria-pressed={values.mode === 'throughEnd'}
                className="btn btn-outline btn-sm"
                onClick={() => form.setFieldValue('mode', 'throughEnd')}
                type="button"
              >
                Through appointment end
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <form.Field name="start">
              {(field) => (
                <label className="flex flex-col gap-1">
                  Start date
                  <input
                    aria-label="Start date"
                    className="input input-bordered w-full"
                    disabled={values.mode === 'entire'}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
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
                    <span className="text-sm">
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
                <label className="flex flex-col gap-1">
                  End date
                  <input
                    aria-label="End date"
                    className="input input-bordered w-full"
                    disabled={values.mode !== 'dates'}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    required={values.mode === 'dates'}
                    type="date"
                    value={
                      values.mode === 'dates'
                        ? field.state.value
                        : (appointment.endDate ?? '')
                    }
                  />
                  {values.mode !== 'dates' && (
                    <span className="text-sm">
                      {appointment.endDate
                        ? 'Uses appointment end'
                        : 'Continues until the appointment ends'}
                    </span>
                  )}
                </label>
              )}
            </form.Field>
          </div>
          <p className="mt-2 text-sm">
            {effectiveStart ?? 'No start limit'} to{' '}
            {effectiveEnd ?? 'appointment end, currently open-ended'}. Funding
            source dates still limit coverage and costs.
          </p>
          {seed.mixed && (
            <p className="mt-2 text-sm">
              Funding changes within {fundingMonthLabel(month)}. The first
              unchanged portion is selected with its exact dates. Expanding the
              period replaces the other splits too.
            </p>
          )}
          <div
            aria-label="Months to replace"
            className="mt-3 flex gap-2 overflow-x-auto rounded-box bg-base-200 p-3"
          >
            {months.map((value) => {
              const bounds = fundingMonthRange(value);
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
                  className={`shrink-0 rounded border px-3 py-2 text-left text-sm ${selected ? 'border-primary bg-primary/10' : 'border-base-300'}`}
                  key={value}
                  onClick={() => {
                    form.setFieldValue('mode', 'dates');
                    form.setFieldValue(
                      'start',
                      value < month ? bounds.startDate! : seed.range.startDate!
                    );
                    form.setFieldValue(
                      'end',
                      value > month ? bounds.endDate! : seed.range.endDate!
                    );
                  }}
                  type="button"
                >
                  <span className="block font-medium">
                    {fundingMonthLabel(value)}
                  </span>
                  <span className="block text-xs">
                    {same
                      ? 'Same allocation'
                      : selected
                        ? 'Will change'
                        : 'Different allocation'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section aria-label="Funding split">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Funding split</h3>
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
              Add allocation
            </button>
          </div>
          <p className="mt-2 text-sm">
            Enter percentages of the appointment. Appointment FTE is{' '}
            {percentText(appointment.fte)}%.
          </p>
          <form.Field mode="array" name="shares">
            {(field) => (
              <div className="mt-3 space-y-3">
                {field.state.value.map((share, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]"
                    key={share.id}
                  >
                    <form.Field name={`shares[${index}].source`}>
                      {(source) => (
                        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm sm:col-span-1">
                          Funding source
                          <select
                            aria-label={`Funding source ${index + 1}`}
                            className="select select-bordered w-full min-w-0"
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
                          {share.source === 'outside' ? (
                            <span className="text-xs">
                              Covered outside this plan
                            </span>
                          ) : (
                            (() => {
                              const selectedSource =
                                plan.content.fundingSources.find(
                                  ({ id }) => String(id) === share.source
                                );
                              return selectedSource ? (
                                <span className="text-xs">
                                  {selectedSource.startDate ?? 'No start limit'}{' '}
                                  to {selectedSource.endDate ?? 'no end limit'}
                                </span>
                              ) : null;
                            })()
                          )}
                        </label>
                      )}
                    </form.Field>
                    <form.Field name={`shares[${index}].percent`}>
                      {(percent) => (
                        <label className="flex flex-col gap-1 text-sm">
                          Share %
                          <input
                            aria-label={`Appointment share ${index + 1} (%)`}
                            className="input input-bordered w-full"
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
                      className="btn btn-ghost"
                      onClick={() => field.removeValue(index)}
                      type="button"
                    >
                      Remove
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
            Number.isFinite(total) && (
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
          {unavailable.length > 0 && (
            <p className="mt-2 text-sm">
              No eligible dates for{' '}
              {Array.from(new Set(unavailable)).join(', ')} in this period.
              These allocations will contribute no costs.
            </p>
          )}
        </section>
        {(validationMessage || applyError) && (
          <p className="text-error" id={errorId} role="alert">
            {validationMessage ?? applyError}
          </p>
        )}
        <p className="text-sm">
          Apply updates this plan. Cancel or leave this editor to discard
          unapplied changes.
        </p>
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            aria-describedby={validationMessage ? errorId : undefined}
            className="btn btn-primary"
            disabled={Boolean(validationMessage)}
            type="submit"
          >
            Apply funding
          </button>
        </div>
      </form>
    </ProjectionDialog>
  );
}
