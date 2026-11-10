import { describe, expect, it } from 'vitest';
import {
  computePiProjection,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
  type PiProjectionRow,
} from '@/lib/piProjection.ts';
import {
  buildSourceFundingBalances,
  getAppointmentFundingShortfalls,
} from '@/lib/projectionFundingBalances.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

const row = (
  fundingSourceId: number,
  month: string,
  remaining: number,
  expenditureCategory = SALARY_CATEGORY
): PiProjectionRow => ({
  actualAmount: 0,
  expenditureCategory,
  fundingSourceId,
  kind: 'projected',
  month,
  projectedAmount: 0,
  remaining,
});

describe('staffing funding shortfalls', () => {
  it('uses source totals, excludes zero, and clears recovered months without pooling other sources', () => {
    const shortfalls = buildSourceFundingBalances([
      row(1, '2026-01', -100),
      row(1, '2026-01', 100, SUPPLIES_CATEGORY),
      row(1, '2026-02', -101),
      row(1, '2026-02', 100, SUPPLIES_CATEGORY),
      row(1, '2026-03', 50),
      row(2, '2026-02', 10_000),
    ]);
    expect([...shortfalls.get(1)!]).toEqual([
      ['2026-01', 0],
      ['2026-02', -1],
      ['2026-03', 50],
    ]);
    expect([...shortfalls.get(2)!]).toEqual([['2026-02', 10_000]]);
    const months = ['2026-01', '2026-02', '2026-03'].map((month) => ({
      appointmentId: 1,
      fundedPercent: 1,
      hasGap: false,
      hasOverlap: false,
      month,
      shares: [
        { fundingSourceId: 1, percent: 0.25 },
        { fundingSourceId: 2, percent: 0.25 },
        { fundingSourceId: null, percent: 0.5 },
      ],
    }));
    expect(getAppointmentFundingShortfalls(months, shortfalls)).toEqual([
      { fundingSourceId: 1, month: '2026-02', remaining: -1 },
    ]);
    expect(
      getAppointmentFundingShortfalls(
        [{ ...months[1], shares: [{ fundingSourceId: 1, percent: 0 }] }],
        shortfalls
      )
    ).toEqual([]);
  });

  it('includes other appointments and added expenses without cutting off assigned salary', () => {
    const plan = createSalaryExample();
    const source = plan.content.fundingSources[0];
    source.budgets = [
      {
        budget: 10_000,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        spentToDate: 0,
      },
    ];
    source.actuals = [];
    source.expenses = [
      {
        amount: 6000,
        description: 'Equipment purchase',
        endMonth: null,
        expenditureCategory: SUPPLIES_CATEGORY,
        id: 1,
        kind: 'OneTime',
        startMonth: '2026-02-01',
      },
    ];
    plan.content.appointments.push({
      ...structuredClone(plan.content.appointments[0]),
      id: 102,
    });
    const results = computePiProjection(plan);
    const shortfalls = buildSourceFundingBalances(results.rows);
    for (const appointment of plan.content.appointments) {
      const warnings = getAppointmentFundingShortfalls(
        results.appointmentFunding.filter(
          ({ appointmentId }) => appointmentId === appointment.id
        ),
        shortfalls
      );
      expect(warnings[0]).toEqual({
        fundingSourceId: 1,
        month: '2026-02',
        remaining: -6000,
      });
    }
    expect(shortfalls.get(2)?.get('2026-02')).toBeGreaterThan(0);
    expect(
      results.rows.find(
        ({ expenditureCategory, fundingSourceId, month }) =>
          fundingSourceId === 1 &&
          month === '2026-03' &&
          expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe(5000);
    expect(
      results.appointmentFunding.find(({ month }) => month === '2026-03')
        ?.fundedPercent
    ).toBe(1);
  });
});
