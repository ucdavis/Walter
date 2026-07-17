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
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '@/lib/currency.ts';
import {
  projectExpenditureCategoryColor,
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
const VERTICAL_MARKER_LINE_COLOR = 'var(--color-base-content)';
const ERROR_MARKER_OPACITY = 0.7;
const NEUTRAL_MARKER_OPACITY = 0.28;
const CHART_TOOLTIP_Z_INDEX = 60;
const Y_AXIS_TICK_COUNT = 6;
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const TIMELINE_OPTIONS = [
  { label: 'Project End', value: 'project-end' },
  { label: '12 months', value: '12-months' },
  { label: '18 months', value: '18-months' },
  { label: '24 months', value: '24-months' },
] as const;

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
  align?: 'center' | 'end';
  labelText: string;
  viewBox?: {
    x?: number;
    y?: number;
  };
};
export type TimelineOption = (typeof TIMELINE_OPTIONS)[number]['value'];

function isValidMonth(month: number) {
  return month >= 1 && month <= 12;
}

function isValidCalendarDate(year: number, month: number, day: number) {
  if (!isValidMonth(month) || day < 1) {
    return false;
  }

  return day <= new Date(year, month, 0).getDate();
}

function parseMonthIndex(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const parsedMonth = Number(match?.[2]);

  if (!match || !isValidMonth(parsedMonth)) {
    return null;
  }

  return Number(match[1]) * 12 + parsedMonth - 1;
}

function monthFromIndex(index: number) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;

  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatMonthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const parsedMonth = Number(match?.[2]);

  if (!match || !isValidMonth(parsedMonth)) {
    return month;
  }

  return `${MONTH_LABELS[parsedMonth - 1]}-${match[1].slice(-2)}`;
}

