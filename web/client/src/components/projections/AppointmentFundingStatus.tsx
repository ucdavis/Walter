import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import {
  fundingWarningLabel,
  getAppointmentFundingWarnings,
} from '@/lib/projectionFundingWarnings.ts';
import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';
import type { ProjectionAppointment } from '@/queries/projections.ts';
import { fundingMonthRange } from '@/components/projections/fundingTimelineDates.ts';

export function AppointmentFundingStatus({
  appointment,
  forecastWindow,
}: {
  appointment: ProjectionAppointment;
  forecastWindow: { endMonth: string; startMonth: string };
}) {
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
      {appointment.hasUnmatchedFunding && (
        <p className="mt-2 text-sm">
          An imported funding task could not be matched; review unallocated
          funding.
        </p>
      )}
    </>
  );
}

export function AppointmentFundingBadges({
  appointmentId,
  months,
}: {
  appointmentId: number;
  months: AppointmentFundingMonth[];
}) {
  const { gaps, overlaps } = getAppointmentFundingWarnings(
    months.filter((month) => month.appointmentId === appointmentId)
  );
  return (
    <>
      {[
        { label: 'Funding gaps', ranges: gaps, tone: 'badge-warning' },
        {
          label: 'Overallocated funding',
          ranges: overlaps,
          tone: 'badge-error',
        },
      ]
        .filter(({ ranges }) => ranges.length > 0)
        .map(({ label, ranges, tone }) => (
          <TooltipLabel
            asChild
            clickToOpen
            key={label}
            label={
              <button
                className={`badge badge-soft gap-1 ${tone}`}
                type="button"
              >
                <ExclamationTriangleIcon
                  aria-hidden="true"
                  className="size-3.5"
                />
                {label}
              </button>
            }
            tooltip={
              <ul className="space-y-1 text-sm">
                {ranges.map((range) => (
                  <li key={range.startMonth}>{fundingWarningLabel(range)}</li>
                ))}
              </ul>
            }
            variant="card"
          />
        ))}
    </>
  );
}
