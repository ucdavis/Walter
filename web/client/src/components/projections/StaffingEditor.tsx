import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  AppointmentEditor,
  type AppointmentEditorHandle,
} from '@/components/projections/AppointmentEditor.tsx';
import { AppointmentFundingStatus } from '@/components/projections/AppointmentFundingStatus.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';
import {
  addProjectionAppointment,
  editProjectionAppointment,
  removeProjectionAppointment,
  type AppointmentOperation,
  type AppointmentOperationResult,
} from '@/lib/projectionAppointments.ts';
import { sourceLabel } from '@/lib/projectionSources.ts';
import type {
  PendingAppointmentEditor,
  ProjectionSession,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

const shareFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  style: 'percent',
});

export interface StaffingEditorHandle {
  read: () => PendingAppointmentEditor | null;
}

export function StaffingEditor<T extends ProjectionDraft>({
  appointmentFunding,
  onOperation,
  ref,
  session,
  target,
}: {
  appointmentFunding: AppointmentFundingMonth[];
  onOperation: (
    operation: AppointmentOperation
  ) => AppointmentOperationResult<T>;
  ref?: Ref<StaffingEditorHandle>;
  session: ProjectionSession<T>;
  target?: { id: number | null; onChange: (id: number | null) => void };
}) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<AppointmentEditorHandle>(null);
  const { draft } = session;
  const appointment = draft.appointments.find(
    ({ id }) => id === (target ? target.id : editing)
  );
  const removed = draft.appointments.find(({ id }) => id === removing);
  useImperativeHandle(ref, () => ({
    read: () => editorRef.current?.read() ?? null,
  }));
  function apply(operation: AppointmentOperation) {
    const result = onOperation(operation);
    setError(result.ok ? null : result.error);
    return result;
  }
  return (
    <div className="mt-5">
      <p className="text-sm">
        Salary is the full-time rate. Funding shares are percentages of each
        appointment.
      </p>
      <button
        className="btn btn-outline mt-4"
        id="add-hypothetical-hire"
        onClick={() => setEditing('new')}
        type="button"
      >
        Add hypothetical hire
      </button>
      {draft.appointments.length === 0 && (
        <p className="mt-4">No appointments in this plan.</p>
      )}
      <div className="mt-4 space-y-4">
        {draft.appointments.map((item) => (
          <article
            className="rounded-box border border-base-300 p-5"
            key={item.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">{item.name}</h3>
                {!item.isSeeded && <p className="text-sm">Hypothetical hire</p>}
                <p className="text-sm">
                  {item.title ? `${item.title} · ` : ''}
                  {item.fte * 100}% appointment FTE
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-outline"
                  id={`edit-appointment-${item.id}`}
                  onClick={() =>
                    target ? target.onChange(item.id) : setEditing(item.id)
                  }
                  type="button"
                >
                  Edit appointment for {item.name}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setRemoving(item.id)}
                  type="button"
                >
                  Remove appointment for {item.name}
                </button>
              </div>
            </div>
            <p className="mt-4">
              {item.monthlySalary === null
                ? 'Salary needs input'
                : `${formatCurrency(item.monthlySalary * 12)} per year at full time`}
            </p>
            <p className="mt-1 text-sm">
              {formatCurrency(item.monthlySalary)} per month at full time
            </p>
            <AppointmentFundingStatus
              appointment={item}
              months={appointmentFunding}
              snapshotMonth={draft.seededAt.slice(0, 7)}
            />
            <ul className="mt-4 space-y-1 text-sm">
              {item.allocations.map((allocation, index) => {
                const source = draft.fundingSources.find(
                  ({ id }) => id === allocation.fundingSourceId
                );
                return (
                  <li key={index}>
                    {allocation.fundingSourceId === null
                      ? 'Outside this portfolio'
                      : source
                        ? sourceLabel(source)
                        : 'Unallocated funding'}
                    : {shareFormat.format(allocation.percent)} of appointment
                    {' · '}
                    {shareFormat.format(allocation.percent * item.fte)}{' '}
                    full-time FTE
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
      {error && (
        <p className="mt-4 text-error" role="alert">
          {error}
        </p>
      )}
      {(appointment || editing === 'new') && (
        <AppointmentEditor
          appointment={appointment}
          key={appointment?.id ?? 'new'}
          onApply={(inputs) =>
            apply((current) =>
              appointment
                ? editProjectionAppointment(current, appointment.id, inputs)
                : addProjectionAppointment(current, inputs)
            )
          }
          onClose={() =>
            appointment && target ? target.onChange(null) : setEditing(null)
          }
          ref={editorRef}
          snapshotMonth={draft.seededAt.slice(0, 7)}
        />
      )}
      {removed && (
        <ProjectionDialog
          onClose={() => setRemoving(null)}
          title="Remove appointment?"
        >
          <p className="mt-4">
            Remove {removed.name} and its funding allocations? Recorded
            financial actuals remain unchanged.
          </p>
          <div className="modal-action">
            <button
              className="btn btn-ghost"
              onClick={() => setRemoving(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const result = apply((current) =>
                  removeProjectionAppointment(current, removed.id)
                );
                if (result.ok) {
                  setRemoving(null);
                  if (target?.id === removed.id) {
                    target.onChange(null);
                  }
                }
              }}
              type="button"
            >
              Remove
            </button>
          </div>
        </ProjectionDialog>
      )}
    </div>
  );
}
