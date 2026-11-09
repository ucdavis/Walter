import {
  BALANCE_ADJUSTMENT_CATEGORY,
  getSourceForecastWindow,
} from '@/lib/piProjection.ts';
import { sourceLabel, sourcePlanningBalance } from '@/lib/projectionSources.ts';
import {
  getFundingSourceOutlook,
  type ProjectionResults,
} from '@/lib/projectionWorkspace.ts';
import type {
  ProjectionDraft,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

export interface OutlookMonth {
  actual: number;
  forecast: number;
  month: string;
  remaining: number;
}

export interface SourceOutlook {
  categories: { expenditureCategory: string; forecast: number }[];
  endBalance: number | null;
  firstShortfallMonth: string | null;
  forecast: number;
  label: string;
  minBalance: number | null;
  months: OutlookMonth[];
  outside: boolean;
  planningBalance: number;
  source: ProjectionFundingSource;
}

export interface OutlookGroup {
  endBalance: number | null;
  firstShortfallMonth: string | null;
  forecast: number;
  id: string;
  label: string;
  months: OutlookMonth[];
  planningBalance: number;
  projectNumber: string | null;
  shortfallSources: SourceOutlook[];
  sources: SourceOutlook[];
}

export interface ProjectionOutlook {
  endBalance: number | null;
  firstShortfallMonth: string | null;
  forecast: number;
  gapAppointmentIds: number[];
  groups: OutlookGroup[];
  months: OutlookMonth[];
  overlapAppointmentIds: number[];
  planningBalance: number;
  shortfallSources: SourceOutlook[];
  sources: SourceOutlook[];
}

function summarizeSources(sources: SourceOutlook[]) {
  const byMonth = new Map<string, OutlookMonth>();
  for (const source of sources) {
    // A source's absent months stay absent; its captured balance is never carried backward.
    for (const month of source.months) {
      const total = byMonth.get(month.month) ?? {
        actual: 0,
        forecast: 0,
        month: month.month,
        remaining: 0,
      };
      total.actual += month.actual;
      total.forecast += month.forecast;
      total.remaining += month.remaining;
      byMonth.set(month.month, total);
    }
  }
  const months = [...byMonth.values()].sort((a, b) =>
    a.month.localeCompare(b.month)
  );
  const shortfallSources = sources.filter(
    ({ firstShortfallMonth }) => firstShortfallMonth !== null
  );
  return {
    endBalance: months.at(-1)?.remaining ?? null,
    firstShortfallMonth:
      shortfallSources
        .map(({ firstShortfallMonth }) => firstShortfallMonth!)
        .sort()[0] ?? null,
    forecast: sources.reduce((sum, source) => sum + source.forecast, 0),
    months,
    planningBalance: sources.reduce(
      (sum, source) =>
        sum + (source.months.length > 0 ? source.planningBalance : 0),
      0
    ),
    shortfallSources,
  };
}

/** Presents the existing forecast without changing financial rows or combining source shortfalls. */
export function buildProjectionOutlook(
  draft: ProjectionDraft,
  results: ProjectionResults
): ProjectionOutlook {
  const rowsBySource = new Map<number, ProjectionResults['rows']>();
  for (const row of results.rows) {
    const rows = rowsBySource.get(row.fundingSourceId) ?? [];
    rows.push(row);
    rowsBySource.set(row.fundingSourceId, rows);
  }
  const sources = draft.content.fundingSources.map((source): SourceOutlook => {
    const rows = rowsBySource.get(source.id) ?? [];
    const months = getFundingSourceOutlook(rows, source.id);
    const categories = new Map<string, number>();
    for (const row of rows) {
      if (row.expenditureCategory !== BALANCE_ADJUSTMENT_CATEGORY) {
        categories.set(
          row.expenditureCategory,
          (categories.get(row.expenditureCategory) ?? 0) + row.projectedAmount
        );
      }
    }
    return {
      categories: [...categories]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([expenditureCategory, forecast]) => ({
          expenditureCategory,
          forecast,
        })),
      endBalance: months.at(-1)?.remaining ?? null,
      firstShortfallMonth:
        months.find(({ remaining }) => remaining < 0)?.month ?? null,
      forecast: months.reduce((sum, month) => sum + month.forecast, 0),
      label: sourceLabel(source),
      minBalance: months.length
        ? Math.min(...months.map(({ remaining }) => remaining))
        : null,
      months,
      outside: getSourceForecastWindow(source, results.forecastWindow)
        .isBeyondForecast,
      planningBalance: sourcePlanningBalance(source),
      source,
    };
  });
  const grouped = new Map<
    string,
    Pick<OutlookGroup, 'id' | 'label' | 'projectNumber' | 'sources'>
  >();
  for (const outlook of sources) {
    const { source } = outlook;
    const projectNumber =
      source.sourceKind === 'Task' ? source.projectNumber : null;
    const id = projectNumber
      ? `project:${projectNumber}`
      : `source:${source.id}`;
    const group = grouped.get(id) ?? {
      id,
      label: projectNumber
        ? source.projectName || projectNumber
        : outlook.label,
      projectNumber,
      sources: [],
    };
    group.sources.push(outlook);
    grouped.set(id, group);
  }

  const gaps = new Set<number>();
  const overlaps = new Set<number>();
  for (const month of results.appointmentFunding) {
    if (month.hasGap) {
      gaps.add(month.appointmentId);
    }
    if (month.hasOverlap) {
      overlaps.add(month.appointmentId);
    }
  }
  return {
    ...summarizeSources(sources),
    gapAppointmentIds: [...gaps],
    groups: [...grouped.values()].map((group) => ({
      ...group,
      ...summarizeSources(group.sources),
    })),
    overlapAppointmentIds: [...overlaps],
    sources,
  };
}
