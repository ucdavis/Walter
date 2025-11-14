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

export const allProjectsQueryOptions = () => ({
  queryFn: async (): Promise<ProjectRecord[]> => {
    return await fetchJson<ProjectRecord[]>('/api/project');
  },
  queryKey: ['projects', 'me'] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useAllProjectsQuery = () => {
  return useQuery(allProjectsQueryOptions());
};
