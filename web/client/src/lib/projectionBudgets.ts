import type {
  CategoryBudgetAdjustment,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

export type SourceFundingBasis = 'categories' | 'general' | 'unknown';

/** Planned category mode is fixed at creation; unknown imported types remain unknown. */
export function getSourceFundingBasis(
  source: ProjectionFundingSource
): SourceFundingBasis {
  if (source.sourceKind === 'Planned') {
    return source.plannedBudgetMode === 'Categories'
      ? 'categories'
      : source.plannedBudgetMode === 'GeneralPool'
        ? 'general'
        : 'unknown';
  }
  switch (source.projectType?.trim().toLowerCase()) {
    case 'sponsored':
    case 'sponsored capital':
      return 'categories';
    case 'internal':
      return 'general';
    default:
      return 'unknown';
  }
}

export function hasSourceCategoryBudget(
  source: ProjectionFundingSource,
  category: string
) {
  return (
    source.budgets.some(
      ({ expenditureCategory }) => expenditureCategory === category
    ) ||
    source.categoryAdjustments.some(
      ({ expenditureCategory }) => expenditureCategory === category
    )
  );
}

export function validateCategoryBudgets(
  rows: CategoryBudgetAdjustment[],
  categories: string[]
) {
  const allowed = new Set(categories);
  const seen = new Set<string>();
  for (const row of rows) {
    if (!allowed.has(row.expenditureCategory)) {
      return 'Choose a known financial category.';
    }
    if (seen.has(row.expenditureCategory.slice(0, 2))) {
      return 'Each financial category may appear only once.';
    }
    if (!Number.isFinite(row.amount)) {
      return 'Enter a finite budget amount.';
    }
    if (Math.round(row.amount * 100) / 100 !== row.amount) {
      return 'Enter a budget amount with at most two decimal places.';
    }
    seen.add(row.expenditureCategory.slice(0, 2));
  }
  return null;
}

export type SourceBudgetChange =
  | { amount: number; from: string; kind: 'move'; to: string }
  | { amount: number; expenditureCategory: string; kind: 'adjust' }
  | { kind: 'reset' };

/** Changes only scenario budget deltas; captured or initial funding definitions and costs stay intact. */
export function updateSourceBudget(
  source: ProjectionFundingSource,
  change: SourceBudgetChange,
  categories: string[]
):
  | { ok: true; source: ProjectionFundingSource }
  | { error: string; ok: false } {
  if (change.kind === 'reset') {
    return {
      ok: true,
      source: { ...source, balanceAdjustment: 0, categoryAdjustments: [] },
    };
  }
  if (getSourceFundingBasis(source) !== 'categories') {
    return {
      error: 'Category budget changes require category-based funding.',
      ok: false,
    };
  }
  if (!Number.isFinite(change.amount)) {
    return { error: 'Enter a finite budget amount.', ok: false };
  }
  if (Math.round(change.amount * 100) / 100 !== change.amount) {
    return {
      error: 'Enter a budget amount with at most two decimal places.',
      ok: false,
    };
  }
  const changes =
    change.kind === 'move'
      ? [
          { amount: -change.amount, expenditureCategory: change.from },
          { amount: change.amount, expenditureCategory: change.to },
        ]
      : [
          {
            amount: change.amount,
            expenditureCategory: change.expenditureCategory,
          },
        ];
  if (
    change.kind === 'move' &&
    (change.amount <= 0 || change.from === change.to)
  ) {
    return {
      error: 'Choose different categories and a positive amount to move.',
      ok: false,
    };
  }
  const error = validateCategoryBudgets(changes, categories);
  if (error) {
    return { error, ok: false };
  }
  const amounts = new Map(
    source.categoryAdjustments.map(({ amount, expenditureCategory }) => [
      expenditureCategory,
      amount,
    ])
  );
  for (const row of changes) {
    const amount =
      Math.round(
        ((amounts.get(row.expenditureCategory) ?? 0) + row.amount) * 100
      ) / 100;
    if (!Number.isFinite(amount)) {
      return { error: 'Enter a finite budget amount.', ok: false };
    }
    if (
      amount === 0 &&
      source.budgets.some(
        ({ expenditureCategory }) =>
          expenditureCategory === row.expenditureCategory
      )
    ) {
      amounts.delete(row.expenditureCategory);
    } else {
      amounts.set(row.expenditureCategory, amount);
    }
  }
  // Only absent baseline categories retain zero entries, because defining a category differs from missing it.
  const categoryAdjustments = [...amounts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([expenditureCategory, amount]) => ({ amount, expenditureCategory }));
  return { ok: true, source: { ...source, categoryAdjustments } };
}
