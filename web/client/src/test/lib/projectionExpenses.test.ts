import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import {
  computeExpenseForecast,
  computePiProjection,
  FEE_REMISSION_CATEGORY as FEES,
  SUPPLIES_CATEGORY as SUPPLIES,
  getSourceForecastWindow,
  getProjectionForecastWindow,
} from '@/lib/piProjection.ts';
import {
  addProjectionExpense,
  changeProjectionHistoryMonths,
  editProjectionExpense,
  getHistoricalExpenseRows,
  removeProjectionExpense,
  restoreHistoricalExpense,
  setHistoricalExpenseOverride,
  validateExpenseInputs,
  validateProjectionExpenses,
  type ExpenseInputs,
  type ExpenseOperationResult,
} from '@/lib/projectionExpenses.ts';
import {
  createProjectionSession,
  isProjectionDirty,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

const TRAVEL = '06 - Travel';
const inputs: ExpenseInputs = {
  amount: 310.123_456,
  description: 'Research supplies',
  endMonth: null,
  expenditureCategory: SUPPLIES,
  kind: 'Monthly',
  startMonth: '2026-01-01',
};

function applied<T extends ProjectionDraft>(result: ExpenseOperationResult<T>) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.session;
}

function session() {
  const plan = createSalaryExample();
  plan.content.appointments = [];
  plan.content.fundingSources[0].capturedAt = '2026-01-16T00:00:00Z';
  plan.content.fundingSources[0].runRates = [
    {
      expenditureCategory: SUPPLIES,
      historyMonths: 3,
      monthlyAmount: 310.123_456,
    },
    { expenditureCategory: SUPPLIES, historyMonths: 6, monthlyAmount: 620 },
    { expenditureCategory: TRAVEL, historyMonths: 12, monthlyAmount: -120 },
    { expenditureCategory: FEES, historyMonths: 3, monthlyAmount: 0 },
  ];
  return createProjectionSession(plan);
}

