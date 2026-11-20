import { projectionSeriesTextColor } from '@/components/projections/projectionFormatting.ts';
import { useState } from 'react';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { FundingSourceTooltip } from '@/components/projections/FundingSourceTooltip.tsx';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { budgetShortfallLabel } from '@/components/projections/AppointmentBudgetWarnings.tsx';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import {
  getAppointmentFundingShortfalls,
  type SourceFundingBalances,
} from '@/lib/projectionFundingBalances.ts';
import {
  fundingMonthLabel,
  fundingMonths,
} from '@/components/projections/fundingTimelineDates.ts';
import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';
import { sourceLabel } from '@/lib/projectionSources.ts';
import { projectionSeriesColor as chartSeriesColor } from '@/components/projections/projectionFormatting.ts';
import type {
  ProjectionAppointment,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  style: 'percent',
});
export function FundingTimeline({
  appointment,
  forecastWindow,
  months,
  onEdit,
  sourceBalances,
  sources,
}: {
  appointment: ProjectionAppointment;
  forecastWindow: { endMonth: string; startMonth: string };
  months: AppointmentFundingMonth[];
  onEdit: (month: string) => void;
  sourceBalances: SourceFundingBalances;
  sources: ProjectionFundingSource[];
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [hoveredShare, setHoveredShare] = useState<{
    month: string;
    sourceId: number | null;
  } | null>(null);
  return (
    <div
      aria-label={`${appointment.name} monthly funding`}
      className="overflow-x-auto border-t border-main-border p-3.5 pb-4 focus-visible:outline-2 focus-visible:outline-primary"
      role="region"
      tabIndex={0}
    >
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${fundingMonths(forecastWindow).length}, minmax(3.75rem, 1fr))`,
        }}
      >
        {fundingMonths(forecastWindow).map((month) => {
          const funding = months.find(
            (entry) =>
              entry.appointmentId === appointment.id && entry.month === month
          );
          const shortfalls = getAppointmentFundingShortfalls(
            funding ? [funding] : [],
            sourceBalances
          );
          const shortfallSummary = shortfalls
            .map(({ basis, fundingSourceId, personnelDeficits, remaining }) => {
              const source = sources.find(({ id }) => id === fundingSourceId);
              return `${source ? sourceLabel(source) : 'Funding source'}: ${basis === 'categories' ? personnelDeficits.map(({ category, missingBudget, remaining }) => `${category} remaining ${formatCurrency(remaining)}${missingBudget ? `; No ${category} budget recorded` : ''}`).join('; ') : `projected total remaining at the end of ${fundingMonthLabel(month)} is ${formatCurrency(remaining)}`}. Assigned shares and forecast costs continue`;
            })
            .join('. ');
          const shareTooltip = (share: {
            fundingSourceId: number | null;
            percent: number;
          }) => {
            const sourceIndex = sources.findIndex(
              ({ id }) => id === share.fundingSourceId
            );
            return (
              <FundingSourceTooltip
                balance={
                  share.fundingSourceId === null
                    ? undefined
                    : sourceBalances
                        .get(share.fundingSourceId)
                        ?.months.get(month)
                }
                color={
                  share.fundingSourceId === null
                    ? 'var(--color-neutral)'
                    : chartSeriesColor(sourceIndex)
                }
                month={month}
                outside={share.fundingSourceId === null}
                share={share.percent}
                source={sources[sourceIndex]}
              />
            );
          };
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
            <TooltipLabel
              asChild
              key={month}
              label={
                <button
                  aria-haspopup="dialog"
                  aria-label={`${appointment.name}, ${fundingMonthLabel(month)}: ${status}${shortfallSummary ? `. ${budgetShortfallLabel(shortfalls)}. ${shortfallSummary}` : ''}. Edit allocations`}
                  className="group/month min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  id={`funding-${appointment.id}-${month}`}
                  onClick={() => onEdit(month)}
                  onFocus={() => setHoveredShare(null)}
                  onMouseEnter={() => setHoveredShare(null)}
                  type="button"
                >
                  <span className="mb-2 block text-center text-xs font-medium text-base-content/70">
                    {fundingMonthLabel(month)}
                  </span>
                  <span
                    className={`flex h-28 flex-col overflow-hidden rounded-sm border transition-colors group-hover/month:border-primary ${funding ? 'bg-base-200' : 'bg-base-300/40'} ${funding?.hasOverlap ? 'border-error' : 'border-main-border'}`}
                    style={{
                      backgroundImage: funding
                        ? undefined
                        : 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, var(--color-base-content) 5%, transparent) 6px 8px)',
                    }}
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
                            const shortfall = shortfalls.find(
                              ({ fundingSourceId }) =>
                                fundingSourceId === share.fundingSourceId
                            );
                            return (
                              <span
                                className="block shrink-0 overflow-hidden px-1.5 pt-1 text-[11px] leading-tight font-medium"
                                key={share.fundingSourceId ?? 'outside'}
                                onMouseEnter={() =>
                                  setHoveredShare({
                                    month,
                                    sourceId: share.fundingSourceId,
                                  })
                                }
                                style={{
                                  backgroundColor: shortfall
                                    ? 'var(--color-error)'
                                    : share.fundingSourceId === null
                                      ? 'var(--color-neutral)'
                                      : chartSeriesColor(sourceIndex),
                                  backgroundImage: shortfall
                                    ? 'repeating-linear-gradient(135deg, transparent 0 6px, rgb(0 0 0 / 0.18) 6px 12px)'
                                    : undefined,
                                  color: shortfall
                                    ? 'var(--color-error-content)'
                                    : share.fundingSourceId === null
                                      ? 'var(--color-neutral-content)'
                                      : projectionSeriesTextColor(sourceIndex),
                                  height: `${(share.percent / scale) * 100}%`,
                                }}
                              >
                                <span className="flex items-center gap-0.5 font-semibold">
                                  {shortfall && (
                                    <ExclamationTriangleIcon
                                      aria-hidden="true"
                                      className="size-3 shrink-0"
                                    />
                                  )}
                                  {percent.format(share.percent)}
                                </span>
                                <span className="block truncate">{label}</span>
                              </span>
                            );
                          })}
                        {funding.fundedPercent < 1 && (
                          <span className="min-h-0 flex-1 overflow-hidden px-1.5 py-1 text-[11px] leading-tight text-base-content/70">
                            {percent.format(1 - funding.fundedPercent)} open
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="m-auto px-1 text-center text-xs text-base-content/70">
                        Not active
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block h-4 text-center text-[11px] text-error">
                    {funding?.hasGap && funding.hasOverlap
                      ? 'Gap + overlap'
                      : funding?.hasOverlap
                        ? 'Overallocated'
                        : funding?.hasGap
                          ? 'Funding gap'
                          : ''}
                  </span>
                </button>
              }
              onOpenChange={(open) =>
                setOpenMonth((current) =>
                  open ? month : current === month ? null : current
                )
              }
              open={openMonth === month}
              tooltip={
                funding && funding.shares.some(({ percent }) => percent > 0) ? (
                  <div className="space-y-5">
                    {funding.shares
                      .filter(
                        ({ fundingSourceId, percent }) =>
                          percent > 0 &&
                          (hoveredShare?.month !== month ||
                            hoveredShare.sourceId === fundingSourceId)
                      )
                      .map((share) => (
                        <div key={share.fundingSourceId ?? 'outside'}>
                          {shareTooltip(share)}
                        </div>
                      ))}
                  </div>
                ) : undefined
              }
              variant="card"
            />
          );
        })}
      </div>
    </div>
  );
}
