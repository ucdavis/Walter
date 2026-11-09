import {
  fundingMonthLabel,
  fundingMonths,
} from '@/components/projections/fundingTimelineDates.ts';
import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';
import { sourceLabel } from '@/lib/projectionSources.ts';
import type {
  ProjectionAppointment,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

const colors = [
  '#2563eb',
  '#047857',
  '#7c3aed',
  '#c2410c',
  '#0e7490',
  '#a21caf',
];
const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  style: 'percent',
});
export function FundingTimeline({
  appointment,
  forecastWindow,
  months,
  onEdit,
  sources,
}: {
  appointment: ProjectionAppointment;
  forecastWindow: { endMonth: string; startMonth: string };
  months: AppointmentFundingMonth[];
  onEdit: (month: string) => void;
  sources: ProjectionFundingSource[];
}) {
  return (
    <div
      aria-label={`${appointment.name} monthly funding`}
      className="mt-4 overflow-x-auto pb-2"
      role="region"
      tabIndex={0}
    >
      <div className="flex gap-2">
        {fundingMonths(forecastWindow).map((month) => {
          const funding = months.find(
            (entry) =>
              entry.appointmentId === appointment.id && entry.month === month
          );
          const scale = Math.max(1, funding?.fundedPercent ?? 0);
          const status = !funding
            ? 'Not active'
            : funding.hasGap && funding.hasOverlap
              ? 'Funding gaps and overallocations'
              : funding.hasGap
                ? 'Funding gaps'
                : funding.hasOverlap
                  ? 'Overallocated funding'
                  : `${percent.format(funding.fundedPercent)} funded`;
          return (
            <button
              aria-haspopup="dialog"
              aria-label={`${appointment.name}, ${fundingMonthLabel(month)}: ${status}. Edit allocations`}
              className="w-24 shrink-0 text-left"
              id={`funding-${appointment.id}-${month}`}
              key={month}
              onClick={() => onEdit(month)}
              type="button"
            >
              <span className="mb-1 block text-center text-xs font-medium">
                {fundingMonthLabel(month)}
              </span>
              <span
                className={`flex h-28 flex-col overflow-hidden rounded border bg-base-200 ${funding?.hasOverlap ? 'border-error' : funding?.hasGap ? 'border-warning' : 'border-base-300'}`}
              >
                {funding ? (
                  <>
                    {funding.shares
                      .filter((share) => share.percent > 0)
                      .map((share) => {
                        const sourceIndex = sources.findIndex(
                          ({ id }) => id === share.fundingSourceId
                        );
                        const source = sources[sourceIndex];
                        const label =
                          share.fundingSourceId === null
                            ? 'Outside this plan'
                            : source
                              ? sourceLabel(source)
                              : 'Unallocated';
                        return (
                          <span
                            className="block shrink-0 overflow-hidden px-1 py-0.5 text-[11px] leading-tight text-white"
                            key={share.fundingSourceId ?? 'outside'}
                            style={{
                              backgroundColor:
                                share.fundingSourceId === null
                                  ? '#475569'
                                  : colors[
                                      Math.max(0, sourceIndex) % colors.length
                                    ],
                              height: `${(share.percent / scale) * 100}%`,
                            }}
                            title={`${label}: ${percent.format(share.percent)} average of appointment`}
                          >
                            <span className="block font-semibold">
                              {percent.format(share.percent)}
                            </span>
                            <span className="block truncate">{label}</span>
                          </span>
                        );
                      })}
                    {funding.fundedPercent < 1 && (
                      <span className="flex-1 overflow-hidden px-1 py-1 text-[11px]">
                        {percent.format(1 - funding.fundedPercent)} open
                      </span>
                    )}
                  </>
                ) : (
                  <span className="m-auto px-1 text-center text-xs text-base-content/60">
                    Not active
                  </span>
                )}
              </span>
              <span className="mt-1 block min-h-4 text-center text-[10px]">
                {funding?.hasGap && funding.hasOverlap
                  ? 'Gap + overlap'
                  : funding?.hasOverlap
                    ? 'Overallocated'
                    : funding?.hasGap
                      ? 'Funding gap'
                      : ''}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-base-content/70">
        Bars show average appointment shares. Select a month to edit its funding
        period.
      </p>
    </div>
  );
}
