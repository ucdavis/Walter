import { describe, expect, it } from 'vitest';
import {
  buildProjectionSeries,
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
  it('orders series as Personnel, Non-Personnel, then individual categories', () => {
    const series = buildProjectionSeries(sampleResult());

    expect(series.map((s) => s.key)).toEqual([
      PERSONNEL_SERIES,
      NON_PERSONNEL_SERIES,
      '01 - Salaries and Wages',
      '02 - Fringe Benefits',
      '04 - Supplies',
    ]);
    expect(series[0].isRollup).toBe(true);
    expect(series[2].isRollup).toBe(false);
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

  it('builds an individual series per category', () => {
    const series = buildProjectionSeries(sampleResult());
    const fringe = series.find((s) => s.key === '02 - Fringe Benefits');

    expect(fringe?.points.map((p) => p.remaining)).toEqual([150, 130, 110]);
  });

  it('returns no rollup series when the grid is empty', () => {
    const series = buildProjectionSeries({ categories: [], periods: [] });

    expect(series).toEqual([]);
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
