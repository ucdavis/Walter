import { useQueries, useQuery } from '@tanstack/react-query';
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
    queries: employeeIds.map((id) => projectsDetailQueryOptions(id)),
  });

  // Combine PI info with their projects
  const managedPis: PiWithProjects[] = (managedPisResult.data ?? []).map(
    (pi) => {
      const projects = projectsResult.byEmployeeId[pi.employeeId] ?? [];
      const totalBudget = projects.reduce((sum, p) => sum + p.catBudget, 0);
      const totalBalance = projects.reduce((sum, p) => sum + p.catBudBal, 0);

      return {
        employeeId: pi.employeeId,
        name: pi.name,
        projectCount: pi.projectCount,
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
