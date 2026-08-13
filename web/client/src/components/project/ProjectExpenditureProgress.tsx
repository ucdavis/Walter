import { useMemo } from 'react';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import {
  ProjectProgressBar,
  type ProjectProgressBarSegment,
} from '@/components/project/ProjectProgressBar.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import {
  getCategoryBudgetProgress,
  getBudgetProgressSummary,
  getTimeProgressSummary,
  type BudgetProgressSummary,
} from '@/lib/projectProgress.ts';
import type { ProjectProjectionCategory } from '@/queries/projectProjection.ts';

const AXIS_MAX_PERCENT = 100;
const BAR_MAX_PERCENT = 100;
const BAR_TRACK_WIDTH_PERCENT = (BAR_MAX_PERCENT / AXIS_MAX_PERCENT) * 100;
const AXIS_TICKS = [0, 20, 40, 60, 80, 100] as const;

type CategoryProgressSegment = ProjectProgressBarSegment & {
  value: number;
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
      <ProjectProgressBar
        ariaLabel={ariaLabel}
        segments={segments}
        style={{ width: `${BAR_TRACK_WIDTH_PERCENT}%` }}
      />
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
    </div>
  );
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

function CategoryProgressRows({ rows }: { rows: CategoryProgressRow[] }) {
  return (
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
                <p className="text-sm">{formatCurrency(row.budget)} budget</p>
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
  );
}

export function ProjectExpenditureProgressCategories({
  awardEndDate,
  awardStartDate,
  categories,
}: {
  awardEndDate?: string | null;
  awardStartDate?: string | null;
  categories: ProjectProjectionCategory[];
}) {
  const rows = useMemo(
    () => buildCategoryProgressRows(categories),
    [categories]
  );
  const timeProgress = useMemo(
    () => getTimeProgressSummary(awardStartDate ?? null, awardEndDate ?? null),
    [awardEndDate, awardStartDate]
  );
  const currentMonthMarkerLeft = timeProgress
    ? `${(timeProgress.elapsedPercent / AXIS_MAX_PERCENT) * 100}%`
    : null;

  if (rows.length === 0) {
    return (
      <p className="text-base-content/70 mt-4">
        No expenditure category data found.
      </p>
    );
  }

  return (
    <div
      className="relative pt-5"
      data-testid="project-expenditure-progress-categories"
    >
      {currentMonthMarkerLeft && (
        <>
          <span
            className="pointer-events-none absolute top-0 z-20 -translate-x-full pr-1 text-xs text-base-content"
            style={{ left: `max(2.5rem, ${currentMonthMarkerLeft})` }}
          >
            Today
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-5 bottom-10 z-10 w-0 -translate-x-1/2 border-l-2 border-dashed border-base-content/35"
            data-testid="budget-vs-time-current-month-marker"
            style={{ left: currentMonthMarkerLeft }}
          />
        </>
      )}
      <CategoryProgressRows rows={rows} />
      <PacingProgressAxis />
    </div>
  );
}

export function ProjectExpenditureProgressSummary({
  awardEndDate,
  awardStartDate,
  categories,
}: {
  awardEndDate?: string | null;
  awardStartDate?: string | null;
  categories: ProjectProjectionCategory[];
}) {
  const timeProgress = useMemo(
    () => getTimeProgressSummary(awardStartDate ?? null, awardEndDate ?? null),
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
  const summaryBudgetText = hasBudgetData
    ? getBudgetRemainingText(budgetProgress)
    : null;
  const summaryMonthsText = timeProgress
    ? `${formatMonthCount(timeProgress.remainingMonths)} (${formatPacingPercent(
        timeProgress.remainingPercent
      )})`
    : null;

  if (!summaryBudgetText || !summaryMonthsText) {
    return null;
  }

  return (
    <p className="max-w-3xl">
      {budgetProgress.overrun > 0 ? 'Balance is ' : 'Available balance is '}
      <strong
        className={budgetProgress.overrun > 0 ? 'text-error' : undefined}
      >
        {summaryBudgetText}
      </strong>
      , with <strong>{summaryMonthsText}</strong> remaining.
    </p>
  );
}
