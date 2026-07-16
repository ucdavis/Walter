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
  PROJECT_PERSONNEL_COLOR,
  buildProjectCategoryColorMap,
  projectNonPersonnelCategoryColor,
  projectSeriesColor,
} from '@/components/project/projectChartColors.ts';
import {
  ALL_EXPENSES_SERIES,
  buildNonPersonnelCategorySeries,
  buildProjectionSeries,
  getMonthlyCategorySpend,
  getProjectionTransitionMonth,
  getProjectionStats,
  NON_PERSONNEL_SERIES,
  PERSONNEL_SERIES,
  type CategorySpend,
  type ProjectionSeries,
} from '@/lib/projectProjection.ts';
import { useProjectProjectionQuery } from '@/queries/projectProjection.ts';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

const GRID_COLOR = 'var(--color-main-border)';
const ZERO_LINE_COLOR = 'var(--color-error)';
const PROJECTION_TRANSITION_LINE_COLOR = 'var(--color-base-content)';
const AWARD_END_LINE_COLOR = 'var(--color-accent)';
const CHART_TOOLTIP_Z_INDEX = 60;
const Y_AXIS_TICK_COUNT = 6;

type ChartRow = { label: string; month: string } & Record<
  string,
  number | string | null
>;
type VisibleSeries = {
  color: string;
  key: string;
  strokeWidth?: number;
};
type AxisTickProps = {
  payload?: { value?: number | string };
  x?: number;
  y?: number;
};
type ReferenceLineLabelProps = {
  labelText: string;
  viewBox?: {
    x?: number;
    y?: number;
  };
};

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

function categoryDisplayName(expenditureCategory: string) {
  return expenditureCategory.replace(/^\d+\s*-\s*/, '');
}

export function formatBalanceAxisTick(value: number) {
  if (value === 0) {
    return '$0';
  }

  const sign = value < 0 ? '-' : '';
  return `${sign}$${(Math.abs(value) / 1000).toFixed(0)}k`;
}

function getNiceTickStep(rawStep: number) {
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;
  const niceNormalized =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return niceNormalized * magnitude;
}

export function buildBalanceAxisTicks(min: number, max: number) {
  if (min === max) {
    return [min];
  }

  const rawStep = (max - min) / (Y_AXIS_TICK_COUNT - 1);
  const step = getNiceTickStep(rawStep);
  const firstTick = Math.floor(min / step) * step;
  const lastTick = Math.ceil(max / step) * step;
  const ticks: number[] = [];

  for (let tick = firstTick; tick <= lastTick + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }

  if (!ticks.includes(0)) {
    ticks.push(0);
  }

  return ticks.sort((a, b) => a - b);
}

export function BalanceYAxisTick({ payload, x = 0, y = 0 }: AxisTickProps) {
  const value = Number(payload?.value ?? 0);

  return (
    <text
      dy={4}
      fill={value < 0 ? 'var(--color-error)' : 'currentColor'}
      fontSize={12}
      textAnchor="end"
      x={x}
      y={y}
    >
      {formatBalanceAxisTick(value)}
    </text>
  );
}

export function VerticalMarkerLabel({
  labelText,
  viewBox,
}: ReferenceLineLabelProps) {
  const x = Number(viewBox?.x ?? 0);
  const y = Number(viewBox?.y ?? 0) - 6;

  return (
    <text fill="currentColor" fontSize={12} textAnchor="middle" x={x} y={y}>
      {labelText}
    </text>
  );
}

