import { useNotificationQuery } from '@/queries/notification.ts';

export function NotificationBanner() {
  const { data } = useNotificationQuery();

  if (!data?.enabled || !data.message) {
    return null;
  }

  return (
    <div className="alert alert-warning" role="alert">
      <span>{data.message}</span>
    </div>
  );
}
