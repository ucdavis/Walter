import { useId, type ReactNode } from 'react';
import {
  BalanceYAxisTick,
  buildBalanceAxisTicks,
  VerticalMarkerLabel,
} from '@/components/project/ProjectBurndownChart.tsx';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fundingMonthLabel,
  fundingMonths,
} from '@/components/projections/fundingTimelineDates.ts';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import { projectionSeriesColor as chartSeriesColor } from '@/components/projections/projectionFormatting.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import type { OutlookMonth } from '@/lib/projectionOutlook.ts';

export interface OutlookSeries {
  colorIndex: number;
  contextLabel?: string;
  displayLabel?: string;
  emptyReason: string;
  id: string;
  identityLabel?: string;
  label: string;
  months: OutlookMonth[];
  onSelect: () => void;
}

export function FundingOutlookTooltip({
  active,
  label,
  payload,
  series,
}: {
  active?: boolean;
  label?: number | string;
  payload?: readonly { dataKey?: unknown; value?: unknown }[];
  series: OutlookSeries[];
}) {
  if (!active) {
    return null;
  }
  const rows = (payload ?? []).flatMap(({ dataKey, value }) => {
    const entry = series.find(({ id }) => id === dataKey);
    return entry && typeof value === 'number' && Number.isFinite(value)
      ? [{ entry, value }]
      : [];
  });
  if (rows.length === 0) {
    return null;
  }
  return (
    <div
      aria-label={`${fundingMonthLabel(String(label))} remaining balances`}
      className="w-full overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-base-content shadow-lg"
      onFocus={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
      role="region"
      style={{ maxHeight: 'min(18rem, 60vh)' }}
      tabIndex={0}
    >
      <p className="mb-2 font-semibold">{fundingMonthLabel(String(label))}</p>
      <dl className="space-y-2">
        {rows.map(({ entry, value }) => (
          <div
            className="grid items-start gap-x-3"
            key={entry.id}
            style={{ gridTemplateColumns: 'minmax(0, 1fr) max-content' }}
          >
            <dt
              aria-label={entry.identityLabel ?? entry.label}
              className="flex min-w-0 items-start gap-2"
            >
              <span
                aria-hidden
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: chartSeriesColor(entry.colorIndex) }}
              />
              <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                <span
                  className="line-clamp-2"
                  title={entry.identityLabel ?? entry.label}
                >
                  {entry.displayLabel ?? entry.label}
                </span>
                {entry.contextLabel && (
                  <span className="block text-xs text-base-content/70">
                    {entry.contextLabel}
                  </span>
                )}
              </span>
            </dt>
            <dd className="whitespace-nowrap text-right tabular-nums">
              {formatCurrency(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FundingOutlookChart({
  firstShortfallMonth,
  focused,
  forecastWindow,
  groupControl,
  hidden,
  onHideAll,
  onShowAll,
  onToggle,
  series,
}: {
  firstShortfallMonth: string | null;
  focused: boolean;
  forecastWindow: { endMonth: string; startMonth: string };
  groupControl?: ReactNode;
  hidden: ReadonlySet<string>;
  onHideAll: () => void;
  onShowAll: () => void;
  onToggle: (id: string) => void;
  series: OutlookSeries[];
}) {
  const gradient = useId();
  const visible = series.filter(
    ({ id, months }) => months.length > 0 && !hidden.has(id)
  );
  const data = fundingMonths(forecastWindow).map((month) => ({
    month,
    ...Object.fromEntries(
      series.map((entry) => [
        entry.id,
        entry.months.find((value) => value.month === month)?.remaining ?? null,
      ])
    ),
  }));
  const balances = visible.flatMap((entry) =>
    entry.months.map((month) => month.remaining)
  );
  const low = Math.min(0, ...balances);
  const high = Math.max(0, ...balances);
  const padding = Math.max((high - low) * 0.1, 1000);
  const ticks = buildBalanceAxisTicks(
    low < 0 ? low - padding : 0,
    high > 0 ? high + padding : 0
  );
  const dense = data.length >= 24;
  return (
    <div className="p-5 xl:p-6">
      {visible.length > 0 ? (
        <div
          aria-label={
            focused
              ? `Monthly remaining balance for ${visible[0].label}`
              : 'Monthly remaining balances'
          }
          className="h-72 min-w-0 sm:h-80"
          role="img"
        >
          <ResponsiveContainer
            height="100%"
            initialDimension={{ height: 320, width: 600 }}
            minWidth={0}
            width="100%"
          >
            <ComposedChart
              data={data}
              margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
            >
              <defs>
                <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={chartSeriesColor(visible[0]?.colorIndex ?? 0)}
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="100%"
                    stopColor={chartSeriesColor(visible[0]?.colorIndex ?? 0)}
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--color-main-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                angle={dense ? -35 : 0}
                dataKey="month"
                height={dense ? 56 : undefined}
                interval={dense ? 0 : 'preserveStartEnd'}
                minTickGap={dense ? 0 : undefined}
                tick={{
                  fill: 'currentColor',
                  fontSize: dense ? 10 : 12,
                  textAnchor: dense ? 'end' : 'middle',
                }}
                tickFormatter={(month: string) => {
                  const [name, year] = fundingMonthLabel(month).split(' ');
                  return `${name}-${year.slice(-2)}`;
                }}
                tickMargin={dense ? 10 : undefined}
              />
              <YAxis
                domain={[ticks[0] ?? low, ticks.at(-1) ?? high]}
                tick={<BalanceYAxisTick />}
                ticks={ticks}
              />
              <Tooltip
                content={(props) => (
                  <FundingOutlookTooltip {...props} series={series} />
                )}
                wrapperStyle={{
                  maxWidth: '100%',
                  pointerEvents: 'auto',
                  whiteSpace: 'normal',
                  width: 'min(22rem, calc(100vw - 3rem))',
                  zIndex: 20,
                }}
              />
              <ReferenceLine
                ifOverflow="extendDomain"
                stroke="var(--color-error)"
                strokeDasharray="5 5"
                y={0}
              />
              {focused && firstShortfallMonth && (
                <ReferenceLine
                  label={
                    <VerticalMarkerLabel
                      align="end"
                      labelText={`Shortfall · ${fundingMonthLabel(firstShortfallMonth)}`}
                    />
                  }
                  stroke="var(--color-error)"
                  strokeDasharray="3 5"
                  strokeOpacity={0.7}
                  strokeWidth={1.5}
                  x={firstShortfallMonth}
                />
              )}
              {series.map((entry) =>
                hidden.has(entry.id) ||
                entry.months.length === 0 ? null : focused ? (
                  <Area
                    connectNulls={false}
                    dataKey={entry.id}
                    dot={entry.months.length === 1}
                    fill={`url(#${gradient})`}
                    isAnimationActive={false}
                    key={entry.id}
                    name={entry.label}
                    stroke={chartSeriesColor(entry.colorIndex)}
                    strokeWidth={2.5}
                    type="linear"
                  />
                ) : (
                  <Line
                    activeDot={{ onClick: entry.onSelect, r: 6 }}
                    connectNulls={false}
                    cursor="pointer"
                    dataKey={entry.id}
                    dot={entry.months.length === 1}
                    isAnimationActive={false}
                    key={entry.id}
                    name={entry.label}
                    onClick={entry.onSelect}
                    stroke={chartSeriesColor(entry.colorIndex)}
                    strokeWidth={3}
                    type="linear"
                  />
                )
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-base-content/70">
          {series.some(({ months }) => months.length > 0)
            ? 'All chart lines are hidden. Show a line to explore its balance.'
            : focused
              ? 'This source has no balance data in this forecast period.'
              : 'No funding sources contribute within this forecast period.'}
        </p>
      )}
      <p className="mt-1.5 mb-3.5 text-center text-sm text-base-content/85">
        Month-end balances · {fundingMonthLabel(forecastWindow.startMonth)} to{' '}
        {fundingMonthLabel(forecastWindow.endMonth)}. Lines begin with each
        source&apos;s first forecast month.
      </p>
      {!focused && series.length > 0 && (
        <details className="mb-4 text-sm text-base-content/85">
          <summary className="cursor-pointer text-sm font-medium">
            Chart lines · {visible.length} of{' '}
            {series.filter(({ months }) => months.length > 0).length} shown
          </summary>
          {groupControl && <div className="mt-3">{groupControl}</div>}
          <p className="mt-2 text-xs text-base-content/70">
            Hiding a line leaves totals and funding checks unchanged.
          </p>
          <div className="my-2 flex gap-2">
            <button
              className="btn btn-ghost btn-xs"
              onClick={onShowAll}
              type="button"
            >
              Show all lines
            </button>
            <button
              className="btn btn-ghost btn-xs"
              onClick={onHideAll}
              type="button"
            >
              Hide all lines
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {series.map((entry) => (
              <TooltipLabel
                asChild
                key={entry.id}
                label={
                  <label className="flex min-w-0 items-start gap-2 text-sm">
                    <input
                      aria-label={
                        entry.months.length > 0
                          ? entry.label
                          : `${entry.label}: ${entry.emptyReason}`
                      }
                      checked={!hidden.has(entry.id) && entry.months.length > 0}
                      className="checkbox checkbox-sm mt-0.5"
                      disabled={entry.months.length === 0}
                      onChange={() => onToggle(entry.id)}
                      type="checkbox"
                    />
                    <span
                      aria-hidden
                      className="mt-2 h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: chartSeriesColor(entry.colorIndex),
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">
                        {entry.displayLabel ?? entry.label}
                      </span>
                      {entry.contextLabel && (
                        <span className="block truncate text-xs text-base-content/70">
                          {entry.contextLabel}
                        </span>
                      )}
                      {entry.months.length === 0 && (
                        <span className="block text-xs">
                          {' '}
                          {entry.emptyReason}
                        </span>
                      )}
                    </span>
                  </label>
                }
                tooltip={
                  <span className="block max-w-[calc(100vw-3rem)] whitespace-normal [overflow-wrap:anywhere]">
                    {entry.identityLabel ?? entry.label}
                  </span>
                }
              />
            ))}
          </div>
          {!focused && visible.length > 0 && (
            <nav
              aria-label="Chart legend"
              className="mt-4 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3"
            >
              {visible.map((entry) => (
                <TooltipLabel
                  asChild
                  key={entry.id}
                  label={
                    <button
                      aria-label={entry.label}
                      className="flex w-full min-w-0 items-center gap-2 text-left text-sm hover:underline"
                      onClick={entry.onSelect}
                      type="button"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: chartSeriesColor(entry.colorIndex),
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {entry.displayLabel ?? entry.label}
                        </span>
                        {entry.contextLabel && (
                          <span className="block truncate text-xs text-base-content/70">
                            {entry.contextLabel}
                          </span>
                        )}
                      </span>
                    </button>
                  }
                  tooltip={
                    <span className="block max-w-[calc(100vw-3rem)] whitespace-normal [overflow-wrap:anywhere]">
                      {entry.identityLabel ?? entry.label}
                    </span>
                  }
                />
              ))}
            </nav>
          )}
        </details>
      )}
    </div>
  );
}
