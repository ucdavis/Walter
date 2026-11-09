import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import type {
  ProjectionNavigation,
  ProjectionResults,
} from '@/lib/projectionWorkspace.ts';
import type {
  ProjectionAppointment,
  ProjectionFundingAllocation,
} from '@/queries/projections.ts';

const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  style: 'percent',
});

function sourceAllocations(
  appointment: ProjectionAppointment,
  sourceId: number
) {
  const ranges = new Map<string, ProjectionFundingAllocation>();
  for (const allocation of appointment.allocations) {
    if (allocation.fundingSourceId !== sourceId) {
      continue;
    }
    const key = `${allocation.startDate ?? ''}/${allocation.endDate ?? ''}`;
    const previous = ranges.get(key);
    ranges.set(key, {
      ...allocation,
      percent: (previous?.percent ?? 0) + allocation.percent,
    });
  }
  return [...ranges.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
}

function allocationEditorMonth(
  appointment: ProjectionAppointment,
  sourceId: number,
  forecastStart: string
) {
  for (const [, allocation] of sourceAllocations(appointment, sourceId)) {
    const start =
      [appointment.startDate, allocation.startDate]
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? '0001-01-01';
    const end =
      [appointment.endDate, allocation.endDate]
        .filter((value): value is string => value !== null)
        .sort()
        .at(0) ?? '9999-12-31';
    if (start <= end) {
      const anchor = `${forecastStart}-01`;
      return (anchor < start ? start : anchor > end ? end : anchor).slice(0, 7);
    }
  }
  return null;
}

export function SourceOutlookAppointments({
  appointments,
  onNavigate,
  results,
  sourceId,
}: {
  appointments: ProjectionAppointment[];
  onNavigate: (location: ProjectionNavigation) => void;
  results: ProjectionResults;
  sourceId: number;
}) {
  const funded = appointments.filter((appointment) =>
    appointment.allocations.some(
      ({ fundingSourceId }) => fundingSourceId === sourceId
    )
  );
  return (
    <section aria-label="Appointments using this source">
      <h4 className="font-semibold">Appointments using this source</h4>
      <p className="mt-2 text-sm">
        Shares are percentages of the appointment. Appointment and source dates
        also bound the costs. Booked spending is reconciled by category, so it
        cannot be assigned to individual appointments here.
      </p>
      {funded.length ? (
        <ul className="mt-3 space-y-3">
          {funded.map((appointment) => {
            const active = results.appointmentFunding.filter(
              (month) =>
                month.appointmentId === appointment.id &&
                month.shares.some(
                  (share) =>
                    share.fundingSourceId === sourceId && share.percent > 0
                )
            );
            const firstMonth = active[0]?.month;
            const editorMonth =
              firstMonth ??
              allocationEditorMonth(
                appointment,
                sourceId,
                results.forecastWindow.startMonth
              );
            return (
              <li
                className="rounded-box border border-base-300 p-4"
                key={appointment.id}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0">
                    <h5 className="break-words font-semibold">
                      {appointment.name}
                    </h5>
                    {appointment.title && (
                      <p className="mt-1 text-sm">{appointment.title}</p>
                    )}
                    <p className="mt-1 text-sm">
                      {percent.format(appointment.fte)} appointment FTE
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <button
                      aria-label={`Edit appointment for ${appointment.name}`}
                      className="btn btn-outline btn-sm"
                      onClick={() =>
                        onNavigate({
                          appointment: appointment.id,
                          section: 'staffing',
                          source: sourceId,
                        })
                      }
                      type="button"
                    >
                      Edit appointment
                    </button>
                    {editorMonth && (
                      <button
                        aria-label={`Edit allocations for ${appointment.name}`}
                        className="btn btn-outline btn-sm"
                        onClick={() =>
                          onNavigate({
                            appointment: appointment.id,
                            fundingMonth: editorMonth,
                            section: 'staffing',
                            source: sourceId,
                          })
                        }
                        type="button"
                      >
                        Edit allocations
                      </button>
                    )}
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {sourceAllocations(appointment, sourceId).map(
                    ([key, allocation]) => (
                      <li key={key}>
                        {percent.format(allocation.percent)} of appointment ·{' '}
                        {percent.format(allocation.percent * appointment.fte)}{' '}
                        full-time FTE ·{' '}
                        {allocation.startDate ?? 'Appointment start'} through{' '}
                        {allocation.endDate ?? 'appointment end'}
                      </li>
                    )
                  )}
                </ul>
                <p className="mt-2 text-sm text-base-content/70">
                  {firstMonth
                    ? `First funded month in this forecast: ${fundingMonthLabel(firstMonth)}.`
                    : 'No funded share from this source is active in the forecast period.'}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm">
          No appointments allocated to this source.
        </p>
      )}
    </section>
  );
}
