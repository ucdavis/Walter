import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';
import type { ProjectionAppointment } from '@/queries/projections.ts';
import {
  fundingMonthLabel,
  fundingMonthRange,
} from '@/components/projections/fundingTimelineDates.ts';

export function AppointmentFundingStatus({
  appointment,
  forecastWindow,
  months,
}: {
  appointment: ProjectionAppointment;
  forecastWindow: { endMonth: string; startMonth: string };
  months: AppointmentFundingMonth[];
}) {
  const active = months.filter(
    (month) => month.appointmentId === appointment.id
  );
  const gaps = active.filter(({ hasGap }) => hasGap);
  const overlaps = active.filter(({ hasOverlap }) => hasOverlap);
  const future = Boolean(
    appointment.startDate &&
      appointment.startDate.slice(0, 7) > forecastWindow.endMonth
  );
  return (
    <>
      {appointment.allocations.length === 0 && (
        <p className="mt-2 text-sm">No funding assigned.</p>
      )}
      {future && (
        <p className="mt-2 text-sm">
          Appointment starts after the forecast period, which ends{' '}
          {fundingMonthRange(forecastWindow.endMonth).endDate}.
        </p>
      )}
      {(gaps.length > 0 || overlaps.length > 0) && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">
            {gaps.length && overlaps.length
              ? 'Funding gaps and overallocated funding'
              : gaps.length
                ? 'Funding gaps'
                : 'Overallocated funding'}
          </summary>
          <p className="mt-1">
            Checked through {fundingMonthRange(forecastWindow.endMonth).endDate}
            . Gaps and overlaps do not prevent saving.
          </p>
          {gaps.length > 0 && (
            <p>
              Unallocated funding:{' '}
              {gaps.map(({ month }) => fundingMonthLabel(month)).join(', ')}.
            </p>
          )}
          {overlaps.length > 0 && (
            <p>
              Overallocated funding:{' '}
              {overlaps.map(({ month }) => fundingMonthLabel(month)).join(', ')}
              .
            </p>
          )}
        </details>
      )}
      {appointment.hasUnmatchedFunding && (
        <p className="mt-2 text-sm">
          An imported funding task could not be matched; review unallocated
          funding.
        </p>
      )}
    </>
  );
}
