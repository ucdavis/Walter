import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface PersonnelRecord {
  compositeBenefitRate: number;
  distributionPercent: number;
  employeeId: string;
  fte: number;
  fundingEffectiveDate: string | null;
  fundingEndDate: string | null;
  positionEffectiveDate: string | null;
  jobEndDate: string | null;
  monthlyRate: number;
  name: string;
  positionDescription: string;
  positionNumber: string;
  projectId: string;
  projectDescription: string;
}

export const personnelQueryOptions = (projectCodes: string[]) => ({
  enabled: projectCodes.length > 0,
  queryFn: async (): Promise<PersonnelRecord[]> => {
    const params = new URLSearchParams();
    params.set('projectCodes', projectCodes.join(','));
    return await fetchJson<PersonnelRecord[]>(
      `/api/project/personnel?${params.toString()}`
    );
  },
  queryKey: ['personnel', projectCodes] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const usePersonnelQuery = (projectCodes: string[]) => {
  return useQuery(personnelQueryOptions(projectCodes));
};
