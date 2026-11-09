import type {
  ProjectionDraft,
  ProjectionExpense,
  ProjectionFundingSource,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';

export type ExpenseInputs = Omit<ProjectionExpense, 'id'>;

export type ExpenseOperationResult<
  T extends ProjectionDraft = ProjectionDraft,
> =
  | { error: string; ok: false }
  | { expenseId?: number; ok: true; session: ProjectionSession<T> };

export type ExpenseOperation = <T extends ProjectionDraft>(
  session: ProjectionSession<T>
) => ExpenseOperationResult<T>;

export interface HistoricalExpenseRow {
  baselineAmount: number;
  effectiveAmount: number;
  expenditureCategory: string;
  overrideAmount: number | null;
}

/** All captured windows keep a stable category list, even when this window has no amount. */
export function getHistoricalExpenseRows(
  source: ProjectionFundingSource,
  historyMonths: number
): HistoricalExpenseRow[] {
  const categories = new Set([
    ...source.runRates.map(({ expenditureCategory }) => expenditureCategory),
    ...source.historicalExpenseOverrides.map(
      ({ expenditureCategory }) => expenditureCategory
    ),
  ]);
  return [...categories]
    .filter(isHistoricalExpenseCategory)
    .sort()
    .map((expenditureCategory) => {
      const baselineAmount = source.runRates
        .filter(
          (rate) =>
            rate.expenditureCategory === expenditureCategory &&
            rate.historyMonths === historyMonths
        )
        .reduce((total, rate) => total + rate.monthlyAmount, 0);
      const overrideAmount =
        source.historicalExpenseOverrides.find(
          (override) => override.expenditureCategory === expenditureCategory
        )?.amount ?? null;
      return {
        baselineAmount,
        effectiveAmount: overrideAmount ?? baselineAmount,
        expenditureCategory,
        overrideAmount,
      };
    });
}

export const isManualExpenseCategory = (category: string) =>
  !!category.trim() && !/^(01|02)(?:\s|-|$)/.test(category.trim());

export const isHistoricalExpenseCategory = (category: string) =>
  !!category.trim() && !/^(01|02|04)(?:\s|-|$)/.test(category.trim());

const MAX_EXPENSE_ID = 2_147_483_647;

const validMonth = (value: string) =>
  /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value) && !value.startsWith('0000');

export function validateExpenseInputs(inputs: ExpenseInputs): string | null {
  if (typeof inputs.description !== 'string' || !inputs.description.trim()) {
    return 'Enter an expense description.';
  }
  if (
    typeof inputs.expenditureCategory !== 'string' ||
    !isManualExpenseCategory(inputs.expenditureCategory)
  ) {
    return 'Choose an expense category other than salary or fringe benefits.';
  }
  if (!Number.isFinite(inputs.amount)) {
    return 'Enter a valid amount. Credits and zero are allowed.';
  }
  if (inputs.kind !== 'Monthly' && inputs.kind !== 'OneTime') {
    return 'Choose a monthly or one-time expense.';
  }
  if (!validMonth(inputs.startMonth)) {
    return 'Choose a valid start month.';
  }
  if (inputs.kind === 'OneTime' && inputs.endMonth !== null) {
    return 'A one-time expense has only one month.';
  }
  if (
    inputs.endMonth !== null &&
    (!validMonth(inputs.endMonth) || inputs.endMonth < inputs.startMonth)
  ) {
    return 'Choose an end month on or after the start, or use the source end.';
  }
  return null;
}

export function validateProjectionExpenses(
  plan: ProjectionDraft
): string | null {
  if (![3, 6, 12].includes(plan.historyMonths)) {
    return 'Choose a history window of 3, 6, or 12 months.';
  }
  for (const source of plan.fundingSources) {
    const ids = new Set<number>();
    for (const expense of source.expenses) {
      if (
        !Number.isInteger(expense.id) ||
        expense.id <= 0 ||
        expense.id > MAX_EXPENSE_ID ||
        ids.has(expense.id)
      ) {
        return `${source.name}: Each expense must have a unique positive ID.`;
      }
      ids.add(expense.id);
      const error = validateExpenseInputs(expense);
      if (error) {
        return `${source.name}: ${error}`;
      }
    }
    const categories = new Set<string>();
    for (const override of source.historicalExpenseOverrides) {
      const category = override.expenditureCategory?.trim();
      if (
        !category ||
        !isHistoricalExpenseCategory(category) ||
        categories.has(category) ||
        !Number.isFinite(override.amount)
      ) {
        return `${source.name}: Historical estimates need unique eligible categories and valid amounts.`;
      }
      categories.add(category);
    }
  }
  return null;
}

function updateSource<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  source: ProjectionFundingSource,
  updated: ProjectionFundingSource
): ExpenseOperationResult<T> {
  if (source === updated) {
    return { ok: true, session };
  }
  return {
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        fundingSources: session.draft.fundingSources.map((candidate) =>
          candidate.id === source.id ? updated : candidate
        ),
      },
      revision: session.revision + 1,
    },
  };
}

