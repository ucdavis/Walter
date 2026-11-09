import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import {
  computePiProjection,
  EQUIPMENT_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import { addPlannedSource } from '@/lib/projectionSources.ts';
import {
  createProjectionSession,
  getFundingSourceOutlook,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

function capturedTask(id: number, capturedAt: string): ProjectionFundingSource {
  const source = createSalaryExample().content.fundingSources[0];
  return {
    ...source,
    actuals: [
      {
        amount: 2000,
        expenditureCategory: SALARY_CATEGORY,
        month: `${capturedAt.slice(0, 7)}-01`,
      },
    ],
    budgets: [
      {
        budget: 52_000,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        spentToDate: 2000,
      },
    ],
    capturedAt,
    capturedEndDate: '2026-12-31',
    capturedStartDate: '2026-01-01',
    endDate: '2026-12-31',
    id,
    projectNumber: 'P1',
    sourceKind: 'Task',
    startDate: '2026-01-01',
    taskNumber: `T${id}`,
  };
}

describe('independent funding source captures', () => {
  it('nets the added November task against its own booked salary while preserving the October source', () => {
    const plan = createSalaryExample();
    plan.seededAt = '2026-10-16T00:00:00Z';
    const old = capturedTask(1, plan.seededAt);
    plan.content.fundingSources = [old];
    Object.assign(plan.content.appointments[0], {
      allocations: [1, 2].map((fundingSourceId) => ({
        endDate: null,
        fundingSourceId,
        percent: 0.5,
        startDate: '2026-11-01',
      })),
      endDate: '2026-12-31',
      fte: 1,
      monthlySalary: 10_000,
      startDate: '2026-11-01',
    });
    const before = getFundingSourceOutlook(computePiProjection(plan).rows, 1);
    plan.content.fundingSources.push(capturedTask(2, '2026-11-16T00:00:00Z'));
    const results = computePiProjection(plan);
    expect(getFundingSourceOutlook(results.rows, 1)).toEqual(before);
    expect(getFundingSourceOutlook(results.rows, 2)[0]).toEqual({
      actual: 2000,
      forecast: 3000,
      month: '2026-11',
      remaining: 47_000,
    });
    expect(
      getFundingSourceOutlook(results.rows, 1).find(
        ({ month }) => month === '2026-11'
      )
    ).toMatchObject({ forecast: 5000, remaining: 45_000 });
    expect(plan.content.fundingSources[1].actuals[0].amount).toBe(2000);
  });

  it('prorates recurring costs after each source capture day and preserves whole one-time costs', () => {
    const plan = createSalaryExample();
    plan.seededAt = '2026-10-16T00:00:00Z';
    plan.content.appointments = [];
    plan.content.fundingSources = [
      capturedTask(1, plan.seededAt),
      capturedTask(2, '2026-11-16T00:00:00Z'),
    ];
    for (const source of plan.content.fundingSources) {
      source.runRates = [
        {
          expenditureCategory: SUPPLIES_CATEGORY,
          historyMonths: 3,
          monthlyAmount: 310,
        },
      ];
    }
    plan.content.fundingSources[1].expenses.push({
      amount: 1000,
      description: 'Example expense',
      endMonth: null,
      expenditureCategory: EQUIPMENT_CATEGORY,
      id: 1,
      kind: 'OneTime',
      startMonth: '2026-11-01',
    });
    const results = computePiProjection(plan);
    expect(getFundingSourceOutlook(results.rows, 1)[0].forecast).toBe(150);
    expect(getFundingSourceOutlook(results.rows, 2)[0].forecast).toBeCloseTo(
      1000 + (310 * 14) / 30
    );
    expect(
      results.rows.filter(
        ({ fundingSourceId, month }) =>
          fundingSourceId === 2 && month === '2026-10'
      )
    ).toEqual([]);
  });

  it('keeps an existing employee COLA based on the original plan date when a later source is added', () => {
    const plan = createSalaryExample();
    plan.seededAt = '2026-06-16T00:00:00Z';
    const source = capturedTask(1, '2026-08-16T00:00:00Z');
    source.actuals = [];
    plan.content.fundingSources = [source];
    Object.assign(plan.content.appointments[0], {
      allocations: [
        {
          endDate: null,
          fundingSourceId: 1,
          percent: 1,
          startDate: null,
        },
      ],
      colaRate: 0.03,
      endDate: '2026-12-31',
      fte: 1,
      startDate: '2026-01-01',
    });
    expect(
      getFundingSourceOutlook(computePiProjection(plan).rows, 1)[0].forecast
    ).toBe(10_300);
  });

  it('makes the entire planned amount available at its start, with no earlier balance or costs', () => {
    const plan = createSalaryExample();
    plan.seededAt = '2026-01-16T00:00:00Z';
    plan.content.appointments = [];
    plan.content.fundingSources = [];
    const added = addPlannedSource(createProjectionSession(plan), {
      balance: 100_000,
      endDate: '2026-12-31',
      name: 'Future funding',
      startDate: '2026-07-15',
    });
    if (!added.ok) {
      throw new Error(added.error);
    }
    const source = added.session.draft.content.fundingSources[0];
    source.expenses = [
      {
        amount: 310,
        description: 'Example expense',
        endMonth: null,
        expenditureCategory: SUPPLIES_CATEGORY,
        id: 1,
        kind: 'Monthly',
        startMonth: '2026-01-01',
      },
    ];
    const result = computePiProjection(added.session.draft);
    expect(result.rows.filter(({ month }) => month < '2026-07')).toEqual([]);
    expect(getFundingSourceOutlook(result.rows, source.id)[0]).toEqual({
      actual: 0,
      forecast: 170,
      month: '2026-07',
      remaining: 99_830,
    });
  });

  it('adds the planning adjustment once without changing category budgets or other source forecasts', () => {
    const plan = createSalaryExample();
    const before = computePiProjection(plan);
    const captured = structuredClone(plan.content.fundingSources[0].budgets);
    plan.content.fundingSources[0].balanceAdjustment = -5000;
    const after = computePiProjection(plan);
    expect(
      getFundingSourceOutlook(after.rows, 1).map(({ remaining }) => remaining)
    ).toEqual(
      getFundingSourceOutlook(before.rows, 1).map(
        ({ remaining }) => remaining - 5000
      )
    );
    expect(plan.content.fundingSources[0].budgets).toEqual(captured);
    expect(getFundingSourceOutlook(after.rows, 2)).toEqual(
      getFundingSourceOutlook(before.rows, 2)
    );
    plan.content.fundingSources[0].balanceAdjustment = 0;
    expect(computePiProjection(plan)).toEqual(before);
  });
});
