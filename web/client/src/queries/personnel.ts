import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface PersonnelRecord {
  compositeBenefitRate: number;
  distributionPercent: number;
  employeeId: string;
  fte: number;
  fundingEffectiveDate: string | null;
  fundingEndDate: string | null;
  jobCode: string | null;
  jobEffectiveDate: string | null;
  jobEndDate: string | null;
  monthlyRate: number;
  name: string;
  positionDescription: string;
  positionNumber: string;
  projectId: string;
  projectDescription: string;
  projectType: string | null;
  task: string | null;
}

export const personnelQueryOptions = (
  iamId: string,
  projectCodes: string[]
) => {
  const trimmedIamId = iamId.trim();

  return {
    enabled: Boolean(trimmedIamId) && projectCodes.length > 0,
    queryFn: async (): Promise<PersonnelRecord[]> => {
      const params = new URLSearchParams();
      params.set('iamId', trimmedIamId);
      params.set('projectCodes', projectCodes.join(','));
      return await fetchJson<PersonnelRecord[]>(
        `/api/project/personnel?${params.toString()}`
      );
    },
    queryKey: ['personnel', 'by-iam', trimmedIamId, projectCodes] as const,
    staleTime: 60 * 60 * 1000, // 1 hour
  };
};

export const usePersonnelQuery = (iamId: string, projectCodes: string[]) => {
  return useQuery(personnelQueryOptions(iamId, projectCodes));
};
