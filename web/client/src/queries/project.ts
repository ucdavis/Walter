import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.ts';

export interface ProjectRecord {
  activityCode: string | null;
  activityDesc: string;
  awardCloseDate: string | null;
  awardEndDate: string | null;
  awardName: string | null;
  awardNumber: string | null;
  awardPi: string | null;
  awardStartDate: string | null;
  awardStatus: string | null;
  awardType: string | null;
  balance: number;
  billingCycle: string | null;
  budget: number;
  commitments: number;
  expenses: number;
  ppmBudBal: number;
  ppmBudget: number;
  ppmCommitments: number;
  ppmExpenses: number;
  contractAdministrator: string | null;
  copi: string | null;
  costShareRequiredBySponsor: string | null;
  displayName: string;
  expenditureCategoryName: string | null;
  flowThroughFundsAmount: string | null;
  flowThroughFundsEndDate: string | null;
  flowThroughFundsPrimarySponsor: string | null;
  flowThroughFundsReferenceAwardName: string | null;
  flowThroughFundsStartDate: string | null;
  fundCode: string | null;
  fundDesc: string;
  grantAdministrator: string | null;
  pa: string | null;
  pi: string | null;
  pm: string | null;
  pmEmployeeId: string | null;
  ownerName: string | null;
  postReportingPeriod: string | null;
  primarySponsorName: string | null;
  programCode: string | null;
  programDesc: string;
  projectBurdenCostRate: string | null;
  projectBurdenScheduleBase: string | null;
  projectFund: string | null;
  projectName: string;
  projectNumber: string;
  projectOwningOrg: string;
  projectOwningOrgCode: string;
  projectStatusCode: string;
  projectType: string;
  purposeDesc: string;
  sponsorAwardNumber: string | null;
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
  naturalAccountType: string | null;
}

export interface GLPPMReconciliationRecord {
  financialDepartment: string | null;
  project: string;
  projectDescription: string | null;
  fundCode: string | null;
  fundDescription: string | null;
  ppmFundCode: string;
  ppmFundDescription: string | null;
  programCode: string | null;
  programDescription: string | null;
  activityCode: string | null;
  activityDescription: string | null;
  glActualAmount: number;
  ppmBudget: number;
  ppmItdExp: number;
  ppmBudBal: number;
  remainingBalance: number;
  dataSource: string;
}

export interface ManagedPiRecord {
  employeeId: string;
  iamId: string | null;
  name: string;
  projectCount: number;
}

export interface ManagedPisEnvelope {
  pis: ManagedPiRecord[];
  projectManager: {
    employeeId: string;
    iamId: string;
    name: string | null;
  } | null;
}

export const projectsDetailQueryOptions = (iamId: string) => ({
  enabled: Boolean(iamId),
  queryFn: async () => {
    const encodedIamId = encodeURIComponent(iamId);
    return await fetchJson<ProjectRecord[]>(
      `/api/project/by-iam/${encodedIamId}`
    );
  },
  queryKey: ['projects', 'by-iam', iamId] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectsDetailQuery = (iamId: string) => {
  return useQuery(projectsDetailQueryOptions(iamId));
};

export const managedPisQueryOptions = (iamId: string) => ({
  enabled: Boolean(iamId),
  queryFn: async (): Promise<ManagedPisEnvelope> => {
    const encodedIamId = encodeURIComponent(iamId);
    return await fetchJson<ManagedPisEnvelope>(
      `/api/project/managed/by-iam/${encodedIamId}`
    );
  },
  queryKey: ['projects', 'managed', 'by-iam', iamId] as const,
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export interface PiWithProjects {
  employeeId: string;
  iamId: string | null;
  name: string;
  projectCount: number;
  projects: ProjectRecord[];
  totalBalance: number;
  totalBudget: number;
}

export const useManagedPisQuery = (iamId: string) => {
  const managedPisResult = useQuery(managedPisQueryOptions(iamId));

  return {
    error: managedPisResult.error,
    isError: managedPisResult.isError,
    isPending: managedPisResult.isPending,
    managedPis: managedPisResult.data?.pis ?? [],
    projectManagerName: managedPisResult.data?.projectManager?.name ?? null,
  };
};

export const projectsByNumberQueryOptions = (projectCodes: string[]) => ({
  enabled: projectCodes.length > 0,
  queryFn: async () => {
    const codes = projectCodes.join(',');
    return await fetchJson<ProjectRecord[]>(
      `/api/project/byNumber?projectCodes=${encodeURIComponent(codes)}`
    );
  },
  queryKey: ['projects-by-number', ...projectCodes] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

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
 * project numbers that have GL/PPM discrepancies (actuals only).
 */
export function useProjectDiscrepancies(projectCodes: string[]): Set<string> {
  const { data } = useQuery(glPpmReconciliationQueryOptions(projectCodes));

  return useMemo(() => {
    if (!data) return new Set<string>();

    // Sum glActualAmount + ppmBudBal per project,
    // matching the per-row formula on the reconciliation page.
    const byProject = new Map<string, number>();
    for (const r of data) {
      const diff = r.glActualAmount + r.ppmBudBal;
      byProject.set(r.project, (byProject.get(r.project) ?? 0) + diff);
    }

    const result = new Set<string>();
    for (const [project, total] of byProject) {
      if (Math.abs(total) > 0.005) {
        result.add(project);
      }
    }
    return result;
  }, [data]);
}
