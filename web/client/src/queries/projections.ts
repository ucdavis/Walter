import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, postJson } from '@/lib/api.ts';

// Server JSON for /api/projections. DateOnly fields arrive as 'YYYY-MM-DD', DateTime as full ISO strings.

export type ProjectionExpenseKind = 'OneTime' | 'Monthly' | 'Projected';

export interface ProjectionBudget {
  budget: number;
  committed: number;
  expenditureCategory: string;
  id: number;
  isSeeded: boolean;
  projectionProjectId: number;
  spentToDate: number;
}

export interface ProjectionActual {
  amount: number;
  expenditureCategory: string;
  id: number;
  month: string;
  projectionProjectId: number;
}

export interface ProjectionRunRate {
  expenditureCategory: string;
  historyMonths: number;
  id: number;
  monthlyAmount: number;
  projectionProjectId: number;
}

export interface ProjectionExpense {
  /** Per month for Monthly and Projected; total for OneTime. */
  amount: number;
  description: string | null;
  endMonth: string | null;
  expenditureCategory: string;
  id: number;
  kind: ProjectionExpenseKind;
  projectionProjectId: number;
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
  projectionId: number;
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
  id: number;
  isSeeded: boolean;
  percent: number;
  projectionJobId: number;
  /** Null means funded outside this PI's projects: counted as funded, not charged. */
  projectionProjectId: number | null;
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
  projectionId: number;
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
  piIamId: string;
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

export interface ProjectionChange {
  body?: unknown;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative to /api/projections/{id}, e.g. 'jobs/12' or '' for the projection itself. */
  path: string;
}

/** One mutation for every projection edit; refetches the projection afterwards. */
export const useProjectionMutation = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, method, path }: ProjectionChange) =>
      fetchJson<unknown>(`/api/projections/${id}${path ? `/${path}` : ''}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        method,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['projections', id] }),
  });
};
