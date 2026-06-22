import { fetchJson } from '../lib/api.ts';
import { useQuery } from '@tanstack/react-query';

export type FeatureFlags = {
  projectionsEnabled: boolean;
};

export const featureFlagsQueryOptions = () => ({
  queryFn: async (): Promise<FeatureFlags> => {
    return await fetchJson<FeatureFlags>('/api/system/features');
  },
  queryKey: ['system', 'features'] as const,
  staleTime: 60 * 60 * 1000, // 1 hour; environment flags rarely change
});

export const useFeatureFlagsQuery = () => {
  return useQuery(featureFlagsQueryOptions());
};
