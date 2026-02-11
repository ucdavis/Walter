import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.ts';

export interface ProjectRecord {
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
  fundDesc: string;
  pa: string | null;
  pi: string | null;
  pm: string | null;
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

export interface ManagedPiRecord {
  employeeId: string;
  name: string;
  projectCount: number;
}

export const projectsDetailQueryOptions = (employeeId: string) => ({
  enabled: Boolean(employeeId),
  queryFn: async (): Promise<ProjectRecord[]> => {
    return await fetchJson<ProjectRecord[]>(`/api/project/${employeeId}`);
  },
  queryKey: ['projects', employeeId] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectsDetailQuery = (employeeId: string) => {
  return useQuery(projectsDetailQueryOptions(employeeId));
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