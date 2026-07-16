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

  it('nets category surpluses against category overruns in aggregate balance', () => {
    const progress = getBudgetProgressSummary([
      category({
        budget: 1000,
        remainingNow: 100,
        spentToDate: 900,
      }),
      category({
        budget: 100,
        remainingNow: -50,
        spentToDate: 150,
      }),
    ]);

    expect(progress.budget).toBe(1100);
    expect(progress.overrun).toBe(0);
    expect(progress.overrunPercent).toBe(0);
    expect(progress.remaining).toBe(50);
    expect(progress.spent).toBe(1050);
    expect(progress.spentPercent).toBeCloseTo(95.45, 2);
    expect(progress.remainingPercent).toBeCloseTo(4.55, 2);
  });

  it('matches aggregate expense and balance totals to the detail rows', () => {
    const progress = getBudgetProgressSummary([
      category({
        budget: 45_830,
        remainingNow: -2841.36,
        spentToDate: 48_671.36,
      }),
      category({
        budget: 26_437,
        expenditureCategory: '02 - Fringe Benefits',
        remainingNow: 9872.77,
        spentToDate: 16_564.23,
      }),
      category({
        budget: 0,
        expenditureCategory: '03 - Supplies / Services / Other Expenses',
        isPersonnel: 0,
        remainingNow: -5411.86,
        spentToDate: 5411.86,
      }),
      category({
        budget: 0,
        expenditureCategory: '04 - Travel',
        isPersonnel: 0,
        remainingNow: -44.22,
        spentToDate: 44.22,
      }),
      category({
        budget: 0,
        expenditureCategory: '05 - Fellowship & Scholarships',
        isPersonnel: 0,
        remainingNow: 2067.91,
        spentToDate: 0,
      }),
      category({
        budget: 26_667,
        expenditureCategory: '06 - Indirect Costs',
        isPersonnel: 0,
        remainingNow: -2753.19,
        spentToDate: 29_420.19,
      }),
    ]);

    expect(progress.budget).toBe(98_934);
    expect(progress.committed).toBe(0);
    expect(progress.overrun).toBe(0);
    expect(progress.remaining).toBeCloseTo(890.05, 2);
    expect(progress.spent).toBeCloseTo(100_111.86, 2);
    expect(progress.spentPercent).toBeCloseTo(99.12, 2);
    expect(progress.remainingPercent).toBeCloseTo(0.88, 2);
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
    expect(getTimeProgressSummary('2024-02-31', '2024-12-31')).toBeNull();
    expect(
      getTimeProgressSummary('2024-01-01', '2024-13-31T00:00:00Z')
    ).toBeNull();
  });
});
