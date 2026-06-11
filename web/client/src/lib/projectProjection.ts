import type {
  ProjectionPeriodKind,
  ProjectProjectionPeriod,
  ProjectProjectionResult,
} from '@/queries/projectProjection.ts';

export const PERSONNEL_SERIES = 'Personnel';
export const NON_PERSONNEL_SERIES = 'Non-Personnel';

export interface ProjectionPoint {
  actualAmount: number;
  displayPeriod: string;
  kind: ProjectionPeriodKind;
  month: string;
  projectedAmount: number;
  remaining: number;
}

export interface ProjectionSeries {
  isRollup: boolean;
  key: string;
  points: ProjectionPoint[];
}

export interface ProjectionStats {
  currentBalance: number;
  projectedEnd: number;
  projectedMonths: number;
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
  const categories = [
    ...new Set(result.periods.map((p) => p.expenditureCategory)),
  ].sort();

  const series: ProjectionSeries[] = [];

  if (personnel.length > 0) {
    series.push({
      isRollup: true,
      key: PERSONNEL_SERIES,
      points: toPoints(personnel),
    });
  }

  if (nonPersonnel.length > 0) {
    series.push({
      isRollup: true,
      key: NON_PERSONNEL_SERIES,
      points: toPoints(nonPersonnel),
    });
  }

  for (const category of categories) {
    series.push({
      isRollup: false,
      key: category,
      points: toPoints(
        result.periods.filter((p) => p.expenditureCategory === category)
      ),
    });
  }

  return series;
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
