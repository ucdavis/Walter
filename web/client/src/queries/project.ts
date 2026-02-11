import { useQueries, useQuery } from '@tanstack/react-query';
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
  programCode: string | null;
  programDesc: string;
  hasGlPpmDiscrepancy: boolean;
  /** Computed on frontend: pmEmployeeId === currentUserEmployeeId */
  managedByCurrentUser: boolean;
  pa: string | null;
  pi: string | null;
  pm: string | null;
  pmEmployeeId: string | null;
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

export interface ManagedPiRecord {
  employeeId: string;
  name: string;
  projectCount: number;
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

export const useGLTransactionsQuery = (projectCodes: string[]) => {
  return useQuery(glTransactionsQueryOptions(projectCodes));
};

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

export const useGLPPMReconciliationQuery = (projectCodes: string[]) => {
  return useQuery(glPpmReconciliationQueryOptions(projectCodes));
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

export const useManagedPisQuery = (employeeId: string, currentUserEmployeeId?: string) => {
  // First fetch the list of managed PIs
  const managedPisResult = useQuery(managedPisQueryOptions(employeeId));
  const employeeIds = managedPisResult.data?.map((pi) => pi.employeeId) ?? [];

  // Then fetch projects for each PI in parallel
  const projectsResult = useQueries({
    combine: (results) => {
      const byEmployeeId: Record<string, ProjectRecord[]> = {};

      results.forEach((r, i) => {
        const projects = r.data ?? [];
        if (employeeIds[i]) {
          byEmployeeId[employeeIds[i]] = projects;
        }
      });

      return {
        byEmployeeId,
        error: results.find((r) => r.error)?.error ?? null,
        isError: results.some((r) => r.isError),
        isPending: results.some((r) => r.isPending),
      };
    },
    queries: employeeIds.map((id) => projectsDetailQueryOptions(id, currentUserEmployeeId)),
  });

  // Combine PI info with their projects (API already filters inactive/expired)
  const managedPis: PiWithProjects[] = (managedPisResult.data ?? []).map(
    (pi) => {
      const projects = projectsResult.byEmployeeId[pi.employeeId] ?? [];
      const totalBudget = projects.reduce((sum, p) => sum + p.catBudget, 0);
      const totalBalance = projects.reduce((sum, p) => sum + p.catBudBal, 0);

      const uniqueProjects = new Set(projects.map((p) => p.projectNumber));

      return {
        employeeId: pi.employeeId,
        name: pi.name,
        projectCount: uniqueProjects.size,
        projects,
        totalBalance,
        totalBudget,
      };
    }
  );

  return {
    error: managedPisResult.error ?? projectsResult.error,
    isError: managedPisResult.isError || projectsResult.isError,
    isPending: managedPisResult.isPending || projectsResult.isPending,
    managedPis,
  };
};
