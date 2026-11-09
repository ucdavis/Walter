import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import type {
  PendingSalaryEditor,
  AppointmentSalaryChange,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionAppointment } from '@/queries/projections.ts';
import { getAppointmentSalaryBaseMonth } from '@/lib/piProjection.ts';
import { formatCurrency } from '@/lib/currency.ts';

export interface SalaryEditorHandle {
  read: () => PendingSalaryEditor;
}

export function SalaryEditor({
  appointment,
  onApply,
  onClose,
  ref,
  snapshotMonth,
}: {
  appointment: ProjectionAppointment;
  onApply: (change: AppointmentSalaryChange) => void;
  onClose: () => void;
  ref?: Ref<SalaryEditorHandle>;
  snapshotMonth: string;
}) {
  const initialAnnual =
    appointment.monthlySalary === null
      ? ''
      : (appointment.monthlySalary * 12).toFixed(2);
  const [annual, setAnnual] = useState(initialAnnual);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const amount = Number(annual.trim());
  const validationMessage = !annual.trim()
    ? 'Enter a full-time annual salary. Zero is allowed.'
    : !/^\d+(\.\d{1,2})?$/.test(annual.trim()) ||
        !Number.isFinite(amount) ||
        amount > Number.MAX_SAFE_INTEGER
      ? 'Enter a salary of zero or more, with up to two decimal places.'
      : null;
  const hasChanges = annual !== initialAnnual;
  // An unchanged annual display must not round a captured monthly rate on Apply.
  const monthlySalary =
    amount === Number(initialAnnual) && appointment.monthlySalary !== null
      ? appointment.monthlySalary
      : amount / 12;

  useImperativeHandle(ref, () => ({
    read: () => ({
      appointmentId: appointment.id,
      hasChanges,
      validationMessage,
    }),
  }));

  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.getElementById(
      `salary-appointment-${appointment.id}`
    );
    dialog.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, [appointment.id]);

  return (
    <dialog
      aria-describedby="salary-description"
      aria-labelledby="salary-title"
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <form
        className="modal-box max-w-lg"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (validationMessage) {
            inputRef.current?.focus();
            return;
          }
          onApply({ appointmentId: appointment.id, monthlySalary });
          onClose();
        }}
      >
        <h2 className="text-xl font-bold" id="salary-title">
          Edit salary for {appointment.name}
        </h2>
        <p className="mt-2 text-sm" id="salary-description">
          This is the full-time rate at{' '}
          {getAppointmentSalaryBaseMonth(appointment, snapshotMonth)}.
          Appointment FTE, funding shares, and annual increases determine the
          forecast.
        </p>
        <label className="label mt-6" htmlFor="annual-salary">
          Full-time annual salary
        </label>
        <input
          aria-describedby={
            validationMessage ? 'salary-error' : 'salary-monthly'
          }
          aria-invalid={validationMessage !== null}
          className="input input-bordered w-full"
          id="annual-salary"
          inputMode="decimal"
          onChange={(event) => setAnnual(event.target.value)}
          ref={inputRef}
          type="text"
          value={annual}
        />
        {validationMessage ? (
          <p className="mt-2 text-sm text-error" id="salary-error" role="alert">
            {validationMessage}
          </p>
        ) : (
          <p className="mt-2 text-sm" id="salary-monthly">
            {formatCurrency(monthlySalary)} per month at full time
          </p>
        )}
        <p className="mt-4 text-sm">
          Apply updates this plan. Cancel or leave this editor to discard
          unapplied changes.
        </p>
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={validationMessage !== null}
            type="submit"
          >
            Apply
          </button>
        </div>
      </form>
    </dialog>
  );
}
