import { describe, expect, it } from 'vitest';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import {
  createBookedSalaryExample,
  createSalaryExample,
} from '@/test/fixtures/projections.ts';

const components = [
  ['salary', SALARY_CATEGORY],
  ['fringe', FRINGE_CATEGORY],
  ['fees', FEE_REMISSION_CATEGORY],
] as const;

describe('staff cost worksheet facts', () => {
  it('omits capture adjustments before a planned source becomes available', () => {
    const plan = createSalaryExample();
    plan.content.fundingSources = [plan.content.fundingSources[0]];
    const source = plan.content.fundingSources[0];
    source.sourceKind = 'Planned';
    source.startDate = '2026-03-01';
    source.actuals = [
      {
        amount: -200,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
    ];
    const result = computePiProjection(plan);
    expect(result.rows.every(({ month }) => month >= '2026-03')).toBe(true);
    expect(
      result.appointmentCosts.every(({ month }) => month >= '2026-03')
    ).toBe(true);
    expect(result.personnelAdjustments).toEqual([]);
  });

  it('separates appointment estimates, booked reconciliation, and added personnel expenses', () => {
    const plan = createBookedSalaryExample();
    const first = plan.content.appointments[0];
    first.feeRemissionMonthly = 600;
    plan.content.appointments.push({ ...structuredClone(first), id: 102 });
    const beforeExpenses = computePiProjection(plan);
    for (const source of plan.content.fundingSources) {
      source.expenses = components.map(([, expenditureCategory], id) => ({
        amount: 123,
        description: 'Separate planned personnel cost',
        endMonth: null,
        expenditureCategory,
        id,
        kind: 'OneTime',
        startMonth: '2026-01-01',
      }));
    }
    const result = computePiProjection(plan);
    expect(result.appointmentCosts).toEqual(beforeExpenses.appointmentCosts);
    expect(result.personnelAdjustments).toEqual(
      beforeExpenses.personnelAdjustments
    );
    expect(result.appointmentCosts[0]).toEqual({
      appointmentId: 101,
      fees: 300,
      fringe: 1000,
      fundingSourceId: 1,
      month: '2026-01',
      salary: 2500,
    });
    expect(result.personnelAdjustments).toEqual(
      [1, 2].map((fundingSourceId) => ({
        fringe: -400,
        fundingSourceId,
        month: '2026-01',
        salary: -1000,
      }))
    );
    for (const row of result.rows) {
      const component = components.find(
        ([, category]) => category === row.expenditureCategory
      )?.[0];
      if (!component) {
        continue;
      }
      const estimate = result.appointmentCosts
        .filter(
          (cost) =>
            cost.fundingSourceId === row.fundingSourceId &&
            cost.month === row.month
        )
        .reduce((sum, cost) => sum + cost[component], 0);
      const adjustment = result.personnelAdjustments.find(
        (cost) =>
          cost.fundingSourceId === row.fundingSourceId &&
          cost.month === row.month
      );
      expect(row.projectedAmount).toBeCloseTo(
        estimate +
          (component === 'fees' ? 0 : (adjustment?.[component] ?? 0)) +
          (row.month === '2026-01' ? 123 : 0)
      );
    }
  });

  it('coalesces repeated source allocations and preserves daily proration, FTE, rates, and COLA', () => {
    const plan = createSalaryExample();
    plan.content.fundingSources = [plan.content.fundingSources[0]];
    plan.content.fundingSources[0].endDate = '2026-07-25';
    Object.assign(plan.content.appointments[0], {
      allocations: [0.2, 0.3].map((percent) => ({
        endDate: '2026-07-20',
        fundingSourceId: 1,
        percent,
        startDate: '2026-07-05',
      })),
      cbrRate: 0.3,
      colaRate: 0.1,
      endDate: '2026-07-31',
      feeRemissionMonthly: 620,
      startDate: '2026-07-10',
      vacationAccrualRate: 0.1,
    });
    const result = computePiProjection(plan);
    expect(result.appointmentCosts).toHaveLength(1);
    const cost = result.appointmentCosts[0];
    expect(cost.salary).toBeCloseTo((10_000 * 0.5 * 1.1 * 0.5 * 11) / 31);
    expect(cost.fringe).toBeCloseTo(cost.salary * 0.4);
    expect(cost.fees).toBeCloseTo((620 * 0.5 * 11) / 31);
    for (const [component, category] of components) {
      expect(
        result.rows.find(
          (row) =>
            row.month === cost.month && row.expenditureCategory === category
        )?.projectedAmount
      ).toBeCloseTo(cost[component]);
    }
  });

  it('preserves fees with zero salary and FTE without netting category 08 actuals', () => {
    const plan = createSalaryExample();
    Object.assign(plan.content.appointments[0], {
      feeRemissionMonthly: 600,
      fte: 0,
      monthlySalary: 0,
    });
    plan.content.fundingSources[0].actuals.push({
      amount: 900,
      expenditureCategory: FEE_REMISSION_CATEGORY,
      month: '2026-01-01',
    });
    const result = computePiProjection(plan);
    expect(result.appointmentCosts[0]).toMatchObject({
      fees: 300,
      fringe: 0,
      salary: 0,
    });
    expect(result.personnelAdjustments).toEqual([]);
    expect(
      result.rows.find(
        (row) =>
          row.fundingSourceId === 1 &&
          row.month === '2026-01' &&
          row.expenditureCategory === FEE_REMISSION_CATEGORY
      )?.projectedAmount
    ).toBe(300);
  });

  it('exposes capture credits after source expiry with no active appointment', () => {
    const plan = createSalaryExample();
    plan.content.appointments = [];
    plan.content.fundingSources = [plan.content.fundingSources[0]];
    const source = plan.content.fundingSources[0];
    source.endDate = '2025-12-31';
    source.actuals = [
      {
        amount: -200,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
      {
        amount: -80,
        expenditureCategory: FRINGE_CATEGORY,
        month: '2026-01-01',
      },
    ];
    const result = computePiProjection(plan);
    expect(result.appointmentCosts).toEqual([]);
    expect(result.personnelAdjustments).toEqual([
      { fringe: 80, fundingSourceId: 1, month: '2026-01', salary: 200 },
    ]);
    expect(
      result.rows.find(
        (row) =>
          row.month === '2026-01' && row.expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe(200);
  });

  it('omits pre-capture estimates for later sources and caps reconciliation at the estimate', () => {
    const plan = createSalaryExample();
    const source = plan.content.fundingSources[1];
    source.capturedAt = '2026-03-16T00:00:00Z';
    source.actuals = [
      {
        amount: 9000,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-03-01',
      },
    ];
    const result = computePiProjection(plan);
    expect(
      result.appointmentCosts.filter(
        (cost) => cost.fundingSourceId === 2 && cost.month < '2026-03'
      )
    ).toEqual([]);
    expect(
      result.appointmentCosts.find(
        (cost) => cost.fundingSourceId === 2 && cost.month === '2026-03'
      )?.salary
    ).toBe(2500);
    expect(result.personnelAdjustments).toEqual([
      { fringe: 0, fundingSourceId: 2, month: '2026-03', salary: -2500 },
    ]);
    expect(
      result.rows.find(
        (row) =>
          row.fundingSourceId === 2 &&
          row.month === '2026-03' &&
          row.expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe(0);
  });
});