export function getAwardMonth(awardDate: string | null) {
  if (!awardDate) {
    return null;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(awardDate);
  const year = Number(dateOnlyMatch?.[1]);
  const month = Number(dateOnlyMatch?.[2]);
  const day = Number(dateOnlyMatch?.[3]);

  if (dateOnlyMatch) {
    return isValidCalendarDate(year, month, day)
      ? `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}`
      : null;
  }

  const parsed = new Date(awardDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

// Each series renders as two lines sharing a color: a solid one over the
// actual + blended months and a dashed one over blended + projected. Both
// include the blended (current) month so the segments connect there.
export function buildChartRows(
  series: ProjectionSeries[],
  startMonth: string | null = null,
  endMonth: string | null = null
): ChartRow[] {
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

  const months = [...rows.keys()].sort();
  const firstMonth = startMonth ?? months[0];
  const lastMonth = endMonth ?? months.at(-1);
  const firstMonthIndex = firstMonth ? parseMonthIndex(firstMonth) : null;
  const lastMonthIndex = lastMonth ? parseMonthIndex(lastMonth) : null;

  if (
    firstMonthIndex !== null &&
    lastMonthIndex !== null &&
    firstMonthIndex <= lastMonthIndex
  ) {
    for (let index = firstMonthIndex; index <= lastMonthIndex; index += 1) {
      const month = monthFromIndex(index);
      rows.set(
        month,
        rows.get(month) ??
          ({ label: formatMonthLabel(month), month } as ChartRow)
      );
    }
  }

  const sortedRows = [...rows.values()].sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  if (
    firstMonthIndex === null ||
    lastMonthIndex === null ||
    firstMonthIndex > lastMonthIndex
  ) {
    return sortedRows;
  }

  return sortedRows.filter((row) => {
    const monthIndex = parseMonthIndex(row.month);
    return (
      monthIndex !== null &&
      monthIndex >= firstMonthIndex &&
      monthIndex <= lastMonthIndex
    );
  });
}

export function getRollingStartMonth(referenceMonth: string | null) {
  if (!referenceMonth) {
    return null;
  }

  const referenceMonthIndex = parseMonthIndex(referenceMonth);

  return referenceMonthIndex === null
    ? null
    : monthFromIndex(referenceMonthIndex - 3);
}

function getTimelineMonthCount(timeline: TimelineOption) {
  switch (timeline) {
    case '12-months':
      return 12;
    case '18-months':
      return 18;
    case '24-months':
      return 24;
    default:
      return null;
  }
}

export function getTimelineEndMonth(
  timeline: TimelineOption,
  projectEndMonth: string | null,
  referenceMonth: string | null
) {
  const timelineMonthCount = getTimelineMonthCount(timeline);

  if (timelineMonthCount === null) {
    return projectEndMonth;
  }

  const referenceMonthIndex = referenceMonth
    ? parseMonthIndex(referenceMonth)
    : null;

  return referenceMonthIndex === null
    ? null
    : monthFromIndex(referenceMonthIndex + timelineMonthCount);
}

export function getTimelineProjectionDate(
  timeline: TimelineOption,
  awardEndDate: string | null,
  referenceMonth: string | null
) {
  if (timeline === 'project-end') {
    return awardEndDate;
  }

  const timelineEndMonth = getTimelineEndMonth(timeline, null, referenceMonth);

  return timelineEndMonth ? `${timelineEndMonth}-01` : null;
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

export function getBalanceStatClassName(value: number) {
  return value < 0 ? 'stat-value text-error' : 'stat-value';
}

export function getVerticalMarkerStroke(value: number) {
  return value < 0 ? ZERO_LINE_COLOR : VERTICAL_MARKER_LINE_COLOR;
}

export function getVerticalMarkerStrokeOpacity(value: number) {
  return value < 0 ? ERROR_MARKER_OPACITY : NEUTRAL_MARKER_OPACITY;
}

export function VerticalMarkerLabel({
  align = 'center',
  labelText,
  viewBox,
}: ReferenceLineLabelProps) {
  const x = Number(viewBox?.x ?? 0) + (align === 'end' ? -4 : 0);
  const y = Number(viewBox?.y ?? 0) - 6;

  return (
    <text
      fill="currentColor"
      fontSize={12}
      textAnchor={align === 'end' ? 'end' : 'middle'}
      x={x}
      y={y}
    >
      {labelText}
    </text>
  );
}

export function getAwardEndMonth(awardEndDate: string | null) {
  return getAwardMonth(awardEndDate);
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
  payload?: Array<{ payload?: ChartRow }>;
  selectedKey: string;
  selectedNonPersonnelCategory: string | null;
  visibleSeries: VisibleSeries[];
}

function BurndownTooltip({
  active,
  categorySpendByMonth,
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
                        projectExpenditureCategoryColor(expenditureCategory),
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
  const chartSeries = useMemo(
    () => [...series, ...nonPersonnelCategorySeries],
    [nonPersonnelCategorySeries, series]
  );
  const [selectedTimeline, setSelectedTimeline] =
    useState<TimelineOption>('project-end');
  const [isTimelineMenuOpen, setIsTimelineMenuOpen] = useState(false);
  const awardEndMonth = useMemo(
    () => getAwardEndMonth(awardEndDate),
    [awardEndDate]
  );
  const projectionTransitionMonth = useMemo(
    () => (result ? getProjectionTransitionMonth(result) : null),
    [result]
  );
  const rollingStartMonth = useMemo(
    () => getRollingStartMonth(projectionTransitionMonth),
    [projectionTransitionMonth]
  );
  const timelineEndMonth = useMemo(
    () =>
      getTimelineEndMonth(
        selectedTimeline,
        awardEndMonth,
        projectionTransitionMonth
      ),
    [awardEndMonth, projectionTransitionMonth, selectedTimeline]
  );
  const timelineProjectionDate = useMemo(
    () =>
      getTimelineProjectionDate(
        selectedTimeline,
        awardEndDate,
        projectionTransitionMonth
      ),
    [awardEndDate, projectionTransitionMonth, selectedTimeline]
  );
  const chartRows = useMemo(
    () => buildChartRows(chartSeries, rollingStartMonth, timelineEndMonth),
    [chartSeries, rollingStartMonth, timelineEndMonth]
  );
  const labelsByMonth = useMemo(
    () => new Map(chartRows.map((row) => [row.month, row.label])),
    [chartRows]
  );
  const showProjectionTransitionLine =
    projectionTransitionMonth !== null &&
    labelsByMonth.has(projectionTransitionMonth);
  const showAwardEndLine =
    awardEndMonth !== null && labelsByMonth.has(awardEndMonth);
  const stats = useMemo(
    () => (result ? getProjectionStats(result, timelineProjectionDate) : null),
    [result, timelineProjectionDate]
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

  if (projectionQuery.isSuccess && series.length === 0) {
    return null;
  }

  const selectedRollupSeries: VisibleSeries[] = series
    .map((entry) => ({
      color: projectSeriesColor(entry.key),
      key: entry.key,
    }))
    .filter(({ key }) => key === selectedKey);
  const visibleSeries: VisibleSeries[] =
    selectedKey === NON_PERSONNEL_SERIES
      ? activeSelectedNonPersonnelCategory
        ? nonPersonnelCategorySeries
            .map((entry) => ({
              color: projectExpenditureCategoryColor(entry.key),
              key: entry.key,
            }))
            .filter(({ key }) => key === activeSelectedNonPersonnelCategory)
        : [
            ...selectedRollupSeries,
            ...nonPersonnelCategorySeries.map((entry) => ({
              color: projectExpenditureCategoryColor(entry.key),
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
  const currentBalanceForMarker = stats?.currentBalance ?? 0;
  const projectEndForMarker = useMemo(
    () => (result ? getProjectionStats(result, awardEndDate).projectedEnd : 0),
    [awardEndDate, result]
  );
  const selectedTimelineLabel =
    TIMELINE_OPTIONS.find((option) => option.value === selectedTimeline)
      ?.label ?? TIMELINE_OPTIONS[0].label;

  return (
    <>
      <section className="mt-2 pb-4">
        <div className="mb-6 max-w-3xl">
          <p>{tooltipDefinitions.projectBurndown}</p>
          <p className="mt-2 text-sm text-muted">
            Indirect Costs (F&amp;A) are assessed based on the approved budget.
            If budget amounts or allocations change, the indirect costs
            assessed may also change. Please check with your account manager
            for project-specific details.
          </p>
        </div>

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
              <div className="relative z-50 mb-6 text-sm">
                <div
                  className="relative z-[100] mb-4"
                  onBlur={(event) => {
                    const nextFocus = event.relatedTarget as Node | null;
                    if (!event.currentTarget.contains(nextFocus)) {
                      setIsTimelineMenuOpen(false);
                    }
                  }}
                >
                  <span
                    className="stat-label block"
                    id="burndown-timeline-label"
                  >
                    Timeline
                  </span>
                  <button
                    aria-controls="burndown-timeline-menu"
                    aria-expanded={isTimelineMenuOpen}
                    aria-haspopup="listbox"
                    aria-labelledby="burndown-timeline-label burndown-timeline-trigger"
                    className="inline-flex items-center gap-1 text-base font-normal"
                    id="burndown-timeline-trigger"
                    onClick={() => setIsTimelineMenuOpen((current) => !current)}
                    role="combobox"
                    type="button"
                  >
                    {selectedTimelineLabel}
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  {isTimelineMenuOpen ? (
                    <div
                      aria-labelledby="burndown-timeline-label"
                      className="absolute left-0 top-full z-100 mt-1 min-w-36 rounded-md border border-main-border bg-base-100 p-1 shadow-lg"
                      id="burndown-timeline-menu"
                      role="listbox"
                    >
                      {TIMELINE_OPTIONS.map((option) => (
                        <button
                          aria-selected={option.value === selectedTimeline}
                          className={`block w-full rounded px-3 py-2 text-left text-sm ${
                            option.value === selectedTimeline
                              ? 'bg-base-200 font-semibold'
                              : 'hover:bg-base-200'
                          }`}
                          key={option.value}
                          onClick={() => {
                            setSelectedTimeline(option.value);
                            setIsTimelineMenuOpen(false);
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          role="option"
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-10">
                  <div className="relative z-50">
                    <p className="stat-label">Starting Balance</p>
                    <p className="stat-value">
                      {formatCurrency(stats.startingBalance)}
                    </p>
                  </div>
                  <div>
                    <p className="stat-label">Current Balance</p>
                    <p
                      className={getBalanceStatClassName(stats.currentBalance)}
                    >
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
                    interval="preserveStartEnd"
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
                      stroke={getVerticalMarkerStroke(currentBalanceForMarker)}
                      strokeDasharray="3 5"
                      strokeOpacity={getVerticalMarkerStrokeOpacity(
                        currentBalanceForMarker
                      )}
                      strokeWidth={1.5}
                      x={projectionTransitionMonth}
                    />
                  )}
                  {showAwardEndLine && (
                    <ReferenceLine
                      label={
                        <VerticalMarkerLabel
                          align="end"
                          labelText="Project End"
                        />
                      }
                      stroke={getVerticalMarkerStroke(projectEndForMarker)}
                      strokeDasharray="8 4"
                      strokeOpacity={getVerticalMarkerStrokeOpacity(
                        projectEndForMarker
                      )}
                      strokeWidth={1.5}
                      x={awardEndMonth}
                    />
                  )}
                  <Tooltip
                    content={
                      <BurndownTooltip
                        categorySpendByMonth={categorySpendByMonth}
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
              {series.map((entry) => {
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
                      style={{ backgroundColor: projectSeriesColor(entry.key) }}
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
                    {nonPersonnelCategorySeries.map((entry) => {
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
                              backgroundColor: projectExpenditureCategoryColor(
                                entry.key
                              ),
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
