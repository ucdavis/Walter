import { fetchJson } from '@/lib/api.ts';
import { useQuery } from '@tanstack/react-query';

export type NotificationData = {
  enabled: boolean;
  message: string;
  updatedOn: string | null;
};

export const notificationQueryOptions = () => ({
  queryFn: async ({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<NotificationData> => {
    return await fetchJson<NotificationData>('/api/notification', {}, signal);
  },
  queryKey: ['notification'] as const,
  staleTime: 60_000,
});

export const useNotificationQuery = () => useQuery(notificationQueryOptions());
