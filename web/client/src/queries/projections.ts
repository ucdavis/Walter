import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { fetchJson, postJson } from '@/lib/api.ts';

// Server JSON for /api/projections. DateOnly fields arrive as 'YYYY-MM-DD', DateTime as full ISO strings.

export type ProjectionExpenseKind = 'OneTime' | 'Monthly';

export interface ProjectionBudget {
  budget: number;
  committed: number;
  expenditureCategory: string;
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
  /** Per month for Monthly; total for OneTime. Signed amounts include planned credits. */
  amount: number;
  description: string;
  endMonth: string | null;
  expenditureCategory: string;
  /** Source-local editor identity; removed IDs need not be retained. */
  id: number;
  kind: ProjectionExpenseKind;
  startMonth: string;
}

export interface ProjectionHistoricalExpenseOverride {
  /** Explicit zero suppresses the captured estimate until restored. */
  amount: number;
  expenditureCategory: string;
}

export interface ProjectionFundingSource {
  actuals: ProjectionActual[];
  awardName: string | null;
  awardNumber: string | null;
  /** Plan-only adjustment; captured budget, spending, and commitments stay intact. */
  balanceAdjustment: number;
  budgets: ProjectionBudget[];
  /** Exact UTC capture time of this source's financial inputs. */
  capturedAt: string;
  capturedEndDate: string | null;
  capturedStartDate: string | null;
  endDate: string | null;
  expenses: ProjectionExpense[];
  historicalExpenseOverrides: ProjectionHistoricalExpenseOverride[];
  id: number;
  /** Editable label; captured project and task names remain unchanged. */
  name: string;
  projectName: string | null;
  projectNumber: string | null;
  projectType: string | null;
  runRates: ProjectionRunRate[];
  sourceKind: 'Task' | 'Planned';
  startDate: string | null;
  taskName: string | null;
  taskNumber: string | null;
}

export interface ProjectionFundingAllocation {
  endDate: string | null;
  /** Null means funded outside this plan's sources: counted as funded, not charged. */
  fundingSourceId: number | null;
  percent: number;
  startDate: string | null;
}

export interface ProjectionAppointment {
  allocations: ProjectionFundingAllocation[];
  /** Fraction of salary; a supplied zero remains an explicit rate. */
  cbrRate: number;
  colaMonth: number;
  colaRate: number;
  employeeId: string | null;
  endDate: string | null;
  /** Appointment's monthly cost, split by funding share without FTE or COLA scaling. */
  feeRemissionMonthly: number | null;
  fte: number;
  hasUnmatchedFunding: boolean;
  id: number;
  /** Imported appointments use snapshot-based pay; planned future hires use their entered starting rate. */
  isSeeded: boolean;
  jobCode: string | null;
  /** 1.0-FTE monthly rate at the snapshot, or at a planned future hire's start; null needs input. */
  monthlySalary: number | null;
  name: string;
  positionNumber: string | null;
  rateSet: string;
  startDate: string | null;
  title: string | null;
  vacationAccrualRate: number;
}

export interface ProjectionContent {
  appointments: ProjectionAppointment[];
  /** Inclusive plan duration anchored to the original snapshot month. */
  forecastMonths: number;
  fundingSources: ProjectionFundingSource[];
  historyMonths: number;
  /** Optional plain-text context for this scenario. */
  notes: string | null;
}

export interface ProjectionDraft {
  content: ProjectionContent;
  name: string;
  /** Original plan capture and salary base. */
  seededAt: string;
}

