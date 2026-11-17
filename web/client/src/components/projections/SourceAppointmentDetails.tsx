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

function allocationEditorDate(
  appointment: ProjectionAppointment,
  sourceId: number,
  anchorMonth: string,
  activeMonth: boolean
) {
  const anchor = `${anchorMonth}-01`;
  for (const [, allocation] of sourceAllocations(appointment, sourceId)) {
    if (activeMonth && allocation.percent <= 0) {
      continue;
    }
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
      const selected = anchor < start ? start : anchor > end ? end : anchor;
      if (!activeMonth || selected.startsWith(anchorMonth)) {
        return selected;
      }
    }
  }
  return null;
}

export function SourceAppointmentDetails({
  appointment,
  onNavigate,
  results,
  sourceId,
}: {
  appointment: ProjectionAppointment;
  onNavigate: (location: ProjectionNavigation) => void;
  results: ProjectionResults;
  sourceId: number;
}) {
  const active = results.appointmentFunding.filter(
    (month) =>
      month.appointmentId === appointment.id &&
      month.shares.some(
        (share) => share.fundingSourceId === sourceId && share.percent > 0
      )
  );
  const firstMonth = active[0]?.month;
  const editorDate = allocationEditorDate(
    appointment,
    sourceId,
    firstMonth ?? results.forecastWindow.startMonth,
    Boolean(firstMonth)
  );
  return (
    <section
      aria-label={`${appointment.name} appointment details`}
      className="space-y-4 text-sm"
    >
      <div className="space-y-2">
        {appointment.title && (
          <p className="font-semibold">{appointment.title}</p>
        )}
        {appointment.positionNumber && (
          <p>Position {appointment.positionNumber}</p>
        )}
        <p>
          {percent.format(appointment.fte)} appointment FTE · CBR{' '}
          {percent.format(appointment.cbrRate)} · Leave accrual{' '}
          {percent.format(appointment.vacationAccrualRate)}
        </p>
        <p>
          Appointment {appointment.startDate ?? 'without a start limit'} through{' '}
          {appointment.endDate ?? 'no end date'}
        </p>
      </div>
      <div>
        <h3 className="mb-2 font-semibold">Funding from this source</h3>
        <ul className="space-y-1">
          {sourceAllocations(appointment, sourceId).map(([key, allocation]) => (
            <li key={key}>
              {percent.format(allocation.percent)} of appointment ·{' '}
              {percent.format(allocation.percent * appointment.fte)} full-time
              FTE · {allocation.startDate ?? 'Appointment start'} through{' '}
              {allocation.endDate ?? 'appointment end'}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-base-content/70">
          {firstMonth
            ? `First allocated month in this plan: ${fundingMonthLabel(firstMonth)}.`
            : 'No funded share from this source is active in the forecast period.'}
        </p>
      </div>
      <div className="modal-action flex flex-wrap gap-2">
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
        {editorDate && (
          <button
            aria-label={`Edit allocations for ${appointment.name}`}
            className="btn btn-outline btn-sm"
            onClick={() =>
              onNavigate({
                appointment: appointment.id,
                fundingDate: editorDate,
                fundingMonth: editorDate.slice(0, 7),
                section: 'staffing',
                source: sourceId,
              })
            }
            type="button"
          >
            Edit funding
          </button>
        )}
      </div>
    </section>
  );
}
