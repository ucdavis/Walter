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

export type SearchDirectoryPerson = {
  email?: string | null;
  id: string;
  keywords: string[];
  name: string;
};

export type SearchTeamMemberProjectsResponse = {
  principalInvestigators: SearchPerson[];
  projects: SearchProject[];
};

export type ResolveDirectoryPersonResponse = {
  email?: string | null;
  employeeId: string;
  name: string;
};

export type ResolveProjectPiResponse = {
  employeeId: string;
  projectNumber: string;
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

export const searchFinancialProjectsQueryOptions = (query: string) => {
  const q = query.trim();

  return {
    enabled: q.length >= 3,
    gcTime: 0,
    queryFn: async ({
      signal,
    }: {
      signal: AbortSignal;
    }): Promise<SearchProject[]> => {
      if (q.length < 3) {
        return [];
      }

      return await fetchJson<SearchProject[]>(
        `/api/search/projects?query=${encodeURIComponent(q)}`,
        {},
        signal
      );
    },
    queryKey: ['search', 'projects', 'financial', q] as const,
    staleTime: 0,
  };
};

export const useSearchFinancialProjectsQuery = ({
  enabled,
  query,
}: {
  enabled: boolean;
  query: string;
}) => {
  return useQuery({
    ...searchFinancialProjectsQueryOptions(query),
    enabled,
  });
};

export const searchDirectoryPeopleQueryOptions = (query: string) => {
  const q = query.trim();

  return {
    enabled: q.length >= 3,
    gcTime: 0,
    queryFn: async ({
      signal,
    }: {
      signal: AbortSignal;
    }): Promise<SearchDirectoryPerson[]> => {
      if (q.length < 3) {
        return [];
      }
      return await fetchJson<SearchDirectoryPerson[]>(
        `/api/search/people?query=${encodeURIComponent(q)}`,
        {},
        signal
      );
    },
    queryKey: ['search', 'people', q] as const,
    staleTime: 0,
  };
};

export const useSearchDirectoryPeopleQuery = ({
  enabled,
  query,
}: {
  enabled: boolean;
  query: string;
}) => {
  return useQuery({
    ...searchDirectoryPeopleQueryOptions(query),
    enabled,
  });
};

export const peopleSearchQueryOptions = searchDirectoryPeopleQueryOptions;
export const usePeopleSearchQuery = useSearchDirectoryPeopleQuery;

export const resolveProjectPiQueryOptions = ({
  projectNumber,
}: {
  projectNumber: string;
}) => {
  const p = projectNumber.trim();

  return {
    enabled: p.length > 0,
    gcTime: 0,
    queryFn: async ({
      signal,
    }: {
      signal: AbortSignal;
    }): Promise<ResolveProjectPiResponse> => {
      return await fetchJson<ResolveProjectPiResponse>(
        `/api/search/projects/resolve-pi?projectNumber=${encodeURIComponent(p)}`,
        {},
        signal
      );
    },
    queryKey: ['search', 'projects', 'resolve-pi', p] as const,
    staleTime: 0,
  };
};

export const useResolveProjectPiQuery = ({
  enabled,
  projectNumber,
}: {
  enabled: boolean;
  projectNumber: string;
}) => {
  return useQuery({
    ...resolveProjectPiQueryOptions({ projectNumber }),
    enabled,
  });
};

export async function resolveSearchPersonById({
  signal,
  userId,
}: {
  signal?: AbortSignal;
  userId: string;
}): Promise<ResolveDirectoryPersonResponse> {
  const id = userId.trim();
  if (!id) {
    throw new Error('userId is required');
  }

  return await fetchJson<ResolveDirectoryPersonResponse>(
    `/api/search/people/resolve?userId=${encodeURIComponent(id)}`,
    {},
    signal
  );
}
