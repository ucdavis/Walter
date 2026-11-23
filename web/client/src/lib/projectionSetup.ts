import type {
  ProjectionComparison,
  ProjectionDraft,
  ProjectionRosterEntry,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';

export type SetupAppointmentEdits = ReadonlyMap<
  number,
  ReadonlySet<number> | null
>;

function includedAppointments(
  selected: ReadonlySet<number>,
  roster: ProjectionRosterEntry[],
  edits: SetupAppointmentEdits
) {
  const included = new Set(edits.keys());
  for (const entry of roster) {
    if (entry.fundingSourceIds.some((id) => selected.has(id))) {
      included.add(entry.appointmentId);
    }
  }
  return included;
}

/** Keep the captured roster available while projecting only the selected sources into setup. */
export function selectedSetupSession<T extends ProjectionDraft>(
  catalog: ProjectionSession<T>,
  sourceIds: number[],
  roster: ProjectionRosterEntry[],
  edits: SetupAppointmentEdits,
  forecastMonths = catalog.draft.content.forecastMonths
): ProjectionSession<T> {
  const selected = new Set(sourceIds);
  const included = includedAppointments(selected, roster, edits);
  const content = catalog.draft.content;
  return {
    ...catalog,
    draft: {
      ...catalog.draft,
      content: {
        ...content,
        appointments: content.appointments
          .filter((a) => !a.isSeeded || included.has(a.id))
          .map((a) => ({
            ...a,
            allocations: a.allocations.filter(
              ({ fundingSourceId }) =>
                fundingSourceId === null || selected.has(fundingSourceId)
            ),
          })),
        forecastMonths,
        fundingSources: content.fundingSources.filter(({ id }) =>
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
  edits: SetupAppointmentEdits
) {
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
  const retained = new Map(edits);
  const appointments = catalog.draft.content.appointments.flatMap(
    (appointment) => {
      const previous = previousAppointments.get(appointment.id);
      if (!previous) {
        return [appointment];
      }
      const next = nextAppointments.get(appointment.id);
      if (!next) {
        retained.set(appointment.id, selected);
        return [];
      }
      if (JSON.stringify(previous) === JSON.stringify(next)) {
        return [appointment];
      }
      retained.set(appointment.id, null);
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
    edits: retained,
  };
}

export function selectComparisonScope(
  comparison: ProjectionComparison,
  sourceIds: number[],
  roster: ProjectionRosterEntry[],
  edits: SetupAppointmentEdits
): ProjectionComparison {
  const selected = new Set(sourceIds);
  const included = includedAppointments(selected, roster, edits);
  const capturedSources = new Set(selected);
  const appointments = comparison.appointments
    .filter(({ id }) => included.has(id))
    .map((appointment) => {
      const excludedSources = edits.get(appointment.id);
      const allocations =
        appointment.allocations?.filter(({ fundingSourceId }) => {
          if (fundingSourceId === null || selected.has(fundingSourceId)) {
            return true;
          }
          if (excludedSources?.has(fundingSourceId)) {
            capturedSources.add(fundingSourceId);
            return true;
          }
          return false;
        }) ?? null;
      return { ...appointment, allocations };
    });
  return {
    appointments,
    fundingSources: comparison.fundingSources.filter(({ id }) =>
      capturedSources.has(id)
    ),
  };
}
