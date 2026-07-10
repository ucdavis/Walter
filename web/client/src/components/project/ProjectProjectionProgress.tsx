import { useMemo } from 'react';
import { formatCurrency } from '@/lib/currency.ts';
import {
  getBudgetProgressSummary,
  getTimeProgressSummary,
  type BudgetProgressSummary,
  type TimeProgressSummary,
} from '@/lib/projectProgress.ts';
import type { ProjectProjectionCategory } from '@/queries/projectProjection.ts';

const PROGRESS_DESCRIPTION =
  'Time elapsed and budget spent against the project plan.';
const TIME_ELAPSED_COLOR = 'var(--color-ucd-bodega)';
const BUDGET_SPENT_COLOR = 'var(--color-ucd-redwood)';
const AXIS_MAX_PERCENT = 120;
const BAR_MAX_PERCENT = 100;
const BAR_TRACK_WIDTH_PERCENT = (BAR_MAX_PERCENT / AXIS_MAX_PERCENT) * 100;
const AXIS_TICKS = [0, 20, 40, 60, 80, 100, 120] as const;

interface ProjectProjectionProgressProps {
  awardEndDate: string | null;
  awardStartDate: string | null;
  categories: ProjectProjectionCategory[];
}

interface ProgressBarSegment {
  color: string;
  label: string;
  secondaryText?: string;
  text?: string;
  textClassName?: string;
  width: number;
}

interface ProgressBarRow {
  ariaLabel: string;
  segments: ProgressBarSegment[];
  title: string;
  totalText: string;
}

function remainingColor(color: string) {
  return `color-mix(in srgb, ${color} 24%, var(--color-base-300))`;
}

