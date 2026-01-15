import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.ts';

export interface ProjectRecord {
  activity_desc: string;
  award_end_date: string | null;
  award_number: string | null;
  award_start_date: string | null;
  cat_bud_bal: number;
  cat_budget: number;
  cat_commitments: number;
  cat_itd_exp: number;
  copi: string | null;
  expenditure_category_name: string;
  fund_desc: string;
  pa: string | null;
  pi: string | null;
  pm: string | null;
  program_desc: string;
  project_name: string;
  project_number: string;
  project_owning_org: string;
  project_status_code: string;
  purpose_desc: string;
  task_name: string;
  task_num: string;
  task_status: string;
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

export const useManagedPisQuery = (employeeId: string) => {
  return useQuery(managedPisQueryOptions(employeeId));
};
