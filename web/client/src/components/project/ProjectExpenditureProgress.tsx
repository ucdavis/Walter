import { useId, useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  getCategoryBudgetProgress,
  getBudgetProgressSummary,
  getTimeProgressSummary,
  type BudgetProgressSummary,
  type TimeProgressSummary,
} from '@/lib/projectProgress.ts';
import {
  useProjectProjectionQuery,
  type ProjectProjectionCategory,
} from '@/queries/projectProjection.ts';

const CATEGORY_PROGRESS_DESCRIPTION =
  'Expenses, commitments, and available balance by expenditure category.';
const TIME_ELAPSED_COLOR = 'var(--color-secondary)';
const BUDGET_SPENT_COLOR = 'var(--color-primary)';
const AXIS_MAX_PERCENT = 100;
const BAR_MAX_PERCENT = 100;
const BAR_TRACK_WIDTH_PERCENT = (BAR_MAX_PERCENT / AXIS_MAX_PERCENT) * 100;
const AXIS_TICKS = [0, 20, 40, 60, 80, 100] as const;

type CategoryProgressSegment = {
  color: string;
  label: string;
  value: number;
  width: number;
};

type CategoryProgressRow = {
  available: number;
  budget: number;
  committed: number;
  displayName: string;
  expenditureCategory: string;
  overrun: number;
  segments: CategoryProgressSegment[];
  spent: number;
  total: number;
};

type PacingProgressSegment = {
  color: string;
  label: string;
  secondaryText?: string;
  text?: string;
  textClassName?: string;
  width: number;
};

type PacingProgressRow = {
  ariaLabel: string;
  primaryText: string;
  primaryTextDetail?: string;
  remainingClassName?: string;
  remainingText: string;
  segments: PacingProgressSegment[];
  title: string;
  totalText: string;
};

interface ProjectExpenditureProgressProps {
  awardEndDate: string | null;
  awardStartDate: string | null;
  categories: ProjectProjectionCategory[];
}

interface ProjectExpenditureProgressSectionProps {
  awardEndDate: string | null;
  awardStartDate: string | null;
  projectNumber: string;
}

function categoryDisplayName(expenditureCategory: string) {
  return expenditureCategory.replace(/^\d+\s*-\s*/, '');
}

function hasCategoryProgressData(category: ProjectProjectionCategory) {
  return (
    category.budget !== 0 ||
    category.committed !== 0 ||
    category.remainingNow !== 0 ||
    category.spentToDate !== 0
  );
}

function commitmentColor(color: string) {
  return `color-mix(in srgb, ${color} 68%, white)`;
}

function availableColor(color: string) {
  return `color-mix(in srgb, ${color} 24%, var(--color-base-300))`;
}

