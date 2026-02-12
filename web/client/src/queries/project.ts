import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.ts';

export interface ProjectRecord {
  activityCode: string | null;
  activityDesc: string;
  awardEndDate: string | null;
  awardNumber: string | null;
  awardStartDate: string | null;
  catBudBal: number;
  catBudget: number;
  catCommitments: number;
  catItdExp: number;
  copi: string | null;
  displayName: string;
  expenditureCategoryName: string;
  fundCode: string | null;
  fundDesc: string;
  pa: string | null;
  pi: string | null;
  pm: string | null;
  pmEmployeeId: string | null;
  programCode: string | null;
  programDesc: string;
  projectName: string;
  projectNumber: string;
  projectOwningOrg: string;
  projectStatusCode: string;
  projectType: string;
  purposeDesc: string;
  taskName: string;
  taskNum: string;
  taskStatus: string;
}

export interface GLTransactionRecord {
  entity: string | null;
  entityDescription: string | null;
  fund: string | null;
  fundDescription: string | null;
  financialDepartment: string | null;
  financialDepartmentDescription: string | null;
  account: string | null;
  accountDescription: string | null;
  purpose: string | null;
  purposeDescription: string | null;
  program: string | null;
  programDescription: string | null;
  project: string | null;
  projectDescription: string | null;
  activity: string | null;
  activityDescription: string | null;
  documentType: string | null;
  accountingSequenceNumber: string | null;
  trackingNo: string | null;
  reference: string | null;
  journalLineDescription: string | null;
  journalAcctDate: string | null;
  journalName: string | null;
  journalReference: string | null;
  periodName: string | null;
  journalBatchName: string | null;
  journalSource: string | null;
  journalCategory: string | null;
  batchStatus: string | null;
  actualFlag: string | null;
  encumbranceTypeCode: string | null;
  actualAmount: number;
  commitmentAmount: number;
  obligationAmount: number;
}

export interface GLPPMReconciliationRecord {
  financialDepartment: string | null;
  project: string;
  projectDescription: string | null;
  fundCode: string | null;
  fundDescription: string | null;
  ppmFundCode: string;
  programCode: string | null;
  programDescription: string | null;
  activityCode: string | null;
  activityDescription: string | null;
  glActualAmount: number;
  ppmBudget: number;
  ppmCommitments: number;
  ppmItdExp: number;
  ppmBudBal: number;
  remainingBalance: number;
  dataSource: string;
}

export interface ManagedPiRecord {
  employeeId: string;
  name: string;
  projectCount: number;
}

export const projectsDetailQueryOptions = (
  employeeId: string,
  currentUserEmployeeId?: string
) => ({
  enabled: Boolean(employeeId),
  queryFn: async () => {
    return await fetchJson<ProjectRecord[]>(`/api/project/${employeeId}`);
  },
  queryKey: ['projects', employeeId] as const,
  select: (data: ProjectRecord[]): ProjectRecord[] =>
    data.map((p) => ({
      ...p,
      managedByCurrentUser: p.pmEmployeeId === currentUserEmployeeId,
    })),
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectsDetailQuery = (
  employeeId: string,
  currentUserEmployeeId?: string
) => {
  return useQuery(projectsDetailQueryOptions(employeeId, currentUserEmployeeId));
};

export const managedPisQueryOptions = (employeeId: string) => ({
  enabled: Boolean(employeeId),
  queryFn: async (): Promise<ManagedPiRecord[]> => {
    return await fetchJson<ManagedPiRecord[]>(
      `/api/project/managed/${employeeId}`
    );
  },
  queryKey: ['projects', 'managed', employeeId] as const,
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export interface PiWithProjects {
  employeeId: string;
  name: string;
  projectCount: number;
  projects: ProjectRecord[];
  totalBalance: number;
  totalBudget: number;
}

export const useManagedPisQuery = (employeeId: string) => {
  const managedPisResult = useQuery(managedPisQueryOptions(employeeId));

  return {
    error: managedPisResult.error,
    isError: managedPisResult.isError,
    isPending: managedPisResult.isPending,
    managedPis: managedPisResult.data ?? [],
  };
};

export const glTransactionsQueryOptions = (projectCodes: string[]) => ({
  enabled: projectCodes.length > 0,
  queryFn: async () => {
    const codes = projectCodes.join(',');
    return await fetchJson<GLTransactionRecord[]>(
      `/api/project/transactions?projectCodes=${encodeURIComponent(codes)}`
    );
  },
  queryKey: ['gl-transactions', ...projectCodes] as const,
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export const glPpmReconciliationQueryOptions = (projectCodes: string[]) => ({
  enabled: projectCodes.length > 0,
  queryFn: async () => {
    const codes = projectCodes.join(',');
    return await fetchJson<GLPPMReconciliationRecord[]>(
      `/api/project/gl-ppm-reconciliation?projectCodes=${encodeURIComponent(codes)}`
    );
  },
  queryKey: ['gl-ppm-reconciliation', ...projectCodes] as const,
  staleTime: 5 * 60 * 1000, // 5 minutes
});

/**
 * Non-blocking hook that fetches reconciliation data and returns a Set of
 * project numbers that have GL/PPM discrepancies (|GL actuals - PPM ITD exp| > $1).
 */
export function useProjectDiscrepancies(projectCodes: string[]): Set<string> {
  const { data } = useQuery(glPpmReconciliationQueryOptions(projectCodes));

  return useMemo(() => {
    if (!data) return new Set<string>();

    const byProject = new Map<string, { gl: number; ppm: number }>();
    for (const r of data) {
      const existing = byProject.get(r.project);
      if (existing) {
        existing.gl += r.glActualAmount;
        existing.ppm += r.ppmItdExp;
      } else {
        byProject.set(r.project, { gl: r.glActualAmount, ppm: r.ppmItdExp });
      }
    }

    const result = new Set<string>();
    for (const [project, totals] of byProject) {
      if (Math.abs(totals.gl - totals.ppm) > 1) {
        result.add(project);
      }
    }
    return result;
  }, [data]);
}
