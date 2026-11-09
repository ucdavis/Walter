import type {
  ProjectionAppointment,
  ProjectionDraft,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';
import { validateProjectionAllocations } from '@/lib/projectionAllocations.ts';

const EDITABLE_FIELDS = [
  'name',
  'jobCode',
  'title',
  'rateSet',
  'monthlySalary',
  'fte',
  'cbrRate',
  'colaRate',
  'colaMonth',
  'feeRemissionMonthly',
  'startDate',
  'endDate',
] as const;

export type AppointmentInputs = Pick<
  ProjectionAppointment,
  (typeof EDITABLE_FIELDS)[number]
>;

export type AppointmentOperationResult<
  T extends ProjectionDraft = ProjectionDraft,
> =
  | { error: string; ok: false }
  | { appointmentId?: number; ok: true; session: ProjectionSession<T> };

export type AppointmentOperation = <T extends ProjectionDraft>(
  session: ProjectionSession<T>
) => AppointmentOperationResult<T>;

function validDate(value: string | null) {
  if (value === null) {
    return true;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Incomplete imported inputs may be reviewed, but applied and saved assumptions must be valid. */
export function validateAppointmentInputs(
  inputs: AppointmentInputs,
  requireStartDate: boolean
): string | null {
  if (requireStartDate && !inputs.name.trim()) {
    return 'Enter an appointment name.';
  }
  if (inputs.monthlySalary === null) {
    return 'Enter a full-time annual salary. Zero is allowed.';
  }
  if (
    !Number.isFinite(inputs.monthlySalary) ||
    inputs.monthlySalary < 0 ||
    inputs.monthlySalary > Number.MAX_SAFE_INTEGER / 12
  ) {
    return 'Enter a valid salary of zero or more.';
  }
  if (!Number.isFinite(inputs.fte) || inputs.fte < 0 || inputs.fte > 1) {
    return 'Enter appointment FTE from 0% to 100%.';
  }
  if (!Number.isFinite(inputs.cbrRate) || inputs.cbrRate < 0) {
    return 'Enter a composite benefit rate of zero or more.';
  }
  if (!Number.isFinite(inputs.colaRate) || inputs.colaRate <= -1) {
    return 'Enter an annual adjustment greater than -100%.';
  }
  if (
    !Number.isInteger(inputs.colaMonth) ||
    inputs.colaMonth < 1 ||
    inputs.colaMonth > 12
  ) {
    return 'Choose an annual adjustment month from January through December.';
  }
  if (
    inputs.feeRemissionMonthly !== null &&
    (!Number.isFinite(inputs.feeRemissionMonthly) ||
      inputs.feeRemissionMonthly < 0)
  ) {
    return 'Enter a monthly fee of zero or more, or leave it blank.';
  }
  if (
    !validDate(inputs.startDate) ||
    !validDate(inputs.endDate) ||
    (inputs.startDate && inputs.endDate && inputs.startDate > inputs.endDate) ||
    (requireStartDate && !inputs.startDate)
  ) {
    return requireStartDate
      ? 'Choose a valid start date and an optional end on or after the start.'
      : 'Choose valid dates with the end on or after the start.';
  }
  return null;
}

/** Create and Save require valid assumptions for every retained appointment. */
export function validateProjectionAppointments(
  plan: ProjectionDraft
): string | null {
  for (const appointment of plan.appointments) {
    const error = validateAppointmentInputs(appointment, !appointment.isSeeded);
    if (error) {
      return `${appointment.name || 'Appointment'}: ${error}`;
    }
  }
  return validateProjectionAllocations(plan);
}

function normalizedIdentity(inputs: AppointmentInputs) {
  return {
    jobCode: inputs.jobCode?.trim() || null,
    name: inputs.name.trim(),
    rateSet: inputs.rateSet,
    title: inputs.title?.trim() || null,
  };
}

export function editProjectionAppointment<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  appointmentId: number,
  inputs: AppointmentInputs
): AppointmentOperationResult<T> {
  const appointment = session.draft.appointments.find(
    ({ id }) => id === appointmentId
  );
  if (!appointment) {
    return { error: 'This appointment is no longer in the plan.', ok: false };
  }
  const error = validateAppointmentInputs(inputs, !appointment.isSeeded);
  if (error) {
    return { error, ok: false };
  }
  // Captured identity and allocation schedules survive assumption edits, including FTE and date changes.
  const changes: Partial<AppointmentInputs> = {
    ...(!appointment.isSeeded ? normalizedIdentity(inputs) : {}),
    cbrRate: inputs.cbrRate,
    colaMonth: inputs.colaMonth,
    colaRate: inputs.colaRate,
    endDate: inputs.endDate,
    feeRemissionMonthly: inputs.feeRemissionMonthly,
    fte: inputs.fte,
    monthlySalary: inputs.monthlySalary,
    startDate: inputs.startDate,
  };
  const edited = { ...appointment, ...changes };
  const unchanged = EDITABLE_FIELDS.every(
    (key) => edited[key] === appointment[key]
  );
  if (unchanged) {
    return { ok: true, session };
  }
  return {
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        appointments: session.draft.appointments.map((candidate) =>
          candidate.id === appointmentId ? edited : candidate
        ),
      },
      revision: session.revision + 1,
    },
  };
}

export function addProjectionAppointment<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  inputs: AppointmentInputs
): AppointmentOperationResult<T> {
  const error = validateAppointmentInputs(inputs, true);
  if (error) {
    return { error, ok: false };
  }
  const id = Math.max(0, ...session.draft.appointments.map(({ id }) => id)) + 1;
  const appointment: ProjectionAppointment = {
    ...inputs,
    ...normalizedIdentity(inputs),
    allocations: [],
    employeeId: null,
    hasUnmatchedFunding: false,
    id,
    isSeeded: false,
    positionNumber: null,
    vacationAccrualRate: 0,
  };
  return {
    appointmentId: id,
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        appointments: [...session.draft.appointments, appointment],
      },
      revision: session.revision + 1,
    },
  };
}

/** Removing an appointment removes its allocations; source balances and booked spending stay captured. */
export function removeProjectionAppointment<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  appointmentId: number
): AppointmentOperationResult<T> {
  if (!session.draft.appointments.some(({ id }) => id === appointmentId)) {
    return { error: 'This appointment is no longer in the plan.', ok: false };
  }
  return {
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        appointments: session.draft.appointments.filter(
          ({ id }) => id !== appointmentId
        ),
      },
      revision: session.revision + 1,
    },
  };
}
