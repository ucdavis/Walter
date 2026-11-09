import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';
import type { ProjectionAppointment } from '@/queries/projections.ts';

export function AppointmentFundingStatus({
  appointment,
  months,
  snapshotMonth,
}: {
  appointment: ProjectionAppointment;
  months: AppointmentFundingMonth[];
  snapshotMonth: string;
}) {
  const unallocated = months.some(
    (month) =>
      month.appointmentId === appointment.id &&
      month.month >= snapshotMonth &&
      month.fundedPercent < 1 - 1e-9
  );
  return (
    <>
      {appointment.allocations.length === 0 ? (
        <p className="mt-2 text-sm">No funding assigned.</p>
      ) : (
        unallocated && (
          <p className="mt-2 text-sm">
            Unallocated funding in one or more forecast months.
          </p>
        )
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
