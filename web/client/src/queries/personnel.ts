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

export const personnelQueryOptions = () => ({
  queryFn: async (): Promise<PersonnelRecord[]> => {
    return await fetchJson<PersonnelRecord[]>('/api/project/personnel');
  },
  queryKey: ['personnel'] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const usePersonnelQuery = () => {
  return useQuery(personnelQueryOptions());
};

// Project-specific personnel query (for project detail pages)
export const projectPersonnelQueryOptions = (projectCodes: string[]) => ({
  enabled: projectCodes.length > 0,
  queryFn: async (): Promise<PersonnelRecord[]> => {
    const params = new URLSearchParams();
    projectCodes.forEach((code) => params.append('projectCodes', code));
    return await fetchJson<PersonnelRecord[]>(
      `/api/project/personnel?${params.toString()}`
    );
  },
  queryKey: ['personnel', 'projects', projectCodes] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useProjectPersonnelQuery = (projectCodes: string[]) => {
  return useQuery(projectPersonnelQueryOptions(projectCodes));
};
