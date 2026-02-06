import { fetchJson } from '@/lib/api.ts';
import { useQuery } from '@tanstack/react-query';

export type SearchProject = {
  keywords: string[];
  projectPiEmployeeId?: string | null;
  projectName: string;
  projectNumber: string;
};

export type SearchReport = {
  id: string;
  keywords: string[];
  label: string;
  to: string;
};

export type SearchCatalog = {
  projects: SearchProject[];
  reports: SearchReport[];
};

export type SearchPerson = {
  employeeId: string;
  keywords: string[];
  name: string;
};

export type SearchTeamMemberProjectsResponse = {
  principalInvestigators: SearchPerson[];
  projects: SearchProject[];
};

export const searchCatalogQueryOptions = () => ({
  gcTime: Infinity,
  queryFn: async (): Promise<SearchCatalog> => {
    return await fetchJson<SearchCatalog>('/api/search/catalog');
  },
  queryKey: ['search', 'catalog'] as const,
  refetchOnWindowFocus: false,
  staleTime: Infinity,
});

export const useSearchCatalogQuery = ({ enabled }: { enabled: boolean }) => {
  return useQuery({
    ...searchCatalogQueryOptions(),
    enabled,
  });
};

export const searchTeamMemberProjectsQueryOptions = (employeeId: string) => ({
  gcTime: Infinity,
  queryFn: async ({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<SearchTeamMemberProjectsResponse> => {
    return await fetchJson<SearchTeamMemberProjectsResponse>(
      '/api/search/projects/team',
      {},
      signal
    );
  },
  queryKey: ['search', 'projects', 'team', employeeId] as const,
  refetchOnWindowFocus: false,
  staleTime: Infinity,
});

export const useSearchTeamMemberProjectsQuery = ({
  employeeId,
  enabled,
}: {
  employeeId: string;
  enabled: boolean;
}) => {
  return useQuery({
    ...searchTeamMemberProjectsQueryOptions(employeeId),
    enabled,
  });
};

export const peopleSearchQueryOptions = (query: string) => {
  const q = query.trim();

  return {
    enabled: q.length > 0,
    gcTime: 0,
    queryFn: async ({
      signal,
    }: {
      signal: AbortSignal;
    }): Promise<SearchPerson[]> => {
      if (!q) {
        return [];
      }
      return await fetchJson<SearchPerson[]>(
        `/api/search/people?query=${encodeURIComponent(q)}`,
        {},
        signal
      );
    },
    queryKey: ['search', 'people', q] as const,
    staleTime: 0,
  };
};

export const usePeopleSearchQuery = ({
  enabled,
  query,
}: {
  enabled: boolean;
  query: string;
}) => {
  return useQuery({
    ...peopleSearchQueryOptions(query),
    enabled,
  });
};