function progressWidth(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function formatPercent(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';
}

function formatPacingPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatMonthCount(value: number) {
  return `${value} ${value === 1 ? 'month' : 'months'}`;
}

function getBudgetRemainingText(progress: BudgetProgressSummary) {
  const remainingPercent = formatPacingPercent(progress.remainingPercent);

  if (progress.overrun > 0) {
    return progress.budget > 0
      ? `${formatCurrency(progress.overrun)} (${formatPacingPercent(
          progress.overrunPercent
        )}) over`
      : `${formatCurrency(progress.overrun)} over`;
  }

  return `${formatCurrency(progress.remaining)} (${remainingPercent})`;
}

function ScaledProgressBar({
  ariaLabel,
  segments,
}: {
  ariaLabel: string;
  segments: Array<{ color: string; label: string; width: number }>;
}) {
  return (
    <div className="relative">
      <div
        aria-label={ariaLabel}
        className="flex h-3 overflow-hidden rounded-sm bg-base-300"
        role="img"
        style={{ width: `${BAR_TRACK_WIDTH_PERCENT}%` }}
      >
        {segments
          .filter((segment) => segment.width > 0)
          .map((segment) => (
            <span
              aria-hidden="true"
              className="block h-full"
              key={segment.label}
              style={{
                backgroundColor: segment.color,
                width: `${segment.width}%`,
              }}
            />
          ))}
      </div>
    </div>
  );
}

function PacingProgressAxis() {
  return (
    <div
      aria-hidden="true"
      className="relative mt-2 h-14 border-t border-main-border text-[12px] text-current"
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
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-proxima-bold uppercase">
        Time
      </span>
    </div>
  );
}

function getTimeProgressRow(progress: TimeProgressSummary): PacingProgressRow {
  const elapsedUnit = progress.elapsedMonths === 1 ? 'month' : 'months';
  const elapsedText = `${progress.elapsedMonths} (${formatPacingPercent(progress.elapsedPercent)}) ${elapsedUnit} completed`;
  const remainingUnit = progress.remainingMonths === 1 ? 'month' : 'months';
  const remainingText = `${progress.remainingMonths} (${formatPacingPercent(progress.remainingPercent)}) ${remainingUnit} remaining`;
  const totalText = `${formatMonthCount(progress.totalMonths)} total`;

  return {
    ariaLabel: `Time: ${elapsedText}, ${remainingText}, ${totalText}`,
    primaryText: elapsedText,
    remainingText,
    segments: [
      {
        color: TIME_ELAPSED_COLOR,
        label: 'Past',
        secondaryText: remainingText,
        text: elapsedText,
        width: progress.elapsedPercent,
      },
      {
        color: availableColor(TIME_ELAPSED_COLOR),
        label: 'Remaining',
        textClassName: 'text-base-content/80',
        width: progress.remainingPercent,
      },
    ],
    title: 'Time',
    totalText,
  };
}

function getBudgetProgressRow(
  progress: BudgetProgressSummary
): PacingProgressRow {
  const spentText = `${formatCurrency(progress.spent)} (${formatPacingPercent(progress.spentPercent)}) spent`;
  const committedText = `${formatCurrency(progress.committed)} (${formatPacingPercent(progress.committedPercent)}) committed`;
  const remainingText = getBudgetRemainingText(progress);
  const budgetText = `${formatCurrency(progress.budget)} budget`;
  const overrunText =
    progress.overrun > 0
      ? `${formatCurrency(progress.overrun)} over budget`
      : null;

  return {
    ariaLabel: `All Expenses: ${spentText}, ${committedText}, ${remainingText}${overrunText ? `, ${overrunText}` : ''}, ${budgetText}`,
    primaryText: spentText,
    primaryTextDetail: committedText,
    remainingClassName:
      progress.overrun > 0 ? 'font-proxima-bold text-error' : undefined,
    remainingText,
    segments: [
      {
        color: BUDGET_SPENT_COLOR,
        label: 'Spent',
        secondaryText: remainingText,
        text: spentText,
        width: progress.spentPercent,
      },
      {
        color: commitmentColor(BUDGET_SPENT_COLOR),
        label: 'Committed',
        width: progress.committedPercent,
      },
      {
        color: availableColor(BUDGET_SPENT_COLOR),
        label: 'Remaining',
        textClassName: 'text-base-content/80',
        width: progress.remainingPercent,
      },
    ],
    title: 'All Expenses',
    totalText: budgetText,
  };
}

function buildCategoryProgressRows(
  categories: ProjectProjectionCategory[]
): CategoryProgressRow[] {
  return categories
    .filter(hasCategoryProgressData)
    .sort((a, b) => a.expenditureCategory.localeCompare(b.expenditureCategory))
    .map((category) => {
      const { available, budget, committed, overrun, spent, total } =
        getCategoryBudgetProgress(category);
      const baseColor = projectExpenditureCategoryColor(
        category.expenditureCategory
      );

      const segments = [
        {
          color: baseColor,
          label: 'Expenses',
          value: spent,
          width: progressWidth(spent, total),
        },
        {
          color: commitmentColor(baseColor),
          label: 'Commitments',
          value: committed,
          width: progressWidth(committed, total),
        },
        {
          color: availableColor(baseColor),
          label: 'Available',
          value: available,
          width: progressWidth(available, total),
        },
      ].filter((segment) => segment.value > 0);

      return {
        available,
        budget,
        committed,
        displayName: categoryDisplayName(category.expenditureCategory),
        expenditureCategory: category.expenditureCategory,
        overrun,
        segments,
        spent,
        total,
      };
    });
}

export function ProjectExpenditureProgress({
  awardEndDate,
  awardStartDate,
  categories,
}: ProjectExpenditureProgressProps) {
  const detailsId = useId();
  const [areDetailsExpanded, setAreDetailsExpanded] = useState(true);
  const rows = useMemo(
    () => buildCategoryProgressRows(categories),
    [categories]
  );
  const timeProgress = useMemo(
    () => getTimeProgressSummary(awardStartDate, awardEndDate),
    [awardEndDate, awardStartDate]
  );
  const budgetProgress = useMemo(
    () => getBudgetProgressSummary(categories),
    [categories]
  );
  const hasBudgetData =
    budgetProgress.budget !== 0 ||
    budgetProgress.committed !== 0 ||
    budgetProgress.overrun !== 0 ||
    budgetProgress.remaining !== 0 ||
    budgetProgress.spent !== 0;
  const pacingRows = useMemo(
    () =>
      [
        timeProgress ? getTimeProgressRow(timeProgress) : null,
        hasBudgetData ? getBudgetProgressRow(budgetProgress) : null,
      ].filter((row): row is PacingProgressRow => row !== null),
    [budgetProgress, hasBudgetData, timeProgress]
  );
  const summaryBudgetText = hasBudgetData
    ? getBudgetRemainingText(budgetProgress)
    : null;
  const summaryMonthsText = timeProgress
    ? `${formatMonthCount(timeProgress.remainingMonths)} (${formatPacingPercent(
        timeProgress.remainingPercent
      )})`
    : null;
  const currentMonthMarkerLeft = timeProgress
    ? `${(timeProgress.elapsedPercent / AXIS_MAX_PERCENT) * 100}%`
    : null;

  if (rows.length === 0 && !timeProgress && !hasBudgetData) {
    return null;
  }

  return (
    <section
      aria-label="Project Expenditure Progress"
      className="mt-2 pb-4"
      data-testid="project-expenditure-progress"
    >
      <p className="mb-6 max-w-3xl">
        {CATEGORY_PROGRESS_DESCRIPTION}
        {summaryBudgetText && summaryMonthsText && (
          <>
            <br />
            {budgetProgress.overrun > 0
              ? 'Balance is '
              : 'Available balance is '}
            <strong
              className={budgetProgress.overrun > 0 ? 'text-error' : undefined}
            >
              {summaryBudgetText}
            </strong>
            , with <strong>{summaryMonthsText}</strong> remaining.
          </>
        )}
      </p>

      <div className="relative" data-testid="budget-vs-time-chart">
        {currentMonthMarkerLeft && (
          <>
            <span
              className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-full pb-1 text-xs text-base-content"
              style={{ left: currentMonthMarkerLeft }}
            >
              Today
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-10 z-10 w-0 -translate-x-1/2 border-l-2 border-dashed border-base-content/35"
              data-testid="budget-vs-time-current-month-marker"
              style={{ left: currentMonthMarkerLeft }}
            />
          </>
        )}

        <div className="space-y-4">
          {pacingRows.length > 0 && (
            <div>
              <p className="font-proxima-bold uppercase mb-2">Summary</p>
              <ul className="space-y-4">
                {pacingRows.map((row) => (
                  <li className="space-y-2" key={row.title}>
                    <div
                      className="min-w-0"
                      style={{ width: `${BAR_TRACK_WIDTH_PERCENT}%` }}
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <p className="font-proxima-bold truncate">
                          {row.title}
                        </p>
                        <p className="text-sm">{row.totalText}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-base-content/80">
                        {row.primaryTextDetail ? (
                          <p className="flex flex-wrap gap-x-3 gap-y-1">
                            <span>{row.primaryText}</span>
                            <span>|</span>
                            <span>{row.primaryTextDetail}</span>
                          </p>
                        ) : (
                          <p>{row.primaryText}</p>
                        )}
                        <p
                          className={`ml-auto text-right mr-2${row.remainingClassName ? ` ${row.remainingClassName}` : ''}`}
                        >
                          {row.remainingText}
                        </p>
                      </div>
                    </div>
                    <ScaledProgressBar
                      ariaLabel={row.ariaLabel}
                      segments={row.segments}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <div className="mt-8 mb-2 flex flex-wrap items-center justify-start gap-2">
                <p className="font-proxima-bold uppercase">Details</p>
                <button
                  aria-controls={detailsId}
                  aria-expanded={areDetailsExpanded}
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setAreDetailsExpanded((isExpanded) => !isExpanded)
                  }
                  type="button"
                >
                  {areDetailsExpanded ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                  {areDetailsExpanded ? 'Hide details' : 'Show details'}
                </button>
              </div>
              <div id={detailsId}>
                {areDetailsExpanded && (
                  <ul className="space-y-4">
                    {rows.map((row) => {
                      const isOverBudget = row.overrun > 0;
                      const percentTotal =
                        isOverBudget && row.budget > 0 ? row.budget : row.total;
                      const spentText = `${formatCurrency(row.spent)} (${formatPercent(
                        row.spent,
                        percentTotal
                      )}) spent`;
                      const committedText = `${formatCurrency(row.committed)} committed`;
                      const balanceText = isOverBudget
                        ? row.budget > 0
                          ? `${formatCurrency(row.overrun)} (${formatPercent(
                              row.overrun,
                              percentTotal
                            )}) over`
                          : `${formatCurrency(row.overrun)} over`
                        : `${formatCurrency(row.available)} (${formatPercent(
                            row.available,
                            row.total
                          )}) available`;

                      return (
                        <li className="space-y-2" key={row.expenditureCategory}>
                          <div
                            className="min-w-0"
                            style={{ width: `${BAR_TRACK_WIDTH_PERCENT}%` }}
                          >
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <p className="font-proxima-bold truncate mt-1">
                                {row.displayName}
                              </p>
                              <p className="text-sm">
                                {formatCurrency(row.budget)} budget
                              </p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-base-content/80">
                              <p className="flex flex-wrap gap-x-3 gap-y-1">
                                <span>{spentText}</span>
                                <span>|</span>
                                <span>{committedText}</span>
                              </p>
                              <p
                                className={
                                  isOverBudget
                                    ? 'ml-auto text-right mr-2 font-proxima-bold text-error'
                                    : 'ml-auto text-right mr-2'
                                }
                              >
                                {balanceText}
                              </p>
                            </div>
                          </div>
                          <ScaledProgressBar
                            ariaLabel={`${row.displayName}: ${spentText}, ${committedText}, ${balanceText}, ${formatCurrency(row.budget)} budget`}
                            segments={row.segments}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <PacingProgressAxis />
      </div>
    </section>
  );
}

export function ProjectExpenditureProgressSection({
  awardEndDate,
  awardStartDate,
  projectNumber,
}: ProjectExpenditureProgressSectionProps) {
  const projectionQuery = useProjectProjectionQuery(projectNumber);

  if (projectionQuery.isPending) {
    return (
      <p className="text-base-content/70 mt-4">
        Loading project expenditure progress...
      </p>
    );
  }

  if (projectionQuery.isError) {
    return (
      <p className="text-error mt-4">
        Error loading project expenditure progress.
      </p>
    );
  }

  return (
    <ProjectExpenditureProgress
      awardEndDate={awardEndDate}
      awardStartDate={awardStartDate}
      categories={projectionQuery.data.categories}
    />
  );
}
