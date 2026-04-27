import { useNotificationQuery } from '@/queries/notification.ts';
import { MegaphoneIcon } from '@heroicons/react/24/outline';

export function NotificationBanner() {
  const { data } = useNotificationQuery();

  if (!data?.enabled || !data.message) {
    return null;
  }

  return (
    <div
      className="alert alert-warning alert-soft rounded-none border-x-0 border-t-0 px-6 py-2"
      role="alert"
    >
      <MegaphoneIcon className="h-5 w-5 shrink-0" />
      <span>{data.message}</span>
    </div>
  );
}
