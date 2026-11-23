import type {
  CapturedAppointment,
  CapturedFundingSource,
  ProjectionDraft,
  ProjectionRosterEntry,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';

/** Keep the captured roster available while projecting only the selected sources into setup. */
export function selectedSetupSession<T extends ProjectionDraft>(
  catalog: ProjectionSession<T>,
  sourceIds: number[],
  roster: ProjectionRosterEntry[],
  editedAppointmentIds: Set<number>,
  forecastMonths = catalog.draft.content.forecastMonths
): ProjectionSession<T> {
  return {
    ...catalog,
    draft: {
      ...catalog.draft,
      content: {
        ...catalog.draft.content,
        ...selectSetupScope(
          catalog.draft.content,
          sourceIds,
          roster,
          editedAppointmentIds
        ),
        forecastMonths,
      },
    },
  };
}

/** Merge applied edits without discarding unselected sources or reviving explicitly removed appointments. */
export function mergeSetupEdits<T extends ProjectionDraft>(
  catalog: ProjectionSession<T>,
  before: ProjectionSession<T>,
  after: ProjectionSession<T>,
  editedAppointmentIds: Set<number>
): { catalog: ProjectionSession<T>; editedAppointmentIds: Set<number> } {
  const selected = new Set(
    before.draft.content.fundingSources.map(({ id }) => id)
  );
  const previousAppointments = new Map(
    before.draft.content.appointments.map((appointment) => [
      appointment.id,
      appointment,
    ])
  );
  const nextAppointments = new Map(
    after.draft.content.appointments.map((appointment) => [
      appointment.id,
      appointment,
    ])
  );
  const retained = new Set(editedAppointmentIds);
  const appointments = catalog.draft.content.appointments.flatMap(
    (appointment) => {
      const previous = previousAppointments.get(appointment.id);
      if (!previous) {
        return [appointment];
      }
      const next = nextAppointments.get(appointment.id);
      if (!next) {
        retained.add(appointment.id);
        return [];
      }
      if (JSON.stringify(previous) === JSON.stringify(next)) {
        return [appointment];
      }
      retained.add(appointment.id);
      return [
        {
          ...next,
          allocations: [
            ...next.allocations,
            ...appointment.allocations.filter(
              ({ fundingSourceId }) =>
                fundingSourceId !== null && !selected.has(fundingSourceId)
            ),
          ],
        },
      ];
    }
  );
  appointments.push(
    ...after.draft.content.appointments.filter(
      ({ id }) =>
        !catalog.draft.content.appointments.some(
          (appointment) => appointment.id === id
        )
    )
  );
  const sources = new Map(
    after.draft.content.fundingSources.map((source) => [source.id, source])
  );
  return {
    catalog: {
      ...catalog,
      draft: {
        ...after.draft,
        content: {
          ...after.draft.content,
          appointments,
          fundingSources: catalog.draft.content.fundingSources.map(
            (source) => sources.get(source.id) ?? source
          ),
        },
      },
      revision: after.revision,
    },
    editedAppointmentIds: retained,
  };
}

/** Final selection defines scope. Explicit edits and exclusions keep their original appointment even after deselection. */
export function selectSetupScope<
  A extends CapturedAppointment,
  S extends CapturedFundingSource,
>(
  content: { appointments: A[]; fundingSources: S[] },
  sourceIds: number[],
  roster: ProjectionRosterEntry[],
  editedAppointmentIds: Set<number>
) {
  const selected = new Set(sourceIds);
  const included = new Set(editedAppointmentIds);
  for (const entry of roster) {
    if (entry.fundingSourceIds.some((id) => selected.has(id))) {
      included.add(entry.appointmentId);
    }
  }
  return {
    appointments: content.appointments
      .filter((a) => !a.isSeeded || included.has(a.id))
      .map((a) => ({
        ...a,
        allocations: a.allocations.filter(
          (f) => f.fundingSourceId === null || selected.has(f.fundingSourceId)
        ),
      })),
    fundingSources: content.fundingSources.filter((s) => selected.has(s.id)),
  };
}