export interface Projection extends ProjectionDraft {
  createdAt: string;
  createdBy: string | null;
  id: number;
  piEmployeeId: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ProjectionRosterEntry {
  appointmentId: number;
  projectNumbers: string[];
}

export interface ProjectionSeedResponse {
  draft: ProjectionDraft;
  roster: ProjectionRosterEntry[];
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
  appointmentDefaults: ProjectionAppointmentDefaults;
  expenditureCategories: string[];
  jobCodes: JobCode[];
}

/** Server-owned planning assumptions for a new hypothetical appointment. */
export interface ProjectionAppointmentDefaults {
  cbrRate: number;
  colaMonth: number;
  colaRate: number;
  fte: number;
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

export type CreateProjectionDraftRequest = {
  creationKey: string;
  draft: ProjectionDraft;
};

export type DuplicateProjectionRequest = {
  creationKey: string;
  name: string;
};

/** A wizard owns this one capture; query refreshes must not replace its draft. */
export const fetchProjectionSeed = (iamId: string, historyMonths: number) =>
  fetchJson<ProjectionSeedResponse>(
    `/api/projections/by-iam/${encodeURIComponent(iamId)}/seed?historyMonths=${historyMonths}`
  );

export interface ProjectionSourceSummary {
  availableBalance: number;
  capturedAt: string;
  projectName: string | null;
  projectNumber: string;
  taskName: string | null;
  taskNumber: string | null;
}

export const projectionSourceCatalogQueryOptions = (iamId: string) => ({
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchJson<ProjectionSourceSummary[]>(
      `/api/projections/by-iam/${encodeURIComponent(iamId)}/sources`,
      {},
      signal
    ),
  queryKey: ['projections', 'sources', iamId] as const,
});

/** Imports only selected financial inputs; existing employee assumptions stay in the draft. */
export const importProjectionSources = (
  iamId: string,
  sources: Pick<ProjectionSourceSummary, 'projectNumber' | 'taskNumber'>[]
) =>
  postJson<ProjectionFundingSource[]>(
    `/api/projections/by-iam/${encodeURIComponent(iamId)}/sources/import`,
    { sources }
  );

async function cacheCreatedProjection(
  queryClient: QueryClient,
  iamId: string,
  saved: Projection
) {
  const detailKey = projectionQueryOptions(saved.id).queryKey;
  const listKey = projectionListQueryOptions(iamId).queryKey;
  await Promise.all([
    queryClient.cancelQueries({ exact: true, queryKey: detailKey }),
    queryClient.cancelQueries({ exact: true, queryKey: listKey }),
  ]);
  // Retrying a lost create response can return a plan already edited elsewhere.
  queryClient.setQueryData<Projection>(detailKey, (current) =>
    current &&
    orderedTimestamp(current.updatedAt) > orderedTimestamp(saved.updatedAt)
      ? current
      : saved
  );
  queryClient.setQueryData<ProjectionSummary[]>(listKey, (current) => {
    const existing = current?.find(({ id }) => id === saved.id);
    const summary =
      existing &&
      orderedTimestamp(existing.updatedAt) > orderedTimestamp(saved.updatedAt)
        ? existing
        : {
            id: saved.id,
            name: saved.name,
            seededAt: saved.seededAt,
            updatedAt: saved.updatedAt,
            updatedBy: saved.updatedBy,
          };
    return [summary, ...(current ?? []).filter(({ id }) => id !== saved.id)];
  });
  await queryClient.invalidateQueries({
    queryKey: listKey,
    refetchType: 'none',
  });
}

export const useCreateProjectionDraft = (iamId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProjectionDraftRequest) =>
      postJson<Projection>(
        `/api/projections/by-iam/${encodeURIComponent(iamId)}`,
        request
      ),
    onSuccess: (saved) => cacheCreatedProjection(queryClient, iamId, saved),
    retry: false,
  });
};

export const useDuplicateProjection = (iamId: string, id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DuplicateProjectionRequest) =>
      postJson<Projection>(`/api/projections/${id}/duplicate`, request),
    onSuccess: (saved) => cacheCreatedProjection(queryClient, iamId, saved),
    retry: false,
  });
};

export type SaveProjectionRequest = Omit<ProjectionDraft, 'seededAt'> & {
  /** Opaque server strings. Parsing through Date would lose datetime2 precision. */
  expectedSeededAt: string;
  expectedUpdatedAt: string;
  overwrite?: boolean;
};

/** Compare UTC tokens only for cache ordering; transmit the original strings unchanged. */
export function orderedTimestamp(timestamp: string) {
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
