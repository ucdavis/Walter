import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  ALL_EXPENSES_SERIES,
  buildProjectionSeries,
  getMonthlyCategorySpend,
  getProjectionStats,
  type CategorySpend,
  type ProjectionSeries,
} from '@/lib/projectProjection.ts';
import { useProjectProjectionQuery } from '@/queries/projectProjection.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

const SERIES_COLORS = [
  'var(--color-primary)',
  '#f97316',
  '#3b82f6',
  '#14b8a6',
  '#8b5cf6',
  '#ef4444',
  '#84cc16',
  '#0ea5e9',
  '#eab308',
];
const GRID_COLOR = 'var(--color-main-border)';
const ZERO_LINE_COLOR = 'var(--color-error)';

type ChartRow = { label: string; month: string } & Record<
  string,
  number | string | null
>;

// Each series renders as two lines sharing a color: a solid one over the
// actual + blended months and a dashed one over blended + projected. Both
// include the blended (current) month so the segments connect there.
function buildChartRows(series: ProjectionSeries[]): ChartRow[] {
  const rows = new Map<string, ChartRow>();

  for (const { key, points } of series) {
    for (const point of points) {
      const row =
        rows.get(point.month) ??
        ({ label: point.displayPeriod, month: point.month } as ChartRow);
      row[`${key}::solid`] =
        point.kind === 'projected' ? null : point.remaining;
      row[`${key}::dashed`] = point.kind === 'actual' ? null : point.remaining;
      row[`${key}::spend`] = point.actualAmount + point.projectedAmount;
      rows.set(point.month, row);
    }
  }

  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function seriesColor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

interface BurndownTooltipProps {
  active?: boolean;
  categorySpendByMonth: Map<string, CategorySpend[]>;
  payload?: Array<{ payload?: ChartRow }>;
  visibleSeries: Array<{ color: string; key: string }>;
}

function BurndownTooltip({
  active,
  categorySpendByMonth,
  payload,
  visibleSeries,
}: BurndownTooltipProps) {
  const row = payload?.find((item) => item.payload)?.payload;

  if (!active || !row) {
    return null;
  }

  const categorySpend = categorySpendByMonth.get(String(row.month)) ?? [];

  return (
    <div className="rounded-md border border-main-border bg-base-100 p-4 text-sm shadow-lg">
      <p className="font-proxima-bold text-base mb-2">{row.label}</p>
      <dl className="space-y-2">
        {visibleSeries.map(({ color, key }) => {
          const remaining = (row[`${key}::dashed`] ?? row[`${key}::solid`]) as
            | number
            | null
            | undefined;
          const spend = row[`${key}::spend`] as number | null | undefined;

          if (remaining === null || remaining === undefined) {
            return null;
          }

          return (
            <div key={key}>
              <dt className="font-proxima-bold flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {key}
              </dt>
              <dd className="ml-5">
                Remaining {formatCurrency(remaining)}
                {spend !== null && spend !== undefined && (
                  <span className="text-base-content/60">
                    {' '}
                    &middot; Spend {formatCurrency(spend)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {categorySpend.length > 0 && (
        <div className="mt-3 border-t border-main-border pt-3">
          <p className="font-proxima-bold mb-2">Expenses by Category</p>
          <div className="space-y-1">
            {categorySpend.map(({ expenditureCategory, spend }) => (
              <div
                className="flex justify-between gap-8"
                key={expenditureCategory}
              >
                <span className="truncate" title={expenditureCategory}>
                  {expenditureCategory}
                </span>
                <span className="font-medium">{formatCurrency(spend)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProjectBurndownSectionProps {
  projectNumber: string;
}

export function ProjectBurndownSection({
  projectNumber,
}: ProjectBurndownSectionProps) {
  const projectionQuery = useProjectProjectionQuery(projectNumber);
  const result = projectionQuery.data;
  const series = useMemo(
    () => (result ? buildProjectionSeries(result) : []),
    [result]
  );
  const chartRows = useMemo(() => buildChartRows(series), [series]);
  const stats = useMemo(
    () => (result ? getProjectionStats(result) : null),
    [result]
  );
  const categorySpendByMonth = useMemo(
    () => (result ? getMonthlyCategorySpend(result) : new Map()),
    [result]
  );
  const [selectedKey, setSelectedKey] = useState(ALL_EXPENSES_SERIES);

  if (projectionQuery.isSuccess && series.length === 0) {
    return null;
  }

  const visibleSeries = series
    .map((entry, index) => ({ color: seriesColor(index), key: entry.key }))
    .filter(({ key }) => key === selectedKey);

  const visibleBalances = series
    .filter(({ key }) => key === selectedKey)
    .flatMap(({ points }) => points.map((point) => point.remaining));
  const minBalance = Math.min(0, ...visibleBalances);
  const maxBalance = Math.max(0, ...visibleBalances);
  const padding = Math.max((maxBalance - minBalance) * 0.1, 1000);

  return (
    <section className="section-margin">
      <h2 className="h2">
        <TooltipLabel
          label="Project Burndown"
          tooltip={tooltipDefinitions.projectBurndown}
        />
      </h2>

      {projectionQuery.isPending && (
        <p className="text-base-content/70 mt-4">
          Loading project burndown...
        </p>
      )}

      {projectionQuery.isError && (
        <p className="text-error mt-4">Error loading project burndown.</p>
      )}

      {projectionQuery.isSuccess && series.length > 0 && (
        <div className="fancy-data">
          <div className="h-80" data-testid="project-burndown-chart">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart
                data={chartRows}
                margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
              >
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                />
                <YAxis
                  domain={[minBalance - padding, maxBalance + padding]}
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    `$${(value / 1000).toFixed(0)}k`
                  }
                />
                <ReferenceLine
                  ifOverflow="extendDomain"
                  stroke={ZERO_LINE_COLOR}
                  strokeDasharray="5 5"
                  y={0}
                />
                <Tooltip
                  content={
                    <BurndownTooltip
                      categorySpendByMonth={categorySpendByMonth}
                      visibleSeries={visibleSeries}
                    />
                  }
                />
                {visibleSeries.map(({ color, key }) => (
                  <Line
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    dataKey={`${key}::solid`}
                    dot={{ fill: color, r: 3 }}
                    isAnimationActive={false}
                    key={`${key}::solid`}
                    name={key}
                    stroke={color}
                    strokeWidth={2.5}
                    type="monotone"
                  />
                ))}
                {visibleSeries.map(({ color, key }) => (
                  <Line
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    dataKey={`${key}::dashed`}
                    dot={{ fill: color, r: 3 }}
                    isAnimationActive={false}
                    key={`${key}::dashed`}
                    legendType="none"
                    name={key}
                    stroke={color}
                    strokeDasharray="6 4"
                    strokeWidth={2.5}
                    type="monotone"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {series.map((entry, index) => {
              const isSelected = entry.key === selectedKey;
              return (
                <button
                  aria-pressed={isSelected}
                  className={`btn btn-xs ${isSelected ? 'btn-outline' : 'btn-ghost'}`}
                  key={entry.key}
                  onClick={() => setSelectedKey(entry.key)}
                  type="button"
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: seriesColor(index) }}
                  />
                  {entry.key}
                </button>
              );
            })}
          </div>

          {stats && (
            <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
              <div>
                <p className="stat-label">Current Balance</p>
                <p className="stat-value">
                  {formatCurrency(stats.currentBalance)}
                </p>
              </div>
              <div>
                <p className="stat-label">Projected End</p>
                <p
                  className={
                    stats.projectedEnd < 0
                      ? 'stat-value text-error'
                      : 'stat-value'
                  }
                >
                  {formatCurrency(stats.projectedEnd)}
                </p>
              </div>
              <div>
                <p className="stat-label">Projection</p>
                <p className="stat-value">{stats.projectedMonths} months</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
