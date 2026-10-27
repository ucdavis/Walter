import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, postJson } from '@/lib/api.ts';

// Server JSON for /api/projections. DateOnly fields arrive as 'YYYY-MM-DD', DateTime as full ISO strings.

export type ProjectionExpenseKind = 'OneTime' | 'Monthly' | 'Projected';

export interface ProjectionBudget {
  budget: number;
  committed: number;
  expenditureCategory: string;
  isSeeded: boolean;
  spentToDate: number;
}

export interface ProjectionActual {
  amount: number;
  expenditureCategory: string;
  month: string;
}

export interface ProjectionRunRate {
  expenditureCategory: string;
  historyMonths: number;
  monthlyAmount: number;
}

export interface ProjectionExpense {
  /** Per month for Monthly and Projected; total for OneTime. */
  amount: number;
  description: string | null;
  endMonth: string | null;
  expenditureCategory: string;
  kind: ProjectionExpenseKind;
  startMonth: string | null;
}

export interface ProjectionProject {
  actuals: ProjectionActual[];
  awardName: string | null;
  awardNumber: string | null;
  budgets: ProjectionBudget[];
  endDate: string | null;
  expenses: ProjectionExpense[];
  id: number;
  isSeeded: boolean;
  projectName: string;
  projectNumber: string | null;
  projectType: string | null;
  runRates: ProjectionRunRate[];
  startDate: string | null;
  taskName: string | null;
  taskNumber: string | null;
}

export interface ProjectionFundingEntry {
  endDate: string | null;
  isSeeded: boolean;
  percent: number;
  /** Null means funded outside this PI's projects: counted as funded, not charged. */
  projectId: number | null;
  startDate: string | null;
}

export interface ProjectionJob {
  cbrRate: number | null;
  colaMonth: number;
  colaRate: number;
  employeeId: string | null;
  endDate: string | null;
  feeRemissionMonthly: number | null;
  fte: number;
  fundingEntries: ProjectionFundingEntry[];
  id: number;
  isSeeded: boolean;
  jobCode: string | null;
  /** 1.0-FTE monthly rate; null means the job needs input. */
  monthlySalary: number | null;
  name: string;
  positionNumber: string | null;
  rateSet: string;
  startDate: string | null;
  title: string | null;
  vacationAccrualRate: number;
}

export interface Projection {
  createdAt: string;
  createdBy: string | null;
  historyMonths: number;
  id: number;
  jobs: ProjectionJob[];
  name: string;
  piEmployeeId: string;
  projects: ProjectionProject[];
  /** The projection's "now": all calculation is relative to this snapshot. */
  seededAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ProjectionSummary {
  id: number;
  name: string;
  seededAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface JobCode {
  cbr: number | null;
  jobCode: string;
  rateSet: string;
  title: string | null;
  vacationAccrual: number | null;
}

export interface ProjectionLookups {
  expenditureCategories: string[];
  jobCodes: JobCode[];
}

export const projectionListQueryOptions = (iamId: string) => ({
  queryFn: () =>
    fetchJson<ProjectionSummary[]>(
      `/api/projections/by-iam/${encodeURIComponent(iamId)}`
    ),
  queryKey: ['projections', 'by-iam', iamId] as const,
});

export const projectionQueryOptions = (id: number) => ({
  queryFn: () => fetchJson<Projection>(`/api/projections/${id}`),
  queryKey: ['projections', id] as const,
});

export const projectionLookupsQueryOptions = () => ({
  queryFn: () => fetchJson<ProjectionLookups>('/api/projections/lookups'),
  queryKey: ['projections', 'lookups'] as const,
  staleTime: 60 * 60 * 1000, // 1 hour; reference data
});

export const createProjection = (
  iamId: string,
  body: { historyMonths: number; name: string }
) =>
  postJson<Projection>(
    `/api/projections/by-iam/${encodeURIComponent(iamId)}`,
    body
  );

export type ProjectionDraft = Pick<
  Projection,
  'historyMonths' | 'jobs' | 'name' | 'projects'
>;

/** Saves the whole projection; the response carries regenerated Projected expenses after a window change. */
export const useSaveProjection = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ historyMonths, jobs, name, projects }: ProjectionDraft) =>
      fetchJson<Projection>(`/api/projections/${id}`, {
        body: JSON.stringify({ historyMonths, jobs, name, projects }),
        method: 'PUT',
      }),
    onSuccess: (saved) => queryClient.setQueryData(['projections', id], saved),
  });
};