export function getAwardEndMonth(awardEndDate: string | null) {
  if (!awardEndDate) {
    return null;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-\d{2}/.exec(awardEndDate);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}`;
  }

  const parsed = new Date(awardEndDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

function filterCategorySpend(
  categorySpend: CategorySpend[],
  selectedNonPersonnelCategory: string | null,
  selectedKey: string
) {
  if (
    selectedKey === PERSONNEL_SERIES ||
    selectedKey === NON_PERSONNEL_SERIES
  ) {
    return [];
  }

  if (selectedNonPersonnelCategory) {
    return categorySpend.filter(
      ({ expenditureCategory }) =>
        expenditureCategory === selectedNonPersonnelCategory
    );
  }

  return categorySpend;
}

interface BurndownTooltipProps {
  active?: boolean;
  categorySpendByMonth: Map<string, CategorySpend[]>;
  categorySpendColors: Map<string, string>;
  payload?: Array<{ payload?: ChartRow }>;
  selectedKey: string;
  selectedNonPersonnelCategory: string | null;
  visibleSeries: VisibleSeries[];
}

function BurndownTooltip({
  active,
  categorySpendByMonth,
  categorySpendColors,
  payload,
  selectedKey,
  selectedNonPersonnelCategory,
  visibleSeries,
}: BurndownTooltipProps) {
  const row = payload?.find((item) => item.payload)?.payload;

  if (!active || !row) {
    return null;
  }

  const categorySpend = filterCategorySpend(
    categorySpendByMonth.get(String(row.month)) ?? [],
    selectedNonPersonnelCategory,
    selectedKey
  );

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
                className="flex items-center justify-between gap-8"
                key={expenditureCategory}
              >
                <span
                  className="flex min-w-0 items-center gap-2"
                  title={expenditureCategory}
                >
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-sm"
                    style={{
                      backgroundColor:
                        categorySpendColors.get(expenditureCategory) ??
                        PROJECT_PERSONNEL_COLOR,
                    }}
                  />
                  <span className="truncate">{expenditureCategory}</span>
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
  awardEndDate: string | null;
  awardStartDate: string | null;
  projectNumber: string;
}

export function ProjectBurndownSection({
  awardEndDate,
  awardStartDate,
  projectNumber,
}: ProjectBurndownSectionProps) {
  const projectionQuery = useProjectProjectionQuery(projectNumber);
  const result = projectionQuery.data;
  const series = useMemo(
    () => (result ? buildProjectionSeries(result) : []),
    [result]
  );
  const nonPersonnelCategorySeries = useMemo(
    () => (result ? buildNonPersonnelCategorySeries(result) : []),
    [result]
  );
  const categoryColors = useMemo(
    () => (result ? buildProjectCategoryColorMap(result.categories) : new Map()),
    [result]
  );
  const chartSeries = useMemo(
    () => [...series, ...nonPersonnelCategorySeries],
    [nonPersonnelCategorySeries, series]
  );
  const chartRows = useMemo(() => buildChartRows(chartSeries), [chartSeries]);
  const labelsByMonth = useMemo(
    () => new Map(chartRows.map((row) => [row.month, row.label])),
    [chartRows]
  );
  const projectionTransitionMonth = useMemo(
    () => (result ? getProjectionTransitionMonth(result) : null),
    [result]
  );
  const showProjectionTransitionLine =
    projectionTransitionMonth !== null &&
    labelsByMonth.has(projectionTransitionMonth);
  const awardEndMonth = useMemo(
    () => getAwardEndMonth(awardEndDate),
    [awardEndDate]
  );
  const showAwardEndLine =
    awardEndMonth !== null && labelsByMonth.has(awardEndMonth);
  const stats = useMemo(
    () => (result ? getProjectionStats(result, awardEndDate) : null),
    [awardEndDate, result]
  );
  const categorySpendByMonth = useMemo(
    () => (result ? getMonthlyCategorySpend(result) : new Map()),
    [result]
  );
  const [selectedKey, setSelectedKey] = useState(ALL_EXPENSES_SERIES);
  const [selectedNonPersonnelCategory, setSelectedNonPersonnelCategory] =
    useState<string | null>(null);
  const activeSelectedNonPersonnelCategory =
    selectedNonPersonnelCategory &&
    nonPersonnelCategorySeries.some(
      (entry) => entry.key === selectedNonPersonnelCategory
    )
      ? selectedNonPersonnelCategory
      : null;
  const nonPersonnelCategoryColor = (
    expenditureCategory: string,
    fallbackIndex: number
  ) =>
    categoryColors.get(expenditureCategory) ??
    projectNonPersonnelCategoryColor(fallbackIndex);

  if (projectionQuery.isSuccess && series.length === 0) {
    return null;
  }

  const selectedRollupSeries: VisibleSeries[] = series
    .map((entry, index) => ({
      color: projectSeriesColor(index),
      key: entry.key,
    }))
    .filter(({ key }) => key === selectedKey);
  const visibleSeries: VisibleSeries[] =
    selectedKey === NON_PERSONNEL_SERIES
      ? activeSelectedNonPersonnelCategory
        ? nonPersonnelCategorySeries
            .map((entry, index) => ({
              color: nonPersonnelCategoryColor(entry.key, index),
              key: entry.key,
            }))
            .filter(({ key }) => key === activeSelectedNonPersonnelCategory)
        : [
            ...selectedRollupSeries,
            ...nonPersonnelCategorySeries.map((entry, index) => ({
              color: nonPersonnelCategoryColor(entry.key, index),
              key: entry.key,
              strokeWidth: 1.75,
            })),
          ]
      : selectedRollupSeries;

  const visibleBalances = chartSeries
    .filter(({ key }) => visibleSeries.some((entry) => entry.key === key))
    .flatMap(({ points }) => points.map((point) => point.remaining));
  const minBalance = Math.min(0, ...visibleBalances);
  const maxBalance = Math.max(0, ...visibleBalances);
  const padding = Math.max((maxBalance - minBalance) * 0.1, 1000);
  const yDomainMin = minBalance < 0 ? minBalance - padding : 0;
  const yDomainMax = maxBalance > 0 ? maxBalance + padding : 0;
  const yAxisTicks = buildBalanceAxisTicks(yDomainMin, yDomainMax);
  const chartTitle =
    selectedKey === NON_PERSONNEL_SERIES && activeSelectedNonPersonnelCategory
      ? `${NON_PERSONNEL_SERIES}: ${categoryDisplayName(activeSelectedNonPersonnelCategory)}`
      : selectedKey;

  return (
    <>
      <section className="mt-8 pb-4">
        <p className="max-w-3xl mb-6">{tooltipDefinitions.projectBurndown}</p>

        {projectionQuery.isPending && (
          <p className="text-base-content/70 mt-4">
            Loading project burndown...
          </p>
        )}

        {projectionQuery.isError && (
          <p className="text-error mt-4">Error loading project burndown.</p>
        )}

        {projectionQuery.isSuccess && series.length > 0 && (
          <div>
            {stats && (
              <div className="mb-6 flex gap-10 text-sm md:grid-cols-3">
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

            <h3 className="font-proxima-bold mb-2 text-base">{chartTitle}</h3>

            <div className="h-80" data-testid="project-burndown-chart">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart
                  data={chartRows}
                  margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
                >
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'currentColor', fontSize: 12 }}
                    tickFormatter={(value: string) =>
                      labelsByMonth.get(value) ?? value
                    }
                  />
                  <YAxis
                    domain={[
                      yAxisTicks[0] ?? yDomainMin,
                      yAxisTicks.at(-1) ?? yDomainMax,
                    ]}
                    tick={<BalanceYAxisTick />}
                    ticks={yAxisTicks}
                  />
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    stroke={ZERO_LINE_COLOR}
                    strokeDasharray="5 5"
                    y={0}
                  />
                  {showProjectionTransitionLine && (
                    <ReferenceLine
                      label={<VerticalMarkerLabel labelText="Today" />}
                      stroke={PROJECTION_TRANSITION_LINE_COLOR}
                      strokeDasharray="3 5"
                      strokeOpacity={0.28}
                      strokeWidth={1.5}
                      x={projectionTransitionMonth}
                    />
                  )}
                  {showAwardEndLine && (
                    <ReferenceLine
                      label={<VerticalMarkerLabel labelText="Project End" />}
                      stroke={AWARD_END_LINE_COLOR}
                      strokeDasharray="8 4"
                      strokeOpacity={0.42}
                      strokeWidth={1.5}
                      x={awardEndMonth}
                    />
                  )}
                  <Tooltip
                    content={
                      <BurndownTooltip
                        categorySpendByMonth={categorySpendByMonth}
                        categorySpendColors={categoryColors}
                        selectedKey={selectedKey}
                        selectedNonPersonnelCategory={
                          activeSelectedNonPersonnelCategory
                        }
                        visibleSeries={visibleSeries}
                      />
                    }
                    wrapperStyle={{ zIndex: CHART_TOOLTIP_Z_INDEX }}
                  />
                  {visibleSeries.map(({ color, key, strokeWidth }) => (
                    <Line
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                      dataKey={`${key}::solid`}
                      dot={{ fill: color, r: 3 }}
                      isAnimationActive={false}
                      key={`${key}::solid`}
                      name={key}
                      stroke={color}
                      strokeWidth={strokeWidth ?? 2.5}
                      type="monotone"
                    />
                  ))}
                  {visibleSeries.map(({ color, key, strokeWidth }) => (
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
                      strokeWidth={strokeWidth ?? 2.5}
                      type="monotone"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="tabs tabs-box mt-4 inline-flex" role="tablist">
              {series.map((entry, index) => {
                const isSelected = entry.key === selectedKey;
                return (
                  <button
                    aria-selected={isSelected}
                    className={`tab ${isSelected ? 'tab-active' : ''}`}
                    key={entry.key}
                    onClick={() => {
                      setSelectedKey(entry.key);
                      if (entry.key !== NON_PERSONNEL_SERIES) {
                        setSelectedNonPersonnelCategory(null);
                      }
                    }}
                    role="tab"
                    type="button"
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-sm mr-2"
                      style={{ backgroundColor: projectSeriesColor(index) }}
                    />
                    {entry.key}
                  </button>
                );
              })}
            </div>

            {nonPersonnelCategorySeries.length > 0 && (
              <div className="mt-2 min-h-12">
                {selectedKey === NON_PERSONNEL_SERIES && (
                  <div
                    aria-label="Non-personnel subcategories"
                    className="tabs tabs-box flex w-fit flex-wrap"
                    role="tablist"
                  >
                    {nonPersonnelCategorySeries.map((entry, index) => {
                      const isSelected =
                        activeSelectedNonPersonnelCategory === entry.key;
                      return (
                        <button
                          aria-selected={isSelected}
                          className={`tab ${isSelected ? 'tab-active' : ''}`}
                          key={entry.key}
                          onClick={() =>
                            setSelectedNonPersonnelCategory(
                              isSelected ? null : entry.key
                            )
                          }
                          role="tab"
                          type="button"
                        >
                          <span
                            className="inline-block h-3 w-3 rounded-sm mr-2"
                            style={{
                              backgroundColor:
                                nonPersonnelCategoryColor(entry.key, index),
                            }}
                          />
                          {entry.key}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

    </>
  );
}
