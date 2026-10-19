import { fetchJson } from '@/lib/api.ts';

export interface ProjectCostRecord {
  /** 'Mon-YY', e.g. 'Sep-26'. */
  accountingPeriod: string;
  burdenedCost: number;
  documentEntry: string;
  expenditureCategory: string;
  expenditureType: string;
  transactionNumber: number;
}

export const projectCostsQueryOptions = (projectNumber: string) => ({
  queryFn: async (): Promise<ProjectCostRecord[]> => {
    return await fetchJson<ProjectCostRecord[]>(
      `/api/project/costs/${encodeURIComponent(projectNumber)}`
    );
  },
  queryKey: ['project-costs', projectNumber] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});
