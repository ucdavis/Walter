import { describe, expect, it } from 'vitest';
import {
  getSourceFundingBasis,
  hasSourceCategoryBudget,
  updateSourceBudget,
  type SourceBudgetChange,
} from '@/lib/projectionBudgets.ts';
import {
  addPlannedSource,
  editProjectionSource,
  sourcePlanningBalance,
} from '@/lib/projectionSources.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import {
  buildSourceFundingBalance,
  getAppointmentFundingShortfalls,
  buildSourceFundingBalances,
} from '@/lib/projectionFundingBalances.ts';
import {
  computePiProjection,
  SALARY_CATEGORY,
  FRINGE_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

const categories = [
  SALARY_CATEGORY,
  FRINGE_CATEGORY,
  SUPPLIES_CATEGORY,
  '09 - Indirect Costs',
];
const plan = () => {
  const value = createSalaryExample();
  value.content.fundingSources[0].projectType = 'Sponsored';
  value.content.fundingSources[0].budgets.push({
    budget: 5000,
    committed: 50,
    expenditureCategory: FRINGE_CATEGORY,
    spentToDate: 100,
  });
  return value;
};
const update = (
  source: ProjectionFundingSource,
  change: SourceBudgetChange
) => {
  const result = updateSourceBudget(source, change, categories);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.source;
};

const costs = (value: ReturnType<typeof computePiProjection>) =>
  value.rows.map(({ remaining: _, ...row }) => row);

describe('scenario category budgets', () => {
  it('moves budget without changing total, captured financials, or any forecast costs', () => {
    const original = plan();
    const before = structuredClone(original);
    const source = original.content.fundingSources[0];
    const moved = update(source, {
      amount: 1234.56,
      from: SALARY_CATEGORY,
      kind: 'move',
      to: FRINGE_CATEGORY,
    });
    const after = {
      ...original,
      content: {
        ...original.content,
        fundingSources: [moved, original.content.fundingSources[1]],
      },
    };
    expect(sourcePlanningBalance(moved)).toBe(sourcePlanningBalance(source));
    expect(moved.budgets).toEqual(source.budgets);
    expect(moved.actuals).toEqual(source.actuals);
    expect(costs(computePiProjection(after))).toEqual(
      costs(computePiProjection(before))
    );
    expect(after.content.appointments).toEqual(before.content.appointments);
    expect(original).toEqual(before);
    const balances = buildSourceFundingBalance(
      moved,
      computePiProjection(after).rows
    );
    expect(
      balances.categories.find(
        ({ expenditureCategory }) => expenditureCategory === SALARY_CATEGORY
      )
    ).toMatchObject({
      adjustment: -1234.56,
      capturedAvailable: 20_000,
      revisedAvailable: 18_765.44,
    });
    expect(
      balances.categories.find(
        ({ expenditureCategory }) => expenditureCategory === FRINGE_CATEGORY
      )
    ).toMatchObject({
      adjustment: 1234.56,
      capturedAvailable: 4850,
    });
    expect(
      balances.categories.find(
        ({ expenditureCategory }) => expenditureCategory === FRINGE_CATEGORY
      )?.revisedAvailable
    ).toBeCloseTo(6084.56, 8);
  });

  it('adjusts a chosen category exactly once, allows a negative total, and adds no companion costs or budgets', () => {
    const original = plan();
    const source = original.content.fundingSources[0];
    const adjusted = update(source, {
      amount: -30_000,
      expenditureCategory: SALARY_CATEGORY,
      kind: 'adjust',
    });
    expect(sourcePlanningBalance(adjusted)).toBe(
      sourcePlanningBalance(source) - 30_000
    );
    expect(adjusted.categoryAdjustments).toEqual([
      { amount: -30_000, expenditureCategory: SALARY_CATEGORY },
    ]);
    const after = {
      ...original,
      content: {
        ...original.content,
        fundingSources: [adjusted, original.content.fundingSources[1]],
      },
    };
    const results = computePiProjection(after);
    expect(costs(results)).toEqual(costs(computePiProjection(original)));
    expect(
      buildSourceFundingBalance(adjusted, results.rows).categories.reduce(
        (sum, row) => sum + row.revisedAvailable,
        0
      )
    ).toBe(sourcePlanningBalance(adjusted));
  });

  it('rounds net cent arithmetic so reversed existing-category changes restore the original definition', () => {
    const source = plan().content.fundingSources[0];
    let changed = update(source, {
      amount: 0.1,
      from: SALARY_CATEGORY,
      kind: 'move',
      to: FRINGE_CATEGORY,
    });
    changed = update(changed, {
      amount: 0.2,
      from: SALARY_CATEGORY,
      kind: 'move',
      to: FRINGE_CATEGORY,
    });
    changed = update(changed, {
      amount: 0.3,
      from: FRINGE_CATEGORY,
      kind: 'move',
      to: SALARY_CATEGORY,
    });
    expect(changed).toEqual(source);
    expect(changed.categoryAdjustments).toEqual([]);
  });

  it('retains an explicit zero for an introduced category and clears missing-budget warnings without hiding a deficit', () => {
    const original = plan();
    const source = original.content.fundingSources[0];
    source.budgets = source.budgets.filter(
      ({ expenditureCategory }) => expenditureCategory !== SALARY_CATEGORY
    );
    const defined = update(source, {
      amount: 0,
      expenditureCategory: SALARY_CATEGORY,
      kind: 'adjust',
    });
    expect(hasSourceCategoryBudget(source, SALARY_CATEGORY)).toBe(false);
    expect(hasSourceCategoryBudget(defined, SALARY_CATEGORY)).toBe(true);
    expect(defined.categoryAdjustments).toEqual([
      { amount: 0, expenditureCategory: SALARY_CATEGORY },
    ]);
    original.content.fundingSources[0] = defined;
    const results = computePiProjection(original);
    const balance = buildSourceFundingBalance(defined, results.rows);
    expect(
      balance.categories.find(
        ({ expenditureCategory }) => expenditureCategory === SALARY_CATEGORY
      )
    ).toMatchObject({
      budgetRecorded: false,
      capturedAvailable: 0,
      hasBudget: true,
      revisedAvailable: 0,
    });
    const warnings = getAppointmentFundingShortfalls(
      results.appointmentFunding,
      buildSourceFundingBalances(original.content.fundingSources, results.rows)
    );
    expect(warnings[0].personnelDeficits[0]).toMatchObject({
      category: 'salary',
      missingBudget: false,
    });
    expect(warnings[0].personnelDeficits[0].remaining).toBeLessThan(0);
    expect(
      hasSourceCategoryBudget(
        update(defined, { kind: 'reset' }),
        SALARY_CATEGORY
      )
    ).toBe(false);
  });

  it.each([
    { amount: 1.125, from: SALARY_CATEGORY, kind: 'move', to: FRINGE_CATEGORY },
    { amount: 0.001, from: SALARY_CATEGORY, kind: 'move', to: FRINGE_CATEGORY },
    { amount: 10, from: SALARY_CATEGORY, kind: 'move', to: SALARY_CATEGORY },
    { amount: -1, from: SALARY_CATEGORY, kind: 'move', to: FRINGE_CATEGORY },
    { amount: 10, expenditureCategory: 'Free text', kind: 'adjust' },
    {
      amount: Number.POSITIVE_INFINITY,
      expenditureCategory: SALARY_CATEGORY,
      kind: 'adjust',
    },
  ] as SourceBudgetChange[])(
    'rejects invalid changes atomically: %j',
    (change) => {
      const source = plan().content.fundingSources[0];
      const before = structuredClone(source);
      expect(updateSourceBudget(source, change, categories).ok).toBe(false);
      expect(source).toEqual(before);
    }
  );

  it('forbids direct total changes for category sources while allowing metadata and category deltas', () => {
    const session = createProjectionSession(plan());
    const source = session.draft.content.fundingSources[0];
    const inputs = {
      balance: sourcePlanningBalance(source) + 1,
      endDate: source.endDate,
      name: 'Changed name',
      startDate: source.startDate,
    };
    expect(
      editProjectionSource(session, source.id, inputs, categories).ok
    ).toBe(false);
    const adjusted = update(source, {
      amount: 50,
      expenditureCategory: SALARY_CATEGORY,
      kind: 'adjust',
    });
    const result = editProjectionSource(
      session,
      source.id,
      {
        ...inputs,
        balance: sourcePlanningBalance(adjusted),
        categoryAdjustments: adjusted.categoryAdjustments,
      },
      categories
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const saved = result.session.draft.content.fundingSources[0];
      expect(saved.budgets).toEqual(source.budgets);
      expect(saved.projectType).toBe('Sponsored');
      expect(saved.balanceAdjustment).toBe(0);
      expect(saved.name).toBe('Changed name');
    }
  });

  it('creates fixed planned baselines and resets edits back to the original pool or category definition', () => {
    const session = createProjectionSession(plan());
    for (const mode of ['GeneralPool', 'Categories'] as const) {
      const initialCategoryBudgets =
        mode === 'Categories'
          ? [
              { amount: 100, expenditureCategory: SALARY_CATEGORY },
              { amount: 300, expenditureCategory: FRINGE_CATEGORY },
            ]
          : [];
      const result = addPlannedSource(
        session,
        {
          balance: 400,
          endDate: null,
          initialCategoryBudgets,
          name: 'Planned',
          plannedBudgetMode: mode,
          startDate: '2026-07-01',
        },
        categories
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      const source = result.session.draft.content.fundingSources.at(-1)!;
      expect(sourcePlanningBalance(source)).toBe(400);
      expect(source.balanceAdjustment).toBe(0);
      expect(source.plannedBudgetMode).toBe(mode);
      expect(getSourceFundingBasis(source)).toBe(
        mode === 'Categories' ? 'categories' : 'general'
      );
      const changed =
        mode === 'Categories'
          ? update(source, {
              amount: -500,
              expenditureCategory: SALARY_CATEGORY,
              kind: 'adjust',
            })
          : { ...source, balanceAdjustment: -500 };
      expect(sourcePlanningBalance(changed)).toBe(-100);
      const adjustedPlan = {
        ...result.session.draft,
        content: {
          ...result.session.draft.content,
          appointments: [],
          fundingSources: [changed],
        },
      };
      const adjustedBalance = buildSourceFundingBalance(
        changed,
        computePiProjection(adjustedPlan).rows
      );
      expect(adjustedBalance.months.get('2026-06')).toBeUndefined();
      expect(adjustedBalance.months.get('2026-07')?.remaining).toBe(-100);
      const reset = update(changed, { kind: 'reset' });
      expect(reset).toEqual(source);
      expect(sourcePlanningBalance(reset)).toBe(400);
      expect(reset.startDate).toBe('2026-07-01');
      expect(
        reset.budgets.every(
          ({ committed, spentToDate }) => spentToDate === 0 && committed === 0
        )
      ).toBe(true);
      const after = {
        ...result.session.draft,
        content: {
          ...result.session.draft.content,
          appointments: [],
          fundingSources: [reset],
        },
      };
      const balance = buildSourceFundingBalance(
        reset,
        computePiProjection(after).rows
      );
      expect(balance.months.get('2026-07')?.remaining).toBe(400);
    }
  });
});