const missingSource = {
  error: 'This funding source is no longer in the plan.',
  ok: false,
} as const;
const missingExpense = {
  error: 'This expense is no longer in the funding source.',
  ok: false,
} as const;

const normalizedInputs = (inputs: ExpenseInputs): ExpenseInputs => ({
  ...inputs,
  description: inputs.description.trim(),
  expenditureCategory: inputs.expenditureCategory.trim(),
});

export function addProjectionExpense<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  sourceId: number,
  inputs: ExpenseInputs
): ExpenseOperationResult<T> {
  const source = session.draft.fundingSources.find(({ id }) => id === sourceId);
  if (!source) {
    return missingSource;
  }
  const error = validateExpenseInputs(inputs);
  if (error) {
    return { error, ok: false };
  }
  const id = Math.max(0, ...source.expenses.map(({ id }) => id)) + 1;
  if (!Number.isInteger(id) || id > MAX_EXPENSE_ID) {
    return { error: 'No expense ID is available.', ok: false };
  }
  const result = updateSource(session, source, {
    ...source,
    expenses: [...source.expenses, { ...normalizedInputs(inputs), id }],
  });
  return result.ok ? { ...result, expenseId: id } : result;
}

export function editProjectionExpense<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  sourceId: number,
  expenseId: number,
  inputs: ExpenseInputs
): ExpenseOperationResult<T> {
  const source = session.draft.fundingSources.find(({ id }) => id === sourceId);
  if (!source) {
    return missingSource;
  }
  const expense = source.expenses.find(({ id }) => id === expenseId);
  if (!expense) {
    return missingExpense;
  }
  const error = validateExpenseInputs(inputs);
  if (error) {
    return { error, ok: false };
  }
  const edited = { ...normalizedInputs(inputs), id: expenseId };
  if (
    (Object.keys(edited) as (keyof ProjectionExpense)[]).every(
      (key) => edited[key] === expense[key]
    )
  ) {
    return { ok: true, session };
  }
  return updateSource(session, source, {
    ...source,
    expenses: source.expenses.map((candidate) =>
      candidate.id === expenseId ? edited : candidate
    ),
  });
}

export function removeProjectionExpense<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  sourceId: number,
  expenseId: number
): ExpenseOperationResult<T> {
  const source = session.draft.fundingSources.find(({ id }) => id === sourceId);
  if (!source) {
    return missingSource;
  }
  if (!source.expenses.some(({ id }) => id === expenseId)) {
    return missingExpense;
  }
  return updateSource(session, source, {
    ...source,
    expenses: source.expenses.filter(({ id }) => id !== expenseId),
  });
}

export function setHistoricalExpenseOverride<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  sourceId: number,
  expenditureCategory: string,
  amount: number,
  options: { force?: boolean } = {}
): ExpenseOperationResult<T> {
  const source = session.draft.fundingSources.find(({ id }) => id === sourceId);
  if (!source) {
    return missingSource;
  }
  const category = expenditureCategory.trim();
  if (!isHistoricalExpenseCategory(category) || !Number.isFinite(amount)) {
    return {
      error: 'Choose an eligible historical category and enter a valid amount.',
      ok: false,
    };
  }
  const row = getHistoricalExpenseRows(
    source,
    session.draft.historyMonths
  ).find((row) => row.expenditureCategory === category);
  if (!row) {
    return {
      error: 'This historical estimate is no longer available.',
      ok: false,
    };
  }
  // Applying the displayed value must not pin an untouched baseline to this window.
  if (
    row.overrideAmount === amount ||
    (!options.force && row.effectiveAmount === amount)
  ) {
    return { ok: true, session };
  }
  return updateSource(session, source, {
    ...source,
    historicalExpenseOverrides: [
      ...source.historicalExpenseOverrides.filter(
        (entry) => entry.expenditureCategory !== category
      ),
      { amount, expenditureCategory: category },
    ],
  });
}

export function restoreHistoricalExpense<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  sourceId: number,
  expenditureCategory: string
): ExpenseOperationResult<T> {
  const source = session.draft.fundingSources.find(({ id }) => id === sourceId);
  if (!source) {
    return missingSource;
  }
  const overrides = source.historicalExpenseOverrides.filter(
    (entry) => entry.expenditureCategory !== expenditureCategory
  );
  return updateSource(
    session,
    source,
    overrides.length === source.historicalExpenseOverrides.length
      ? source
      : { ...source, historicalExpenseOverrides: overrides }
  );
}

export function changeProjectionHistoryMonths<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  historyMonths: number
): ExpenseOperationResult<T> {
  if (![3, 6, 12].includes(historyMonths)) {
    return {
      error: 'Choose a history window of 3, 6, or 12 months.',
      ok: false,
    };
  }
  if (session.draft.historyMonths === historyMonths) {
    return { ok: true, session };
  }
  return {
    ok: true,
    session: {
      ...session,
      draft: { ...session.draft, historyMonths },
      revision: session.revision + 1,
    },
  };
}
