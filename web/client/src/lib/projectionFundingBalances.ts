import {
  getSourceFundingBasis,
  hasSourceCategoryBudget,
  type SourceFundingBasis,
} from '@/lib/projectionBudgets.ts';
export {
  getSourceFundingBasis,
  type SourceFundingBasis,
} from '@/lib/projectionBudgets.ts';
import {
  BALANCE_ADJUSTMENT_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  type AppointmentFundingMonth,
  type PiProjectionRow,
} from '@/lib/piProjection.ts';
import { getFundingSourceOutlook } from '@/lib/projectionWorkspace.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export interface SourceCategoryBalance {
  adjustment: number;
  budgetRecorded: boolean;
  capturedAvailable: number;
  endRemaining: number | null;
  expenditureCategory: string;
  firstDeficitMonth: string | null;
  forecast: number;
  hasBudget: boolean;
  hasCharges: boolean;
  isBalanceAdjustment: boolean;
  revisedAvailable: number;
}

export interface PersonnelBudgetDeficit {
  category: 'salary' | 'fringe';
  expenditureCategory: string;
  missingBudget: boolean;
  /** Can be zero when booked costs used a category without a recorded budget. */
  remaining: number;
}

export interface SourceFundingMonth {
  fringeRemaining: number;
  personnelDeficits: PersonnelBudgetDeficit[];
  remaining: number;
  salaryRemaining: number;
}

export interface SourceFundingBalance {
  basis: SourceFundingBasis;
  categories: SourceCategoryBalance[];
  months: ReadonlyMap<string, SourceFundingMonth>;
}

export type SourceFundingBalances = ReadonlyMap<number, SourceFundingBalance>;

export interface SourceFundingShortfall {
  basis: 'categories' | 'general';
  fundingSourceId: number;
  month: string;
  personnelDeficits: PersonnelBudgetDeficit[];
  /** Total source balance remains available for context, even when a category is short. */
  remaining: number;
}

const personnelCategories = [
  { category: 'salary', expenditureCategory: SALARY_CATEGORY },
  { category: 'fringe', expenditureCategory: FRINGE_CATEGORY },
] as const;

function categoryOrder(category: string) {
  return category === SALARY_CATEGORY
    ? 0
    : category === FRINGE_CATEGORY
      ? 1
      : category === BALANCE_ADJUSTMENT_CATEGORY
        ? 3
        : 2;
}

