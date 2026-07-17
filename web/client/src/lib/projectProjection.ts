import type {
  ProjectionPeriodKind,
  ProjectProjectionPeriod,
  ProjectProjectionResult,
} from '@/queries/projectProjection.ts';

export const PERSONNEL_SERIES = 'Personnel';
export const NON_PERSONNEL_SERIES = 'Non-Personnel';
export const ALL_EXPENSES_SERIES = 'All Expenses';

export interface ProjectionPoint {
  actualAmount: number;
  displayPeriod: string;
  kind: ProjectionPeriodKind;
  month: string;
  projectedAmount: number;
  remaining: number;
}

export interface ProjectionSeries {
  key: string;
  points: ProjectionPoint[];
}

export interface ProjectionStats {
  currentBalance: number;
  projectedEnd: number;
  projectedMonths: number;
  startingBalance: number;
}

export interface CategorySpend {
  expenditureCategory: string;
  spend: number;
}

function isValidMonth(month: number) {
  return month >= 1 && month <= 12;
}

function isValidCalendarDate(year: number, month: number, day: number) {
  if (!isValidMonth(month) || day < 1) {
    return false;
  }

  return day <= new Date(year, month, 0).getDate();
}

function parseMonthIndex(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    return null;
  }

  const parsedMonth = Number(match[2]);

  if (!isValidMonth(parsedMonth)) {
    return null;
  }

  return Number(match[1]) * 12 + parsedMonth - 1;
}

function getMonthFromDate(value: string | null) {
  if (!value) {
    return null;
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const year = Number(dateMatch?.[1]);
  const month = Number(dateMatch?.[2]);
  const day = Number(dateMatch?.[3]);

  if (dateMatch) {
    return isValidCalendarDate(year, month, day)
      ? `${dateMatch[1]}-${dateMatch[2]}`
      : null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

export function getProjectionTransitionMonth(
  result: ProjectProjectionResult
): string | null {
  return (
    result.periods.find((period) => period.kind === 'blended')?.month ?? null
  );
}

function toPoints(periods: ProjectProjectionPeriod[]): ProjectionPoint[] {
  const byMonth = new Map<string, ProjectionPoint>();

  for (const period of periods) {
    const existing = byMonth.get(period.month);
    if (existing) {
      existing.actualAmount += period.actualAmount;
      existing.projectedAmount += period.projectedAmount;
      existing.remaining += period.remaining;
    } else {
      byMonth.set(period.month, {
        actualAmount: period.actualAmount,
        displayPeriod: period.displayPeriod,
        kind: period.kind,
        month: period.month,
        projectedAmount: period.projectedAmount,
        remaining: period.remaining,
      });
    }
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function buildProjectionSeries(
  result: ProjectProjectionResult
): ProjectionSeries[] {
  const personnel = result.periods.filter((p) => p.isPersonnel === 1);
  const nonPersonnel = result.periods.filter((p) => p.isPersonnel !== 1);

  const series: ProjectionSeries[] = [];

  if (result.periods.length > 0) {
    series.push({
      key: ALL_EXPENSES_SERIES,
      points: toPoints(result.periods),
    });
  }

  if (personnel.length > 0) {
    series.push({
      key: PERSONNEL_SERIES,
      points: toPoints(personnel),
    });
  }

  if (nonPersonnel.length > 0) {
    series.push({
      key: NON_PERSONNEL_SERIES,
      points: toPoints(nonPersonnel),
    });
  }

  return series;
}

export function buildNonPersonnelCategorySeries(
  result: ProjectProjectionResult
): ProjectionSeries[] {
  const byCategory = new Map<string, ProjectProjectionPeriod[]>();

  for (const period of result.periods) {
    if (period.isPersonnel === 1) {
      continue;
    }

    const periods = byCategory.get(period.expenditureCategory) ?? [];
    periods.push(period);
    byCategory.set(period.expenditureCategory, periods);
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, periods]) => ({
      key,
      points: toPoints(periods),
    }));
}

export function getMonthlyCategorySpend(
  result: ProjectProjectionResult
): Map<string, CategorySpend[]> {
  const byMonth = new Map<string, CategorySpend[]>();

  for (const period of result.periods) {
    const spend = period.actualAmount + period.projectedAmount;
    if (spend === 0) {
      continue;
    }

    const entries = byMonth.get(period.month) ?? [];
    entries.push({
      expenditureCategory: period.expenditureCategory,
      spend,
    });
    byMonth.set(period.month, entries);
  }

  for (const entries of byMonth.values()) {
    entries.sort((a, b) =>
      a.expenditureCategory.localeCompare(b.expenditureCategory)
    );
  }

  return byMonth;
}

function sumRemainingAtMonth(result: ProjectProjectionResult, month: string) {
  return result.periods
    .filter((p) => p.month === month)
    .reduce((sum, p) => sum + p.remaining, 0);
}

function getProjectedEnd(
  result: ProjectProjectionResult,
  currentBalance: number,
  awardEndDate: string | null
) {
  const months = [...new Set(result.periods.map((p) => p.month))].sort();
  const lastMonth = months.at(-1);
  const targetMonth = getMonthFromDate(awardEndDate);

  if (lastMonth === undefined) {
    return currentBalance;
  }

  if (!targetMonth) {
    return sumRemainingAtMonth(result, lastMonth);
  }

  if (months.includes(targetMonth)) {
    return sumRemainingAtMonth(result, targetMonth);
  }

  const targetMonthIndex = parseMonthIndex(targetMonth);
  const lastMonthIndex = parseMonthIndex(lastMonth);

  if (targetMonthIndex === null || lastMonthIndex === null) {
    return sumRemainingAtMonth(result, lastMonth);
  }

  if (targetMonthIndex < lastMonthIndex) {
    const nearestMonth =
      months
        .filter((month) => {
          const index = parseMonthIndex(month);
          return index !== null && index <= targetMonthIndex;
        })
        .at(-1) ?? months[0];

    return sumRemainingAtMonth(result, nearestMonth);
  }

  const extraProjectedMonths = targetMonthIndex - lastMonthIndex;
  const byCategory = new Map<string, ProjectProjectionPeriod[]>();

  for (const period of result.periods) {
    const periods = byCategory.get(period.expenditureCategory) ?? [];
    periods.push(period);
    byCategory.set(period.expenditureCategory, periods);
  }

  return [...byCategory.values()].reduce((sum, periods) => {
    const lastRemaining =
      periods.find((period) => period.month === lastMonth)?.remaining ?? 0;
    const recurringSpend =
      periods
        .filter((period) => period.kind === 'projected')
        .sort((a, b) => a.month.localeCompare(b.month))
        .at(-1)?.projectedAmount ?? 0;

    return sum + lastRemaining - recurringSpend * extraProjectedMonths;
  }, 0);
}

export function getProjectionStats(
  result: ProjectProjectionResult,
  awardEndDate: string | null = null
): ProjectionStats {
  const startingBalance = result.categories.reduce(
    (sum, category) => sum + category.budget,
    0
  );
  const currentBalance = result.categories.reduce(
    (sum, category) => sum + category.remainingNow,
    0
  );
  const projectedEnd = getProjectedEnd(result, currentBalance, awardEndDate);
  const projectedMonths = new Set(
    result.periods.filter((p) => p.kind === 'projected').map((p) => p.month)
  ).size;

  return { currentBalance, projectedEnd, projectedMonths, startingBalance };
}
