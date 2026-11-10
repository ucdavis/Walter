import { fetchJson } from '@/lib/api.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { useQuery } from '@tanstack/react-query';

export type FeatureFlags = {
  burndownEnabled: boolean;
  expenditureProgressEnabled: boolean;
  projectCostsEnabled: boolean;
  projectionsEnabled: boolean;
};

export const featureFlagsQueryOptions = (userId: string) => ({
  queryFn: async (): Promise<FeatureFlags> => {
    return await fetchJson<FeatureFlags>('/api/system/features', { cache: 'no-store' });
  },
  // Identity separates browser results only; the server uses the authentication cookie.
  queryKey: ['system', 'features', userId] as const,
  refetchInterval: 2 * 60_000,
  staleTime: 60_000,
});

export const useFeatureFlagsQuery = () => {
  const user = useUser();
  return useQuery(featureFlagsQueryOptions(user.id));
};