/** Presents calculator balances directly: booked snapshot costs and category netting are not recalculated here. */
export function buildSourceFundingBalance(
  source: ProjectionFundingSource,
  rows: PiProjectionRow[]
): SourceFundingBalance {
  const basis = getSourceFundingBasis(source);
  const sourceRows = rows.filter(
    ({ fundingSourceId }) => fundingSourceId === source.id
  );
  const totals = getFundingSourceOutlook(sourceRows, source.id);
  const rowsByCategory = new Map<string, PiProjectionRow[]>();
  for (const row of sourceRows) {
    const categoryRows = rowsByCategory.get(row.expenditureCategory) ?? [];
    categoryRows.push(row);
    rowsByCategory.set(row.expenditureCategory, categoryRows);
  }
  const categoryNames = new Set([
    ...source.budgets.map(({ expenditureCategory }) => expenditureCategory),
    ...source.categoryAdjustments.map(
      ({ expenditureCategory }) => expenditureCategory
    ),
    ...rowsByCategory.keys(),
    ...(basis === 'categories' ? [SALARY_CATEGORY, FRINGE_CATEGORY] : []),
    ...(source.balanceAdjustment !== 0 ||
    source.initialPlannedBalance !== 0 ||
    source.plannedBudgetMode === 'GeneralPool'
      ? [BALANCE_ADJUSTMENT_CATEGORY]
      : []),
  ]);
  const categories = [...categoryNames]
    .sort((a, b) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b))
    .map((expenditureCategory): SourceCategoryBalance => {
      const budget = source.budgets.find(
        (row) => row.expenditureCategory === expenditureCategory
      );
      const categoryRows = [
        ...(rowsByCategory.get(expenditureCategory) ?? []),
      ].sort((a, b) => a.month.localeCompare(b.month));
      const isBalanceAdjustment =
        expenditureCategory === BALANCE_ADJUSTMENT_CATEGORY;
      const capturedAvailable =
        (budget ? budget.budget - budget.spentToDate - budget.committed : 0) +
        (isBalanceAdjustment ? source.initialPlannedBalance : 0);
      const adjustment = isBalanceAdjustment
        ? source.balanceAdjustment
        : (source.categoryAdjustments.find(
            (row) => row.expenditureCategory === expenditureCategory
          )?.amount ?? 0);
      const revisedAvailable = capturedAvailable + adjustment;
      return {
        adjustment,
        budgetRecorded:
          budget !== undefined ||
          (isBalanceAdjustment && source.plannedBudgetMode === 'GeneralPool'),
        capturedAvailable,
        endRemaining:
          categoryRows.at(-1)?.remaining ??
          (totals.length > 0 ? revisedAvailable : null),
        expenditureCategory,
        firstDeficitMonth:
          categoryRows.find(({ remaining }) => remaining < 0)?.month ?? null,
        forecast: categoryRows.reduce(
          (sum, row) => sum + row.projectedAmount,
          0
        ),
        hasBudget:
          hasSourceCategoryBudget(source, expenditureCategory) ||
          (isBalanceAdjustment && source.plannedBudgetMode === 'GeneralPool'),
        hasCharges: categoryRows.some(
          ({ actualAmount, projectedAmount }) =>
            actualAmount > 0 || projectedAmount > 0
        ),
        isBalanceAdjustment,
        revisedAvailable,
      };
    });
  const personnel = personnelCategories.map((category) => ({
    ...category,
    budgetRecorded: hasSourceCategoryBudget(
      source,
      category.expenditureCategory
    ),
    months: new Map(
      (rowsByCategory.get(category.expenditureCategory) ?? []).map((row) => [
        row.month,
        row,
      ])
    ),
  }));
  const months = new Map(
    totals.map(({ month, remaining }) => {
      // A total-only adjustment never replenishes the sponsored salary or fringe category.
      const personnelDeficits = personnel.flatMap(
        (category): PersonnelBudgetDeficit[] => {
          const row = category.months.get(month);
          const remaining = row?.remaining ?? 0;
          const missingUsedBudget =
            !category.budgetRecorded &&
            row !== undefined &&
            (row.actualAmount > 0 || row.projectedAmount > 0);
          return remaining < 0 || missingUsedBudget
            ? [
                {
                  category: category.category,
                  expenditureCategory: category.expenditureCategory,
                  missingBudget: !category.budgetRecorded,
                  remaining,
                },
              ]
            : [];
        }
      );
      return [
        month,
        {
          fringeRemaining: personnel[1].months.get(month)?.remaining ?? 0,
          personnelDeficits,
          remaining,
          salaryRemaining: personnel[0].months.get(month)?.remaining ?? 0,
        },
      ];
    })
  );
  return { basis, categories, months };
}

/** Shares one source/month assessment across appointments without pooling distinct funding sources. */
export function buildSourceFundingBalances(
  sources: ProjectionFundingSource[],
  rows: PiProjectionRow[]
): SourceFundingBalances {
  const rowsBySource = new Map<number, PiProjectionRow[]>();
  for (const row of rows) {
    const sourceRows = rowsBySource.get(row.fundingSourceId) ?? [];
    sourceRows.push(row);
    rowsBySource.set(row.fundingSourceId, sourceRows);
  }
  return new Map(
    sources.map((source) => [
      source.id,
      buildSourceFundingBalance(source, rowsBySource.get(source.id) ?? []),
    ])
  );
}

/** Positive eligible shares inherit their source's monthly deficit; outside funding and gaps stay separate. */
export function getAppointmentFundingShortfalls(
  months: AppointmentFundingMonth[],
  sourceBalances: SourceFundingBalances
): SourceFundingShortfall[] {
  return months.flatMap(({ month, shares }) =>
    shares.flatMap(({ fundingSourceId, percent }): SourceFundingShortfall[] => {
      if (fundingSourceId === null || !(percent > 0)) {
        return [];
      }
      const source = sourceBalances.get(fundingSourceId);
      const balance = source?.months.get(month);
      if (!source || !balance || source.basis === 'unknown') {
        return [];
      }
      if (
        source.basis === 'categories'
          ? balance.personnelDeficits.length === 0
          : balance.remaining >= 0
      ) {
        return [];
      }
      return [
        {
          basis: source.basis,
          fundingSourceId,
          month,
          personnelDeficits:
            source.basis === 'categories' ? balance.personnelDeficits : [],
          remaining: balance.remaining,
        },
      ];
    })
  );
}
