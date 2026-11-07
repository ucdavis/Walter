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
  /** Fraction of salary; defaults to zero when no source rate was supplied. */
  cbrRate: number;
  colaMonth: number;
  colaRate: number;
  employeeId: string | null;
  endDate: string | null;
  /** Appointment's monthly cost, split by funding share without FTE or COLA scaling. */
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
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchJson<Projection>(`/api/projections/${id}`, {}, signal),
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

export type SaveProjectionRequest = ProjectionDraft & {
  /** Opaque server strings. Parsing through Date would lose datetime2 precision. */
  expectedSeededAt: string;
  expectedUpdatedAt: string;
  overwrite?: boolean;
};

/** Compare UTC tokens only for cache ordering; transmit the original strings unchanged. */
function orderedTimestamp(timestamp: string) {
  return timestamp.replace(
    /(?:\.(\d{1,7}))?Z$/,
    (_match, fraction = '') => `.${String(fraction).padEnd(7, '0')}Z`
  );
}

export const useSaveProjection = (id: number) => {
  const queryClient = useQueryClient();
  const queryKey = projectionQueryOptions(id).queryKey;
  return useMutation({
    mutationFn: (request: SaveProjectionRequest) =>
      fetchJson<Projection>(`/api/projections/${id}`, {
        body: JSON.stringify(request),
        method: 'PUT',
      }),
    mutationKey: ['projections', id, 'save'],
    onMutate: () => queryClient.cancelQueries({ exact: true, queryKey }),
    onSuccess: async (saved) => {
      await queryClient.cancelQueries({ exact: true, queryKey });
      // A response from a plan left open earlier must not replace a newer cached acknowledgement.
      queryClient.setQueryData<Projection>(queryKey, (current) =>
        current &&
        orderedTimestamp(current.updatedAt) > orderedTimestamp(saved.updatedAt)
          ? current
          : saved
      );
      await queryClient.invalidateQueries({
        queryKey: ['projections', 'by-iam'],
        refetchType: 'none',
      });
    },
    retry: false,
  });
};
