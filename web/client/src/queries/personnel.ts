import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface PersonnelRecord {
  compositeBenefitRate: number;
  distributionPercent: number;
  employeeId: string;
  fte: number;
  fundingEffectiveDate: string | null;
  fundingEndDate: string | null;
  jobEffectiveDate: string | null;
  jobEndDate: string | null;
  monthlyRate: number;
  name: string;
  positionDescription: string;
  positionNumber: string;
  projectId: string;
  projectDescription: string;
}

export const personnelQueryOptions = (
  employeeId: string,
  projectCodes: string[]
) => {
  const trimmedEmployeeId = employeeId.trim();

  return {
    enabled: Boolean(trimmedEmployeeId) && projectCodes.length > 0,
    queryFn: async (): Promise<PersonnelRecord[]> => {
      const params = new URLSearchParams();
      params.set('employeeId', trimmedEmployeeId);
      params.set('projectCodes', projectCodes.join(','));
      return await fetchJson<PersonnelRecord[]>(
        `/api/project/personnel?${params.toString()}`
      );
    },
    queryKey: ['personnel', trimmedEmployeeId, projectCodes] as const,
    staleTime: 60 * 60 * 1000, // 1 hour
  };
};

export const usePersonnelQuery = (employeeId: string, projectCodes: string[]) => {
  return useQuery(personnelQueryOptions(employeeId, projectCodes));
};
