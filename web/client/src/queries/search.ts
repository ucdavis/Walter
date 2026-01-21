import { fetchJson } from '@/lib/api.ts';
import { useQuery } from '@tanstack/react-query';

export type SearchProject = {
  keywords: string[];
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

export const peopleSearchQueryOptions = (query: string) => ({
  enabled: query.trim().length > 0,
  gcTime: 0,
  queryFn: async ({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<SearchPerson[]> => {
    const q = query.trim();
    if (!q) {
      return [];
    }
    return await fetchJson<SearchPerson[]>(
      `/api/search/people?query=${encodeURIComponent(q)}`,
      {},
      signal
    );
  },
  queryKey: ['search', 'people', query] as const,
  staleTime: 0,
});

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
