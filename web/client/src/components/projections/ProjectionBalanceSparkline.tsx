import { fundingMonths } from '@/components/projections/fundingTimelineDates.ts';
import type { OutlookMonth } from '@/lib/projectionOutlook.ts';
import { chartSeriesColor } from '@/shared/chartColors.ts';

/** A small, noninteractive preview; source shortfalls are reported separately from this combined line. */
export function ProjectionBalanceSparkline({
  months,
  window,
}: {
  months: OutlookMonth[];
  window: { endMonth: string; startMonth: string };
}) {
  if (!months.length) {
    return null;
  }
  const period = fundingMonths(window);
  const balances = new Map(
    months.map((month) => [month.month, month.remaining])
  );
  const min = Math.min(0, ...months.map((month) => month.remaining));
  const max = Math.max(0, ...months.map((month) => month.remaining));
  const span = max - min || 1;
  const x = (index: number) =>
    4 + (index / Math.max(1, period.length - 1)) * 312;
  const y = (value: number) => 60 - ((value - min) / span) * 52;
  const points = period.map((month, index) => {
    const balance = balances.get(month);
    return balance === undefined ? null : { x: x(index), y: y(balance) };
  });
  const visiblePoints = points.filter((point) => point !== null);
  const path = points
    .map((point, index) =>
      point ? `${points[index - 1] ? 'L' : 'M'} ${point.x} ${point.y}` : ''
    )
    .join(' ');

  return (
    <svg
      aria-label="Combined projected balance over the forecast period"
      className="h-20 w-full"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 320 68"
    >
      <line
        stroke="var(--color-base-300)"
        strokeDasharray="4 4"
        x1="4"
        x2="316"
        y1={y(0)}
        y2={y(0)}
      />
      <path
        d={path}
        fill="none"
        stroke={chartSeriesColor(0)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {visiblePoints.length === 1 && (
        <circle
          cx={visiblePoints[0].x}
          cy={visiblePoints[0].y}
          fill={chartSeriesColor(0)}
          r="3"
        />
      )}
    </svg>
  );
}