function formatMonthCount(value: number) {
  return `${value} ${value === 1 ? 'month' : 'months'}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function ProgressBar({
  ariaLabel,
  segments,
  totalText,
}: {
  ariaLabel: string;
  segments: ProgressBarSegment[];
  totalText: string;
}) {
  return (
    <div className="relative h-10">
      <div
        aria-label={ariaLabel}
        className="flex h-10 overflow-hidden rounded-sm bg-base-300"
        role="img"
        style={{ width: `${BAR_TRACK_WIDTH_PERCENT}%` }}
      >
        {segments
          .filter((segment) => segment.width > 0)
          .map((segment) => (
            <span
              aria-hidden="true"
              className={`flex h-full min-w-0 items-center justify-start overflow-hidden px-2 text-left text-sm font-proxima-bold leading-none ${segment.textClassName ?? 'text-base-100'}`}
              key={segment.label}
              style={{
                backgroundColor: segment.color,
                width: `${segment.width}%`,
              }}
              title={
                segment.text && segment.secondaryText
                  ? `${segment.text} | ${segment.secondaryText}`
                  : (segment.text ?? segment.label)
              }
            >
              {segment.text && (
                <span className="truncate">
                  {segment.text}
                  {segment.secondaryText && (
                    <>
                      <span> | </span>
                      <span className="opacity-70">
                        {segment.secondaryText}
                      </span>
                    </>
                  )}
                </span>
              )}
            </span>
          ))}
      </div>
      <span
        className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-2 text-sm font-medium text-base-content/80"
        style={{ left: `${BAR_TRACK_WIDTH_PERCENT}%` }}
      >
        {totalText}
      </span>
    </div>
  );
}

function ProgressAxis() {
  return (
    <div
      aria-hidden="true"
      className="relative mt-2 h-10 border-t border-main-border text-[12px] text-current"
      data-testid="budget-vs-time-axis"
    >
      {AXIS_TICKS.map((tick) => (
        <span
          className="absolute top-0 -translate-x-1/2 pt-1 before:absolute before:top-0 before:left-1/2 before:h-1.5 before:border-l before:border-main-border"
          key={tick}
          style={{ left: `${(tick / AXIS_MAX_PERCENT) * 100}%` }}
        >
          {tick}%
        </span>
      ))}
    </div>
  );
}

function getTimeProgressRow(progress: TimeProgressSummary): ProgressBarRow {
  const elapsedText = `${formatMonthCount(progress.elapsedMonths)} past`;
  const remainingUnit = progress.remainingMonths === 1 ? 'month' : 'months';
  const remainingText = `${progress.remainingMonths} (${formatPercent(progress.remainingPercent)}) ${remainingUnit} remaining`;
  const totalText = `${formatMonthCount(progress.totalMonths)} total`;

  return {
    ariaLabel: `Time: ${elapsedText}, ${remainingText}, ${totalText}`,
    segments: [
      {
        color: TIME_ELAPSED_COLOR,
        label: 'Past',
        secondaryText: remainingText,
        text: elapsedText,
        width: progress.elapsedPercent,
      },
      {
        color: remainingColor(TIME_ELAPSED_COLOR),
        label: 'Remaining',
        textClassName: 'text-base-content/80',
        width: progress.remainingPercent,
      },
    ],
    title: 'Time',
    totalText,
  };
}

function getBudgetProgressRow(progress: BudgetProgressSummary): ProgressBarRow {
  const spentText = `${formatCurrency(progress.spent)} spent`;
  const remainingText = `${formatCurrency(progress.remaining)} (${formatPercent(progress.remainingPercent)}) remaining`;
  const budgetText = `${formatCurrency(progress.budget)} budget`;
  const overrunText =
    progress.overrun > 0
      ? `${formatCurrency(progress.overrun)} over budget`
      : null;

  return {
    ariaLabel: `Budget: ${spentText}, ${remainingText}${overrunText ? `, ${overrunText}` : ''}, ${budgetText}`,
    segments: [
      {
        color: BUDGET_SPENT_COLOR,
        label: 'Spent',
        secondaryText: remainingText,
        text: spentText,
        width: progress.spentPercent,
      },
      {
        color: remainingColor(BUDGET_SPENT_COLOR),
        label: 'Remaining',
        textClassName: 'text-base-content/80',
        width: progress.remainingPercent,
      },
    ],
    title: 'Budget',
    totalText: budgetText,
  };
}

function BudgetVsTimeBars({
  budgetProgress,
  timeProgress,
}: {
  budgetProgress: BudgetProgressSummary | null;
  timeProgress: TimeProgressSummary | null;
}) {
  const rows = [
    timeProgress ? getTimeProgressRow(timeProgress) : null,
    budgetProgress ? getBudgetProgressRow(budgetProgress) : null,
  ].filter((row): row is ProgressBarRow => row !== null);

  return (
    <div
      className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4"
      data-testid="budget-vs-time-chart"
    >
      <div className="space-y-4">
        {rows.map((row) => (
          <p
            className="flex h-10 items-center font-proxima-bold"
            key={row.title}
          >
            {row.title}
          </p>
        ))}
      </div>
      <div className="relative space-y-4">
        {timeProgress && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-base-content/70"
            data-testid="budget-vs-time-current-month-marker"
            style={{
              boxShadow: '0 0 0 1px var(--color-base-100)',
              left: `${(timeProgress.elapsedPercent / AXIS_MAX_PERCENT) * 100}%`,
            }}
          />
        )}
        {rows.map((row) => (
          <ProgressBar
            ariaLabel={row.ariaLabel}
            key={row.title}
            segments={row.segments}
            totalText={row.totalText}
          />
        ))}
        <ProgressAxis />
      </div>
    </div>
  );
}

function getBurnRateStatus({
  budgetProgress,
  timeProgress,
}: {
  budgetProgress: BudgetProgressSummary;
  timeProgress: TimeProgressSummary;
}) {
  if (budgetProgress.spentPercent > timeProgress.elapsedPercent) {
    return 'Above pacing';
  }

  if (budgetProgress.spentPercent < timeProgress.elapsedPercent) {
    return 'Under pacing';
  }

  return 'Burn rate is ON pacing';
}

export function ProjectProjectionProgress({
  awardEndDate,
  awardStartDate,
  categories,
}: ProjectProjectionProgressProps) {
  const timeProgress = useMemo(
    () => getTimeProgressSummary(awardStartDate, awardEndDate),
    [awardEndDate, awardStartDate]
  );
  const budgetProgress = useMemo(
    () => getBudgetProgressSummary(categories),
    [categories]
  );
  const hasBudgetData =
    budgetProgress.budget !== 0 || budgetProgress.spent !== 0;
  const burnRateStatus =
    timeProgress && hasBudgetData
      ? getBurnRateStatus({ budgetProgress, timeProgress })
      : null;

  if (!timeProgress && !hasBudgetData) {
    return null;
  }

  return (
    <section
      aria-labelledby="project-projection-progress-heading"
      className="mt-8 pb-4"
      data-testid="project-projection-progress"
    >
      <h2 className="h2 mb-1" id="project-projection-progress-heading">
        Budget vs Time Pacing
      </h2>
      <p className="max-w-3xl mb-4">{PROGRESS_DESCRIPTION}</p>

      {burnRateStatus && (
        <div className="mb-6 text-sm">
          <p className="stat-label">Burn Rate Status</p>
          <p className="stat-value">{burnRateStatus}</p>
        </div>
      )}

      <BudgetVsTimeBars
        budgetProgress={hasBudgetData ? budgetProgress : null}
        timeProgress={timeProgress}
      />
    </section>
  );
}
