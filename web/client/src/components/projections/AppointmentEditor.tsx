import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { getAppointmentSalaryBaseMonth } from '@/lib/piProjection.ts';
import {
  validateAppointmentInputs,
  type AppointmentInputs,
} from '@/lib/projectionAppointments.ts';
import type { PendingAppointmentEditor } from '@/lib/projectionWorkspace.ts';
import {
  projectionLookupsQueryOptions,
  type ProjectionAppointment,
  type ProjectionAppointmentDefaults,
  type ProjectionLookups,
} from '@/queries/projections.ts';

export interface AppointmentEditorHandle {
  read: () => PendingAppointmentEditor;
}

type ApplyResult = { error: string; ok: false } | { ok: true };

export function AppointmentEditor({
  appointment,
  onApply,
  onClose,
  ref,
  snapshotMonth,
}: {
  appointment?: ProjectionAppointment;
  onApply: (inputs: AppointmentInputs) => ApplyResult;
  onClose: () => void;
  ref?: Ref<AppointmentEditorHandle>;
  snapshotMonth: string;
}) {
  const lookups = useQuery(projectionLookupsQueryOptions());
  const formRef = useRef<AppointmentEditorHandle>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const appointmentId = appointment?.id;
  const initialDefaults = appointment ?? lookups.data?.appointmentDefaults;
  const hasInputs = Boolean(initialDefaults);
  useImperativeHandle(ref, () => ({
    read: () =>
      formRef.current?.read() ?? {
        appointmentId: appointment?.id ?? null,
        hasChanges: false,
        kind: 'appointment',
        validationMessage: lookups.isError
          ? 'Appointment defaults could not be loaded.'
          : 'Loading appointment defaults...',
      },
  }));
  useEffect(() => {
    const dialog = dialogRef.current!;
    const openerId =
      appointmentId !== undefined
        ? `edit-appointment-${appointmentId}`
        : 'add-hypothetical-hire';
    dialog.showModal();
    return () => {
      dialog.close();
      document.getElementById(openerId)?.focus();
    };
  }, [appointmentId]);
  useEffect(() => {
    if (hasInputs) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [hasInputs]);
  return (
    <dialog
      aria-labelledby={titleId}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="modal-box max-w-3xl rounded-xl border border-main-border p-6">
        <h2 className="text-xl font-semibold" id={titleId}>
          {appointment
            ? `Edit appointment for ${appointment.name}`
            : 'Add hypothetical hire'}
        </h2>
        {initialDefaults ? (
          <AppointmentForm
            appointment={appointment}
            initialDefaults={initialDefaults}
            inputRef={inputRef}
            lookups={lookups.data}
            onApply={onApply}
            onClose={onClose}
            ref={formRef}
            snapshotMonth={snapshotMonth}
          />
        ) : lookups.isPending ? (
          <p className="mt-4" role="status">
            Loading appointment defaults...
          </p>
        ) : lookups.isError ? (
          <div className="mt-4">
            <p role="alert">Appointment defaults could not be loaded.</p>
            <button
              className="btn btn-outline mt-3"
              onClick={() => void lookups.refetch()}
              type="button"
            >
              Retry defaults
            </button>
          </div>
        ) : null}
        {!initialDefaults && (
          <div className="modal-action border-t border-main-border pt-4">
            <button className="btn btn-ghost" onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}

const percentDisplay = (value: number) =>
  String(Number((value * 100).toPrecision(12)));
const numeric = (value: string) => (value.trim() ? Number(value) : Number.NaN);
const businessUnits: Record<string, string> = {
  DVCMP: 'Campus',
  DVMED: 'UC Davis Health',
  UCANR: 'UC ANR',
};
const months = [
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
];

function AppointmentForm({
  appointment,
  initialDefaults,
  inputRef,
  lookups,
  onApply,
  onClose,
  ref,
  snapshotMonth,
}: {
  appointment?: ProjectionAppointment;
  initialDefaults: ProjectionAppointmentDefaults;
  inputRef: RefObject<HTMLInputElement | null>;
  lookups?: ProjectionLookups;
  onApply: (inputs: AppointmentInputs) => ApplyResult;
  onClose: () => void;
  ref: Ref<AppointmentEditorHandle>;
  snapshotMonth: string;
}) {
  const [original] = useState(appointment);
  const planned = !original || !original.isSeeded;
  const [defaults] = useState(() => original ?? initialDefaults);
  const [applyError, setApplyError] = useState<string | null>(null);
  const initialAnnual =
    original?.monthlySalary == null
      ? ''
      : (original.monthlySalary * 12).toFixed(2);
  const initialFee =
    original?.feeRemissionMonthly == null
      ? ''
      : original.feeRemissionMonthly.toFixed(2);
  const initial = {
    annual: initialAnnual,
    cbr: percentDisplay(defaults.cbrRate),
    cola: percentDisplay(defaults.colaRate),
    colaMonth: String(defaults.colaMonth),
    endDate: original?.endDate ?? '',
    fee: initialFee,
    fte: percentDisplay(defaults.fte),
    jobCode: original?.jobCode ?? '',
    name: original?.name ?? '',
    rateSet: original?.rateSet ?? '',
    startDate: original?.startDate ?? '',
    title: original?.title ?? '',
  };
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
      const result = onApply(inputsFrom(value));
      if (result.ok) {
        onClose();
      } else {
        setApplyError(result.error);
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  function inputsFrom(value: typeof initial): AppointmentInputs {
    // Unchanged displays retain captured precision, including the annual-to-monthly conversion.
    const fraction = (key: 'cbr' | 'cola' | 'fte', original: number) =>
      numeric(value[key]) === Number(initial[key])
        ? original
        : numeric(value[key]) / 100;
    return {
      cbrRate: fraction('cbr', defaults.cbrRate),
      colaMonth: Number(value.colaMonth),
      colaRate: fraction('cola', defaults.colaRate),
      endDate: value.endDate || null,
      feeRemissionMonthly: !value.fee.trim()
        ? null
        : numeric(value.fee) === Number(initialFee) &&
            original?.feeRemissionMonthly != null
          ? original.feeRemissionMonthly
          : numeric(value.fee),
      fte: fraction('fte', defaults.fte),
      jobCode: value.jobCode || null,
      monthlySalary: !value.annual.trim()
        ? null
        : numeric(value.annual) === Number(initialAnnual) &&
            original?.monthlySalary != null
          ? original.monthlySalary
          : numeric(value.annual) / 12,
      name: value.name,
      rateSet: value.rateSet,
      startDate: value.startDate || null,
      title: value.title || null,
    };
  }
  const inputs = inputsFrom(values);
  const salaryError =
    values.annual.trim() &&
    (!/^\d+(\.\d{1,2})?$/.test(values.annual.trim()) ||
      numeric(values.annual) > Number.MAX_SAFE_INTEGER)
      ? 'Enter a salary of zero or more, with up to two decimal places.'
      : null;
  const validationMessage =
    salaryError ?? validateAppointmentInputs(inputs, planned);
  useImperativeHandle(ref, () => ({
    read: () => ({
      appointmentId: appointment?.id ?? null,
      hasChanges: form.state.isDirty,
      kind: 'appointment',
      validationMessage,
    }),
  }));
  const lookup = lookups?.jobCodes.find(
    (candidate) =>
      candidate.jobCode === values.jobCode &&
      candidate.rateSet === values.rateSet
  );
  const lookupRate = lookup?.cbr;
  const jobCodes = [
    ...new Set((lookups?.jobCodes ?? []).map(({ jobCode }) => jobCode)),
  ];
  const rateSets = [
    ...new Set([
      ...Object.keys(businessUnits),
      ...(lookups?.jobCodes ?? []).map(({ rateSet }) => rateSet),
    ]),
  ];
  if (values.jobCode && !jobCodes.includes(values.jobCode)) {
    jobCodes.push(values.jobCode);
  }
  if (values.rateSet && !rateSets.includes(values.rateSet)) {
    rateSets.push(values.rateSet);
  }
  const fields = [
    { label: 'Full-time annual salary', name: 'annual', type: 'text' },
    { label: 'FTE (%)', name: 'fte', type: 'text' },
    { label: 'Start date', name: 'startDate', type: 'date' },
    { label: 'End date', name: 'endDate', type: 'date' },
    { label: 'CBR (%)', name: 'cbr', type: 'text' },
    { label: 'Annual adjustment (%)', name: 'cola', type: 'text' },
    { label: 'Monthly fee remission', name: 'fee', type: 'text' },
  ] as const;
  return (
    <form
      className="mt-4 space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!validationMessage) {
          void form.handleSubmit();
        }
      }}
    >
      {planned ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['name', 'title'] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {name === 'name' ? 'Appointment name' : 'Title'}
                  <input
                    className="input input-bordered w-full"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    ref={name === 'name' ? inputRef : undefined}
                    value={field.state.value}
                  />
                </label>
              )}
            </form.Field>
          ))}
          {(['jobCode', 'rateSet'] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {name === 'jobCode' ? 'Job code' : 'Business unit'}
                  <select
                    className="select select-bordered w-full"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    value={field.state.value}
                  >
                    <option value="">Not selected</option>
                    {(name === 'jobCode' ? jobCodes : rateSets).map((value) => (
                      <option key={value} value={value}>
                        {name === 'rateSet'
                          ? (businessUnits[value] ?? value)
                          : value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </form.Field>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-main-border bg-base-200/50 p-4 text-sm">
          <p className="font-semibold">
            {appointment!.name} · {appointment!.title}
          </p>
          <p>
            Employee ID: {appointment!.employeeId ?? 'Not supplied'} · Position:{' '}
            {appointment!.positionNumber ?? 'Not supplied'}
          </p>
          <p>
            Job code: {appointment!.jobCode ?? 'Not supplied'} · Business unit:{' '}
            {businessUnits[appointment!.rateSet] ?? appointment!.rateSet}
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ label, name, type }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {label}
                <input
                  aria-invalid={
                    name === 'annual'
                      ? Boolean(
                          salaryError ||
                            inputs.monthlySalary === null ||
                            !Number.isFinite(inputs.monthlySalary)
                        )
                      : undefined
                  }
                  className="input input-bordered w-full"
                  inputMode={type === 'text' ? 'decimal' : undefined}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  ref={!planned && name === 'annual' ? inputRef : undefined}
                  type={type}
                  value={field.state.value}
                />
              </label>
            )}
          </form.Field>
        ))}
        <form.Field name="colaMonth">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Adjustment month
              <select
                className="select select-bordered w-full"
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              >
                {months.map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          className="btn btn-outline btn-sm"
          disabled={lookupRate == null || !Number.isFinite(lookupRate)}
          onClick={() => {
            if (lookupRate != null) {
              form.setFieldValue('cbr', percentDisplay(lookupRate));
            }
          }}
          type="button"
        >
          {lookupRate != null && Number.isFinite(lookupRate)
            ? `Use ${percentDisplay(lookupRate)}% CBR`
            : 'CBR rate unavailable'}
        </button>
        <span>
          {lookupRate == null
            ? 'No CBR rate is available for this job code and business unit.'
            : `CBR for job ${values.jobCode} in ${businessUnits[values.rateSet] ?? values.rateSet}. Apply to save this rate in the plan.`}
        </span>
      </div>
      <p className="text-sm text-base-content/80">
        {formatCurrency(inputs.monthlySalary)} per month at full time. Salary
        base:{' '}
        {getAppointmentSalaryBaseMonth(
          { isSeeded: !planned, startDate: inputs.startDate },
          snapshotMonth
        )}
        .
      </p>
      <p className="text-sm text-base-content/80">
        Apply updates this plan. Cancel or leave this editor to discard
        unapplied changes.
      </p>
      {(validationMessage || applyError) && (
        <p className="text-error" role="alert">
          {validationMessage ?? applyError}
        </p>
      )}
      <div className="modal-action border-t border-main-border pt-4">
        <button className="btn btn-ghost" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={Boolean(validationMessage)}
          type="submit"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
