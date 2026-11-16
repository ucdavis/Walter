import { formatDate } from '@/lib/date.ts';
import { PlusIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  AppointmentEditor,
  type AppointmentEditorHandle,
} from '@/components/projections/AppointmentEditor.tsx';
import {
  AllocationEditor,
  type AllocationEditorHandle,
} from '@/components/projections/AllocationEditor.tsx';
import { AppointmentBudgetWarnings } from '@/components/projections/AppointmentBudgetWarnings.tsx';
import { FundingTimeline } from '@/components/projections/FundingTimeline.tsx';
import { replaceAppointmentFunding } from '@/lib/projectionAllocations.ts';
import {
  AppointmentFundingBadges,
  AppointmentFundingStatus,
} from '@/components/projections/AppointmentFundingStatus.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import type {
  AppointmentFundingMonth,
  PiProjectionRow,
} from '@/lib/piProjection.ts';
import { buildSourceFundingBalances } from '@/lib/projectionFundingBalances.ts';
import {
  addProjectionAppointment,
  editProjectionAppointment,
  removeProjectionAppointment,
  type AppointmentOperation,
  type AppointmentOperationResult,
} from '@/lib/projectionAppointments.ts';
import type {
  PendingAllocationEditor,
  PendingAppointmentEditor,
  ProjectionSession,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

const shareFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  style: 'percent',
});

export interface StaffingEditorHandle {
  read: () => PendingAppointmentEditor | PendingAllocationEditor | null;
}

export function StaffingEditor<T extends ProjectionDraft>({
  appointmentFunding,
  forecastWindow,
  onOperation,
  onViewSource,
  ref,
  results,
  session,
  target,
}: {
  appointmentFunding: AppointmentFundingMonth[];
  forecastWindow: { endMonth: string; startMonth: string };
  onOperation: (
    operation: AppointmentOperation
  ) => AppointmentOperationResult<T>;
  onViewSource?: (id: number) => void;
  ref?: Ref<StaffingEditorHandle>;
  results: { rows: PiProjectionRow[] };
  session: ProjectionSession<T>;
  target?: {
    fundingMonth: string | null;
    id: number | null;
    onChange: (id: number | null, month?: string) => void;
  };
}) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [funding, setFunding] = useState<{ id: number; month: string } | null>(
    null
  );
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<AppointmentEditorHandle>(null);
  const allocationRef = useRef<AllocationEditorHandle>(null);
  const { draft } = session;
  const sourceBalances = buildSourceFundingBalances(
    draft.content.fundingSources,
    results.rows
  );
  const appointment = draft.content.appointments.find(
    ({ id }) =>
      id === (target ? (target.fundingMonth ? null : target.id) : editing)
  );
  const fundingTarget = target
    ? target.id !== null && target.fundingMonth
      ? { id: target.id, month: target.fundingMonth }
      : null
    : funding;
  const fundingAppointment = draft.content.appointments.find(
    ({ id }) => id === fundingTarget?.id
  );
  const editFunding = (id: number, month: string) =>
    target ? target.onChange(id, month) : setFunding({ id, month });
  const removed = draft.content.appointments.find(({ id }) => id === removing);
  useImperativeHandle(ref, () => ({
    read: () =>
      allocationRef.current?.read() ?? editorRef.current?.read() ?? null,
  }));
  function apply(operation: AppointmentOperation) {
    const result = onOperation(operation);
    setError(result.ok ? null : result.error);
    return result;
  }
  return (
    <div className="@container">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <UserGroupIcon aria-hidden="true" className="size-5 shrink-0" />
            People & project funding
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-base-content/80">
            Split a person&apos;s time across funding sources, or change funding
            over time.
          </p>
        </div>
        <button
          className="btn btn-outline"
          id="add-hypothetical-hire"
          onClick={() => setEditing('new')}
          type="button"
        >
          <PlusIcon aria-hidden="true" className="size-5" />
          Add person
        </button>
      </div>
      <p className="mb-5 rounded-md bg-base-200 px-4 py-3 text-sm leading-relaxed text-base-content/80">
        Each share is a percentage of the appointment. Shares should add up to
        100%. Outside plan shares count toward the appointment but do not charge
        these funding sources.
      </p>
      {draft.content.appointments.length === 0 && (
        <p className="mt-4">No appointments in this plan.</p>
      )}
      <div className="grid gap-4">
        {draft.content.appointments.map((item) => (
          <article
            className="scroll-mt-24 overflow-hidden rounded-lg border border-main-border"
            key={item.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{item.name}</h3>
                  <AppointmentFundingBadges
                    appointmentId={item.id}
                    months={appointmentFunding}
                  />
                  <AppointmentBudgetWarnings
                    months={appointmentFunding.filter(
                      ({ appointmentId }) => appointmentId === item.id
                    )}
                    onViewSource={onViewSource}
                    sourceBalances={sourceBalances}
                    sources={draft.content.fundingSources}
                  />
                </div>
                <p className="mt-1 text-sm text-base-content/80">
                  <span className="mr-6 inline-block">
                    {item.monthlySalary === null
                      ? 'Salary needs input'
                      : `${formatCurrency(item.monthlySalary * 12)} annual salary`}
                  </span>
                  <span className="mr-6 inline-block">
                    {shareFormat.format(item.cbrRate)} CBR
                  </span>
                  <span className="mr-6 inline-block">{item.fte} FTE</span>
                  <span className="inline-block">
                    Appointment end: {formatDate(item.endDate, 'Not set')}
                  </span>
                </p>
              </div>
              <div className="ms-auto flex flex-wrap gap-2">
                <button
                  aria-haspopup="dialog"
                  aria-label={`Edit appointment for ${item.name}`}
                  className="btn btn-outline btn-sm"
                  id={`edit-appointment-${item.id}`}
                  onClick={() =>
                    target ? target.onChange(item.id) : setEditing(item.id)
                  }
                  type="button"
                >
                  Salary &amp; person details
                </button>
              </div>
            </div>
            <div className="px-3.5 empty:hidden [&:has(p)]:pb-3">
              <AppointmentFundingStatus
                appointment={item}
                forecastWindow={forecastWindow}
              />
            </div>
            <FundingTimeline
              appointment={item}
              forecastWindow={forecastWindow}
              months={appointmentFunding}
              onEdit={(month) => editFunding(item.id, month)}
              sourceBalances={sourceBalances}
              sources={draft.content.fundingSources}
            />
          </article>
        ))}
      </div>
      {error && (
        <p className="mt-4 text-error" role="alert">
          {error}
        </p>
      )}
      {((appointment && removing === null) || editing === 'new') && (
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
          onRemove={appointment ? () => setRemoving(appointment.id) : undefined}
          ref={editorRef}
          snapshotMonth={draft.seededAt.slice(0, 7)}
        />
      )}
      {fundingAppointment && fundingTarget && (
        <AllocationEditor
          appointment={fundingAppointment}
          forecastWindow={forecastWindow}
          key={`${fundingAppointment.id}:${fundingTarget.month}`}
          month={fundingTarget.month}
          onApply={(range, shares) =>
            apply((current) =>
              replaceAppointmentFunding(
                current,
                fundingAppointment.id,
                range,
                shares
              )
            )
          }
          onClose={() => (target ? target.onChange(null) : setFunding(null))}
          plan={draft}
          ref={allocationRef}
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
