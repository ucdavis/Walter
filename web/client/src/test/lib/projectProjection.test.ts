import { describe, expect, it } from 'vitest';
import {
  ALL_EXPENSES_SERIES,
  buildProjectionSeries,
  getMonthlyCategorySpend,
  getProjectionStats,
  NON_PERSONNEL_SERIES,
  PERSONNEL_SERIES,
} from '@/lib/projectProjection.ts';
import type {
  ProjectProjectionPeriod,
  ProjectProjectionResult,
} from '@/queries/projectProjection.ts';

const period = (
  overrides: Partial<ProjectProjectionPeriod>
): ProjectProjectionPeriod => ({
  actualAmount: 0,
  displayPeriod: 'Jun-26',
  expenditureCategory: '01 - Salaries and Wages',
  isPersonnel: 1,
  kind: 'projected',
  month: '2026-06',
  projectedAmount: 0,
  remaining: 0,
  ...overrides,
});

const sampleResult = (): ProjectProjectionResult => ({
  categories: [
    {
      budget: 500,
      committed: 0,
      expenditureCategory: '01 - Salaries and Wages',
      isPersonnel: 1,
      remainingNow: 400,
      spentToDate: 100,
    },
    {
      budget: 200,
      committed: 10,
      expenditureCategory: '02 - Fringe Benefits',
      isPersonnel: 1,
      remainingNow: 150,
      spentToDate: 40,
    },
    {
      budget: 100,
      committed: 0,
      expenditureCategory: '04 - Supplies',
      isPersonnel: 0,
      remainingNow: 80,
      spentToDate: 20,
    },
  ],
  periods: [
    // May = actual, Jun = blended, Jul = projected; one row per category per month.
    period({
      actualAmount: 50,
      displayPeriod: 'May-26',
      kind: 'actual',
      month: '2026-05',
      remaining: 400,
    }),
    period({
      actualAmount: 20,
      displayPeriod: 'May-26',
      expenditureCategory: '02 - Fringe Benefits',
      kind: 'actual',
      month: '2026-05',
      remaining: 150,
    }),
    period({
      actualAmount: 10,
      displayPeriod: 'May-26',
      expenditureCategory: '04 - Supplies',
      isPersonnel: 0,
      kind: 'actual',
      month: '2026-05',
      remaining: 80,
    }),
    period({ kind: 'blended', projectedAmount: 50, remaining: 350 }),
    period({
      expenditureCategory: '02 - Fringe Benefits',
      kind: 'blended',
      projectedAmount: 20,
      remaining: 130,
    }),
    period({
      actualAmount: 5,
      expenditureCategory: '04 - Supplies',
      isPersonnel: 0,
      kind: 'blended',
      projectedAmount: 5,
      remaining: 70,
    }),
    period({
      displayPeriod: 'Jul-26',
      month: '2026-07',
      projectedAmount: 50,
      remaining: 300,
    }),
    period({
      displayPeriod: 'Jul-26',
      expenditureCategory: '02 - Fringe Benefits',
      month: '2026-07',
      projectedAmount: 20,
      remaining: 110,
    }),
    period({
      displayPeriod: 'Jul-26',
      expenditureCategory: '04 - Supplies',
      isPersonnel: 0,
      month: '2026-07',
      projectedAmount: 10,
      remaining: 60,
    }),
  ],
});

describe('buildProjectionSeries', () => {
  it('builds the Personnel, Non-Personnel, and All Expenses rollup series', () => {
    const series = buildProjectionSeries(sampleResult());

    expect(series.map((s) => s.key)).toEqual([
      PERSONNEL_SERIES,
      NON_PERSONNEL_SERIES,
      ALL_EXPENSES_SERIES,
    ]);
  });

  it('sums every category into the All Expenses rollup', () => {
    const series = buildProjectionSeries(sampleResult());
    const allExpenses = series.find((s) => s.key === ALL_EXPENSES_SERIES);

    expect(allExpenses?.points.map((p) => p.remaining)).toEqual([
      630, 550, 470,
    ]);
  });

  it('sums personnel categories into the Personnel rollup per month', () => {
    const series = buildProjectionSeries(sampleResult());
    const personnel = series.find((s) => s.key === PERSONNEL_SERIES);

    expect(personnel?.points.map((p) => p.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    expect(personnel?.points[0]).toMatchObject({
      actualAmount: 70,
      kind: 'actual',
      remaining: 550,
    });
    expect(personnel?.points[1]).toMatchObject({
      kind: 'blended',
      projectedAmount: 70,
      remaining: 480,
    });
  });

  it('keeps non-personnel categories out of the Personnel rollup', () => {
    const series = buildProjectionSeries(sampleResult());
    const nonPersonnel = series.find((s) => s.key === NON_PERSONNEL_SERIES);

    expect(nonPersonnel?.points[2]).toMatchObject({
      month: '2026-07',
      projectedAmount: 10,
      remaining: 60,
    });
  });

  it('returns no rollup series when the grid is empty', () => {
    const series = buildProjectionSeries({ categories: [], periods: [] });

    expect(series).toEqual([]);
  });
});

describe('getMonthlyCategorySpend', () => {
  it('lists each category spend (actual + projected) per month, sorted', () => {
    const spendByMonth = getMonthlyCategorySpend(sampleResult());

    expect(spendByMonth.get('2026-05')).toEqual([
      { expenditureCategory: '01 - Salaries and Wages', spend: 50 },
      { expenditureCategory: '02 - Fringe Benefits', spend: 20 },
      { expenditureCategory: '04 - Supplies', spend: 10 },
    ]);
    expect(spendByMonth.get('2026-06')).toEqual([
      { expenditureCategory: '01 - Salaries and Wages', spend: 50 },
      { expenditureCategory: '02 - Fringe Benefits', spend: 20 },
      { expenditureCategory: '04 - Supplies', spend: 10 },
    ]);
  });

  it('omits categories with no spend in a month', () => {
    const result = sampleResult();
    // Zero out July fringe so it should disappear from that month only.
    for (const p of result.periods) {
      if (
        p.month === '2026-07' &&
        p.expenditureCategory === '02 - Fringe Benefits'
      ) {
        p.projectedAmount = 0;
      }
    }

    const spendByMonth = getMonthlyCategorySpend(result);

    expect(spendByMonth.get('2026-07')).toEqual([
      { expenditureCategory: '01 - Salaries and Wages', spend: 50 },
      { expenditureCategory: '04 - Supplies', spend: 10 },
    ]);
  });
});

describe('getProjectionStats', () => {
  it('sums current balance from the category header', () => {
    expect(getProjectionStats(sampleResult()).currentBalance).toBe(630);
  });

  it('sums remaining across categories at the final month', () => {
    expect(getProjectionStats(sampleResult()).projectedEnd).toBe(470);
  });

  it('counts distinct projected months', () => {
    expect(getProjectionStats(sampleResult()).projectedMonths).toBe(1);
  });
});
