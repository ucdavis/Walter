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
import { formatCurrency } from '@/lib/currency.ts';
import { chartSeriesColor } from '@/shared/chartColors.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import type { OutlookMonth } from '@/lib/projectionOutlook.ts';

const compactCurrency = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 1,
  notation: 'compact',
  style: 'currency',
});

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
  hidden,
  onHideAll,
  onShowAll,
  onToggle,
  series,
}: {
  firstShortfallMonth: string | null;
  focused: boolean;
  forecastWindow: { endMonth: string; startMonth: string };
  hidden: ReadonlySet<string>;
  onHideAll: () => void;
  onShowAll: () => void;
  onToggle: (id: string) => void;
  series: OutlookSeries[];
}) {
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
  return (
    <div className="p-4 sm:p-5">
      {!focused && series.length > 0 && (
        <details className="mb-4 rounded-box border border-base-300 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Chart lines · {visible.length} of{' '}
            {series.filter(({ months }) => months.length > 0).length} shown
          </summary>
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
        </details>
      )}
      {visible.length > 0 ? (
        <div
          aria-label={
            focused
              ? `Monthly remaining balance for ${visible[0].label}`
              : 'Monthly remaining balances'
          }
          className="h-80 min-w-0 sm:h-96"
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
              margin={{ bottom: 5, left: 0, right: 15, top: 25 }}
            >
              <CartesianGrid
                stroke="currentColor"
                strokeDasharray="3 3"
                strokeOpacity={0.12}
              />
              <XAxis
                dataKey="month"
                minTickGap={25}
                tick={{ fontSize: 11 }}
                tickFormatter={fundingMonthLabel}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11 }}
                tickFormatter={(value: number) => compactCurrency.format(value)}
                width={67}
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
                strokeDasharray="4 4"
                y={0}
              />
              {focused && firstShortfallMonth && (
                <ReferenceLine
                  label={{
                    fill: 'var(--color-error)',
                    fontSize: 11,
                    position: 'insideTopLeft',
                    value: `Shortfall · ${fundingMonthLabel(firstShortfallMonth)}`,
                  }}
                  stroke="var(--color-error)"
                  strokeDasharray="3 3"
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
                    fill={chartSeriesColor(entry.colorIndex)}
                    fillOpacity={0.1}
                    isAnimationActive={false}
                    key={entry.id}
                    name={entry.label}
                    stroke={chartSeriesColor(entry.colorIndex)}
                    strokeWidth={2}
                    type="linear"
                  />
                ) : (
                  <Line
                    activeDot={{ onClick: entry.onSelect, r: 5 }}
                    connectNulls={false}
                    cursor="pointer"
                    dataKey={entry.id}
                    dot={entry.months.length === 1}
                    isAnimationActive={false}
                    key={entry.id}
                    name={entry.label}
                    onClick={entry.onSelect}
                    stroke={chartSeriesColor(entry.colorIndex)}
                    strokeWidth={2}
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
      <p className="mt-3 text-center text-xs text-base-content/70">
        Month-end balances · {fundingMonthLabel(forecastWindow.startMonth)} to{' '}
        {fundingMonthLabel(forecastWindow.endMonth)}. Lines begin with each
        source&apos;s first forecast month.
      </p>
    </div>
  );
}
