import { useMemo } from 'react';
import {
  PROJECT_PERSONNEL_COLOR,
  projectNonPersonnelCategoryColor,
} from '@/components/project/projectChartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectProjectionCategory } from '@/queries/projectProjection.ts';

const CATEGORY_PROGRESS_DESCRIPTION =
  'Expenses, commitments, and available balance by expenditure category.';

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

interface ProjectExpenditureProgressProps {
  categories: ProjectProjectionCategory[];
}

function categoryDisplayName(expenditureCategory: string) {
  return expenditureCategory.replace(/^\d+\s*-\s*/, '');
}

function categoryColor(
  category: ProjectProjectionCategory,
  nonPersonnelIndex: number
) {
  return category.isPersonnel === 1
    ? PROJECT_PERSONNEL_COLOR
    : projectNonPersonnelCategoryColor(nonPersonnelIndex);
}

function commitmentColor(color: string) {
  return `color-mix(in srgb, ${color} 68%, white)`;
}

function availableColor(color: string) {
  return `color-mix(in srgb, ${color} 24%, var(--color-base-300))`;
}

function nonnegative(value: number) {
  return Math.max(0, value);
}

function progressWidth(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function formatPercent(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';
}

function buildCategoryProgressRows(
  categories: ProjectProjectionCategory[]
): CategoryProgressRow[] {
  let nonPersonnelIndex = 0;

  return categories
    .filter(
      (category) =>
        category.budget !== 0 ||
        category.committed !== 0 ||
        category.remainingNow !== 0 ||
        category.spentToDate !== 0
    )
    .sort((a, b) => a.expenditureCategory.localeCompare(b.expenditureCategory))
    .map((category) => {
      const available = nonnegative(category.remainingNow);
      const committed = nonnegative(category.committed);
      const spent = nonnegative(category.spentToDate);
      const total = Math.max(
        nonnegative(category.budget),
        spent + committed + available,
        1
      );
      const baseColor = categoryColor(category, nonPersonnelIndex);

      if (category.isPersonnel !== 1) {
        nonPersonnelIndex += 1;
      }

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
        budget: category.budget,
        committed,
        displayName: categoryDisplayName(category.expenditureCategory),
        expenditureCategory: category.expenditureCategory,
        overrun:
          category.remainingNow < 0 ? Math.abs(category.remainingNow) : 0,
        segments,
        spent,
        total,
      };
    });
}

export function ProjectExpenditureProgress({
  categories,
}: ProjectExpenditureProgressProps) {
  const rows = useMemo(
    () => buildCategoryProgressRows(categories),
    [categories]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="project-expenditure-progress-heading"
      className="mt-8 border-b border-main-border pb-8"
      data-testid="project-expenditure-progress"
    >
      <h2 className="h2 mb-1" id="project-expenditure-progress-heading">
        Project Expenditure Progress
      </h2>
      <p className="mb-6 max-w-3xl">{CATEGORY_PROGRESS_DESCRIPTION}</p>

      <ul className="space-y-4">
        {rows.map((row) => {
          const isOverBudget = row.overrun > 0;
          const balanceText = isOverBudget
            ? `${formatCurrency(row.overrun)} over`
            : `${formatCurrency(row.available)} (${formatPercent(
                row.available,
                row.total
              )}) available`;

          return (
            <li className="space-y-2" key={row.expenditureCategory}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="min-w-0">
                  <p className="font-proxima-bold truncate mt-1">
                    {row.displayName}
                  </p>
                  <p className="flex mt-1 flex-wrap gap-x-3 gap-y-1 text-sm text-base-content/80">
                    <span
                      className={
                        isOverBudget ? 'font-extrabold text-error' : undefined
                      }
                    >
                      {balanceText}
                    </span>{' '}
                    |<span>{formatCurrency(row.spent)} spent</span>
                    <span>{formatCurrency(row.committed)} committed</span>
                  </p>
                </div>
                <p className="text-sm font-medium">
                  {formatCurrency(row.budget)} budget
                </p>
              </div>
              <div
                aria-label={`${row.displayName}: ${formatCurrency(row.spent)} spent, ${formatCurrency(row.committed)} committed, ${balanceText}, ${formatCurrency(row.budget)} budget`}
                className="flex h-3 w-full overflow-hidden rounded-sm bg-base-300"
                role="img"
              >
                {row.segments.map((segment) => (
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
