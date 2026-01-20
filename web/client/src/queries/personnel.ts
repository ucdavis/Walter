import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface PersonnelRecord {
  emplid: string;
  name: string;
  projectId: string;
  projectName: string;
  positionDescr: string;
  monthlyRt: number;
  distPct: number;
  cbr: number;
  fundingEndDt: string | null;
  fte: number;
}

export const projectPersonnelQueryOptions = (projectCodes: string[]) => ({
  enabled: projectCodes.length > 0,
  queryFn: async (): Promise<PersonnelRecord[]> => {
    const params = new URLSearchParams();
    params.set('projectCodes', projectCodes.join(','));
    return await fetchJson<PersonnelRecord[]>(
      `/api/project/personnel?${params.toString()}`
    );
  },
  queryKey: ['projects', 'personnel', projectCodes] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectPersonnelQuery = (projectCodes: string[]) => {
  return useQuery(projectPersonnelQueryOptions(projectCodes));
};
