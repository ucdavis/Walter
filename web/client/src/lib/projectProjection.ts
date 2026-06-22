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
}

export interface CategorySpend {
  expenditureCategory: string;
  spend: number;
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

export function getProjectionStats(
  result: ProjectProjectionResult
): ProjectionStats {
  const currentBalance = result.categories.reduce(
    (sum, category) => sum + category.remainingNow,
    0
  );
  const months = [...new Set(result.periods.map((p) => p.month))].sort();
  const lastMonth = months.at(-1);
  const projectedEnd =
    lastMonth === undefined
      ? currentBalance
      : result.periods
          .filter((p) => p.month === lastMonth)
          .reduce((sum, p) => sum + p.remaining, 0);
  const projectedMonths = new Set(
    result.periods.filter((p) => p.kind === 'projected').map((p) => p.month)
  ).size;

  return { currentBalance, projectedEnd, projectedMonths };
}
