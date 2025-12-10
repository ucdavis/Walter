import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface ProjectPersonnel {
  ACCT_CD: string;
  CHARTFIELD2: string;
  DIST_PCT: number;
  FTE: number;
  FUND_CODE: string;
  FUND_DEPTID: string;
  JOB_ANNUAL_RT: number;
  JOB_COMP_FREQUENCY: string;
  JOB_EMPLID: string;
  JOB_HOURLY_RT: number;
  JOB_MONTHLY_RT: number;
  JOB_MONTHLY_RT_EQUIV: number;
  JOB_STD_HOURS: number;
  JOBCODE: string;
  JOBCODE_DESCR: string;
  JOBCODE_SHORT: string;
  POSITION_NBR: string;
  PREFERRED_NAME: string;
  PROJECT_ID: string;
}

export const projectPersonnelQueryOptions = (projectCodes: string[]) => ({
  queryFn: async (): Promise<ProjectPersonnel[]> => {
    const params = new URLSearchParams();
    params.set('projectCodes', projectCodes.join(','));
    return await fetchJson<ProjectPersonnel[]>(
      `/api/project/personnel?${params.toString()}`
    );
  },
  queryKey: ['projects', 'personnel', projectCodes] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectPersonnelQuery = (projectCodes: string[]) => {
  return useQuery(projectPersonnelQueryOptions(projectCodes));
};
