import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export type ProjectionPeriodKind = 'actual' | 'blended' | 'projected';

/** Trailing actual months shown and averaged for the non-personnel run-rate. */
export type ProjectionHistoryMonths = 3 | 6 | 12;

export interface ProjectProjectionCategory {
  budget: number;
  committed: number;
  expenditureCategory: string;
  isPersonnel: number;
  remainingNow: number;
  spentToDate: number;
}

export interface ProjectProjectionPeriod {
  actualAmount: number;
  displayPeriod: string;
  expenditureCategory: string;
  isPersonnel: number;
  kind: ProjectionPeriodKind;
  month: string;
  projectedAmount: number;
  remaining: number;
}

export interface ProjectProjectionResult {
  categories: ProjectProjectionCategory[];
  periods: ProjectProjectionPeriod[];
}

export const projectProjectionQueryOptions = (
  projectNumber: string,
  enabled = true,
  historyMonths: ProjectionHistoryMonths = 3
) => ({
  enabled: enabled && Boolean(projectNumber),
  queryFn: async (): Promise<ProjectProjectionResult> => {
    return await fetchJson<ProjectProjectionResult>(
      `/api/project/projection/${encodeURIComponent(projectNumber)}?historyMonths=${historyMonths}`
    );
  },
  queryKey: ['project-projection', projectNumber, historyMonths] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectProjectionQuery = (
  projectNumber: string,
  enabled = true,
  historyMonths: ProjectionHistoryMonths = 3
) => {
  return useQuery(
    projectProjectionQueryOptions(projectNumber, enabled, historyMonths)
  );
};
