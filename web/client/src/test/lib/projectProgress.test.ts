import { describe, expect, it } from 'vitest';
import {
  getBudgetProgressSummary,
  getTimeProgressSummary,
} from '@/lib/projectProgress.ts';
import type { ProjectProjectionCategory } from '@/queries/projectProjection.ts';

const category = (
  overrides: Partial<ProjectProjectionCategory>
): ProjectProjectionCategory => ({
  budget: 0,
  committed: 0,
  expenditureCategory: '01 - Salaries and Wages',
  isPersonnel: 1,
  remainingNow: 0,
  spentToDate: 0,
  ...overrides,
});

describe('getBudgetProgressSummary', () => {
  it('summarizes budget spent and remaining from projection categories', () => {
    const progress = getBudgetProgressSummary([
      category({ budget: 500, remainingNow: 400, spentToDate: 100 }),
      category({
        budget: 100,
        committed: 10,
        remainingNow: 70,
        spentToDate: 20,
      }),
      category({ budget: 60, remainingNow: 45, spentToDate: 15 }),
    ]);

    expect(progress).toMatchObject({
      budget: 660,
      committed: 10,
      overrun: 0,
      remaining: 515,
      spent: 135,
    });
    expect(progress.spentPercent).toBeCloseTo(20.45, 2);
    expect(progress.committedPercent).toBeCloseTo(1.52, 2);
    expect(progress.remainingPercent).toBeCloseTo(78.03, 2);
  });

  it('caps remaining at zero when spending exceeds budget', () => {
    const progress = getBudgetProgressSummary([
      category({ budget: 100, spentToDate: 125 }),
    ]);

    expect(progress).toMatchObject({
      budget: 100,
      committed: 0,
      overrun: 25,
      remaining: 0,
      spent: 125,
    });
    expect(progress.spentPercent).toBe(125);
    expect(progress.overrunPercent).toBe(25);
    expect(progress.remainingPercent).toBe(0);
  });

  it('rolls lower-category overruns into aggregate spent progress', () => {
    const progress = getBudgetProgressSummary([
      category({
        budget: 60_000,
        remainingNow: 20_000,
        spentToDate: 40_000,
      }),
      category({
        budget: 3100,
        remainingNow: -16_648.39,
        spentToDate: 18_128.21,
      }),
    ]);

    expect(progress.budget).toBe(63_100);
    expect(progress.overrun).toBeCloseTo(16_648.39, 2);
    expect(progress.overrunPercent).toBeCloseTo(26.38, 2);
    expect(progress.remaining).toBe(0);
    expect(progress.spent).toBeCloseTo(79_748.39, 2);
    expect(progress.spentPercent).toBeCloseTo(126.38, 2);
    expect(progress.remainingPercent).toBe(0);
  });
});

describe('getTimeProgressSummary', () => {
  it('counts elapsed and remaining calendar months across the project window', () => {
    const progress = getTimeProgressSummary(
      '2024-01-01',
      '2024-12-31',
      new Date(2024, 6, 10)
    );

    expect(progress).toEqual({
      elapsedMonths: 6,
      elapsedPercent: 50,
      remainingMonths: 6,
      remainingPercent: 50,
      totalMonths: 12,
    });
  });

  it('shows all months remaining before the project starts', () => {
    const progress = getTimeProgressSummary(
      '2024-01-01',
      '2024-12-31',
      new Date(2023, 11, 15)
    );

    expect(progress).toMatchObject({
      elapsedMonths: 0,
      remainingMonths: 12,
      totalMonths: 12,
    });
  });

  it('shows no remaining months after the project ends', () => {
    const progress = getTimeProgressSummary(
      '2024-01-01',
      '2024-12-31',
      new Date(2025, 0, 15)
    );

    expect(progress).toMatchObject({
      elapsedMonths: 12,
      remainingMonths: 0,
      totalMonths: 12,
    });
  });

  it('returns null when dates are missing or invalid', () => {
    expect(getTimeProgressSummary(null, '2024-12-31')).toBeNull();
    expect(getTimeProgressSummary('2024-01-01', null)).toBeNull();
    expect(getTimeProgressSummary('2024-12-31', '2024-01-01')).toBeNull();
  });
});
