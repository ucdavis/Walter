import type {
  ProjectionDraft,
  ProjectionRosterEntry,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';

/** Keep the captured roster available while projecting only the selected sources into setup. */
export function selectedSetupSession<T extends ProjectionDraft>(
  catalog: ProjectionSession<T>,
  sourceIds: number[],
  roster: ProjectionRosterEntry[],
  editedAppointmentIds: Set<number>
): ProjectionSession<T> {
  const selected = new Set(sourceIds);
  const provenance = new Map(
    roster.map((entry) => [entry.appointmentId, entry.fundingSourceIds])
  );
  return {
    ...catalog,
    // Reserve identities from unselected appointments when adding a hypothetical hire.
    baseline: catalog.draft,
    draft: {
      ...catalog.draft,
      content: {
        ...catalog.draft.content,
        appointments: catalog.draft.content.appointments
          .filter(
            (appointment) =>
              !appointment.isSeeded ||
              editedAppointmentIds.has(appointment.id) ||
              provenance.get(appointment.id)?.some((id) => selected.has(id))
          )
          .map((appointment) => ({
            ...appointment,
            allocations: appointment.allocations.filter(
              ({ fundingSourceId }) =>
                fundingSourceId === null || selected.has(fundingSourceId)
            ),
          })),
        fundingSources: catalog.draft.content.fundingSources.filter(({ id }) =>
          selected.has(id)
        ),
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