describe('historical expense assumptions', () => {
  it('never generates personnel or equipment estimates from captured history', () => {
    const current = session();
    const source = current.draft.content.fundingSources[0];
    source.runRates = ['01 - Salaries', '02 - Fringe', '04 - Equipment'].map(
      (expenditureCategory) => ({
        expenditureCategory,
        historyMonths: 3,
        monthlyAmount: 1000,
      })
    );
    expect(getHistoricalExpenseRows(source, 3)).toEqual([]);
    expect(
      computePiProjection(current.draft).rows.every(
        (row) => row.projectedAmount === 0
      )
    ).toBe(true);
  });

  it('uses a stable union of captured categories and overrides with exact precision and missing-window zero', () => {
    const current = session();
    current.draft.content.fundingSources[0].historicalExpenseOverrides = [
      { amount: -45.123_456, expenditureCategory: '07 - Services' },
    ];
    expect(
      getHistoricalExpenseRows(current.draft.content.fundingSources[0], 3)
    ).toEqual([
      {
        baselineAmount: 310.123_456,
        effectiveAmount: 310.123_456,
        expenditureCategory: SUPPLIES,
        overrideAmount: null,
      },
      {
        baselineAmount: 0,
        effectiveAmount: 0,
        expenditureCategory: TRAVEL,
        overrideAmount: null,
      },
      {
        baselineAmount: 0,
        effectiveAmount: -45.123_456,
        expenditureCategory: '07 - Services',
        overrideAmount: -45.123_456,
      },
      {
        baselineAmount: 0,
        effectiveAmount: 0,
        expenditureCategory: FEES,
        overrideAmount: null,
      },
    ]);
  });

  it('applies an untouched value without pinning it or changing revision, while a history change uses captured data', () => {
    const original = session();
    expect(
      applied(setHistoricalExpenseOverride(original, 1, SUPPLIES, 310.123_456))
    ).toBe(original);
    expect(applied(changeProjectionHistoryMonths(original, 3))).toBe(original);
    const changed = applied(changeProjectionHistoryMonths(original, 6));
    expect(changed.revision).toBe(1);
    expect(changed.draft.content.fundingSources).toBe(
      original.draft.content.fundingSources
    );
    expect(
      getHistoricalExpenseRows(changed.draft.content.fundingSources[0], 6)[0]
        .effectiveAmount
    ).toBe(620);
    expect(original.draft.content.historyMonths).toBe(3);
    expect(
      isProjectionDirty(applied(changeProjectionHistoryMonths(changed, 3)))
    ).toBe(false);
  });

  it('retains signed and zero overrides across windows, including an override matching the new baseline', () => {
    const original = session();
    let changed = applied(
      setHistoricalExpenseOverride(original, 1, SUPPLIES, 620)
    );
    changed = applied(changeProjectionHistoryMonths(changed, 6));
    expect(
      getHistoricalExpenseRows(changed.draft.content.fundingSources[0], 6)[0]
    ).toMatchObject({ baselineAmount: 620, overrideAmount: 620 });
    changed = applied(setHistoricalExpenseOverride(changed, 1, SUPPLIES, 0));
    changed = applied(setHistoricalExpenseOverride(changed, 1, TRAVEL, -55));
    changed = applied(changeProjectionHistoryMonths(changed, 12));
    expect(
      changed.draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([
      { amount: 0, expenditureCategory: SUPPLIES },
      { amount: -55, expenditureCategory: TRAVEL },
    ]);
    expect(
      original.draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([]);
    expect(changed.draft.content.fundingSources[0].runRates).toBe(
      original.draft.content.fundingSources[0].runRates
    );
  });

  it('can explicitly turn off an absent or zero baseline without making an untouched Apply an override', () => {
    const original = session();
    expect(applied(setHistoricalExpenseOverride(original, 1, TRAVEL, 0))).toBe(
      original
    );
    const off = applied(
      setHistoricalExpenseOverride(original, 1, TRAVEL, 0, { force: true })
    );
    expect(
      applied(setHistoricalExpenseOverride(off, 1, TRAVEL, 0, { force: true }))
    ).toBe(off);
    const changed = applied(changeProjectionHistoryMonths(off, 12));
    expect(
      getHistoricalExpenseRows(
        changed.draft.content.fundingSources[0],
        12
      ).find((row) => row.expenditureCategory === TRAVEL)
    ).toMatchObject({
      baselineAmount: -120,
      effectiveAmount: 0,
      overrideAmount: 0,
    });
    const restored = applied(restoreHistoricalExpense(changed, 1, TRAVEL));
    expect(
      getHistoricalExpenseRows(
        restored.draft.content.fundingSources[0],
        12
      ).find((row) => row.expenditureCategory === TRAVEL)?.effectiveAmount
    ).toBe(-120);
    expect(applied(restoreHistoricalExpense(restored, 1, TRAVEL))).toBe(
      restored
    );
  });
});

describe('explicit expense operations', () => {
  it('adds, edits, and removes source-local rows without changing captured balances, staff, or historical assumptions', () => {
    const original = session();
    const added = applied(
      addProjectionExpense(original, 1, {
        ...inputs,
        description: '  Research supplies  ',
      })
    );
    expect(added.draft.content.fundingSources[0].expenses).toEqual([
      { ...inputs, id: 1 },
    ]);
    expect(original.draft.content.fundingSources[0].expenses).toEqual([]);
    expect(added.draft.content.fundingSources[1]).toBe(
      original.draft.content.fundingSources[1]
    );
    expect(added.draft.content.appointments).toBe(
      original.draft.content.appointments
    );
    for (const key of [
      'actuals',
      'budgets',
      'runRates',
      'historicalExpenseOverrides',
    ] as const) {
      expect(added.draft.content.fundingSources[0][key]).toBe(
        original.draft.content.fundingSources[0][key]
      );
    }
    expect(applied(editProjectionExpense(added, 1, 1, inputs))).toBe(added);
    const edited = applied(
      editProjectionExpense(added, 1, 1, {
        ...inputs,
        amount: -50,
        kind: 'OneTime',
      })
    );
    expect(edited.draft.content.fundingSources[0].expenses[0]).toMatchObject({
      amount: -50,
      id: 1,
      kind: 'OneTime',
    });
    const removed = applied(removeProjectionExpense(edited, 1, 1));
    expect(isProjectionDirty(removed)).toBe(false);
    expect(removed.revision).toBe(3);
    expect(
      applied(addProjectionExpense(removed, 1, inputs)).draft.content
        .fundingSources[0].expenses[0].id
    ).toBe(1);
  });

  it('allocates IDs from only the current source and permits zero and out-of-forecast dates', () => {
    const original = session();
    original.draft.content.fundingSources[0].expenses = [{ ...inputs, id: 8 }];
    const changed = applied(
      addProjectionExpense(original, 2, {
        ...inputs,
        amount: 0,
        startMonth: '2050-01-01',
      })
    );
    expect(changed.draft.content.fundingSources[1].expenses[0].id).toBe(1);
    expect(validateProjectionExpenses(changed.draft)).toBeNull();
    expect(
      computeExpenseForecast(
        changed.draft.content.fundingSources[1],
        changed.draft.content.fundingSources[1].expenses[0],
        getProjectionForecastWindow(changed.draft)
      ).hasEligibleDates
    ).toBe(false);
  });

  it('rejects missing targets without changing session state', () => {
    const original = session();
    for (const result of [
      addProjectionExpense(original, 999, inputs),
      editProjectionExpense(original, 1, 999, inputs),
      removeProjectionExpense(original, 1, 999),
      setHistoricalExpenseOverride(original, 1, '99 - Missing', 10),
    ]) {
      expect(result.ok).toBe(false);
    }
    expect(original.revision).toBe(0);
  });

  it.each([
    { description: '' },
    { expenditureCategory: '' },
    { expenditureCategory: '01 - Salaries and Wages' },
    { expenditureCategory: '02 - Fringe Benefits' },
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    { startMonth: '2026-13-01' },
    { startMonth: '0000-01-01' },
    { startMonth: '2026-01-02' },
    { endMonth: '2025-12-01' },
    { endMonth: '2026-02-02' },
    { endMonth: '2026-02-01', kind: 'OneTime' as const },
  ])('requires complete valid manual inputs: %s', (invalid) => {
    expect(validateExpenseInputs({ ...inputs, ...invalid })).not.toBeNull();
  });

  it('validates each source identity and override category independently', () => {
    const original = session();
    original.draft.content.fundingSources[0].expenses = [
      { ...inputs, id: 1 },
      { ...inputs, id: 1 },
    ];
    expect(validateProjectionExpenses(original.draft)).toContain(
      'unique positive ID'
    );
    original.draft.content.fundingSources[0].expenses = [
      { ...inputs, id: 2_147_483_647 },
    ];
    expect(addProjectionExpense(original, 1, inputs).ok).toBe(false);
    original.draft.content.fundingSources[0].expenses = [];
    for (const expenditureCategory of [
      '01 - Salaries',
      '02 - Fringe',
      '04 - Equipment',
    ]) {
      original.draft.content.fundingSources[0].historicalExpenseOverrides = [
        { amount: 0, expenditureCategory },
      ];
      expect(validateProjectionExpenses(original.draft)).not.toBeNull();
    }
    original.draft.content.fundingSources[0].historicalExpenseOverrides = [
      { amount: 0, expenditureCategory: SUPPLIES },
      { amount: 10, expenditureCategory: ` ${SUPPLIES} ` },
    ];
    expect(validateProjectionExpenses(original.draft)).not.toBeNull();
    expect(changeProjectionHistoryMonths(original, 4).ok).toBe(false);
    expect(
      validateExpenseInputs({
        ...inputs,
        amount: -100,
        endMonth: '9999-12-01',
        expenditureCategory: '04 - Equipment',
        startMonth: '0001-01-01',
      })
    ).toBeNull();
  });
});

describe('shared expense impact calculations', () => {
  it('uses each source capture and planned start within the fixed plan horizon', () => {
    const source = session().draft.content.fundingSources[0];
    expect(
      getSourceForecastWindow(
        source,
        getProjectionForecastWindow(session().draft)
      )
    ).toEqual({
      endMonth: '2026-06',
      isBeyondForecast: false,
      startMonth: '2026-01',
    });
    const planned = {
      ...source,
      endDate: null,
      sourceKind: 'Planned' as const,
      startDate: '2026-07-15',
    };
    expect(
      getSourceForecastWindow(
        planned,
        getProjectionForecastWindow(session().draft)
      )
    ).toEqual({
      endMonth: '2026-12',
      isBeyondForecast: false,
      startMonth: '2026-07',
    });
    const forecast = computeExpenseForecast(
      planned,
      {
        ...inputs,
        amount: 310,
      },
      getProjectionForecastWindow(session().draft)
    );
    expect(forecast.months).toHaveLength(6);
    expect(forecast.months[0]).toEqual({ amount: 170, month: '2026-07' });
  });

  it('reports eligible dates at zero, preserves one-time capture-month behavior, and distinguishes no dates', () => {
    const source = session().draft.content.fundingSources[0];
    expect(
      computeExpenseForecast(
        source,
        { ...inputs, amount: 0 },
        getProjectionForecastWindow(session().draft)
      )
    ).toMatchObject({ hasEligibleDates: true, total: 0 });
    const ended = { ...source, endDate: '2026-01-10' };
    expect(
      computeExpenseForecast(
        ended,
        { ...inputs, amount: 310 },
        getProjectionForecastWindow(session().draft)
      )
    ).toEqual({
      hasEligibleDates: false,
      months: [],
      total: 0,
    });
    expect(
      computeExpenseForecast(
        ended,
        {
          ...inputs,
          amount: -310,
          kind: 'OneTime',
        },
        getProjectionForecastWindow(session().draft)
      )
    ).toEqual({
      hasEligibleDates: true,
      months: [{ amount: -310, month: '2026-01' }],
      total: -310,
    });
  });

  it('makes per-entry totals agree with the full forecast for historical and explicit signed costs', () => {
    let current = session();
    current = applied(setHistoricalExpenseOverride(current, 1, SUPPLIES, -310));
    current = applied(
      addProjectionExpense(current, 1, { ...inputs, amount: 62 })
    );
    current = applied(
      addProjectionExpense(current, 1, {
        ...inputs,
        amount: -100,
        kind: 'OneTime',
        startMonth: '2026-03-01',
      })
    );
    const source = current.draft.content.fundingSources[0];
    const entries = [
      ...source.expenses,
      ...getHistoricalExpenseRows(
        source,
        current.draft.content.historyMonths
      ).map((row) => ({
        amount: row.effectiveAmount,
        endMonth: null,
        kind: 'Monthly' as const,
        startMonth: null,
      })),
    ].map((entry) =>
      computeExpenseForecast(
        source,
        entry,
        getProjectionForecastWindow(current.draft)
      )
    );
    const rows = computePiProjection(current.draft).rows.filter(
      (row) => row.fundingSourceId === 1
    );
    expect(rows.reduce((sum, row) => sum + row.projectedAmount, 0)).toBeCloseTo(
      entries.reduce((sum, entry) => sum + entry.total, 0)
    );
    expect(
      rows.find(
        (row) => row.expenditureCategory === SUPPLIES && row.month === '2026-01'
      )?.projectedAmount
    ).toBe(-120);
    expect(source.actuals).toEqual(
      session().draft.content.fundingSources[0].actuals
    );
  });
});
