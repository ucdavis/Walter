import { HttpError } from '@/lib/api.ts';
import { RouterContext } from '@/main.tsx';
import {
  notificationQueryOptions,
  updateNotification,
  useNotificationQuery,
} from '@/queries/notification.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { hasAdminRole } from '@/shared/auth/roleAccess.ts';
import { ArrowLeftIcon, MegaphoneIcon } from '@heroicons/react/24/outline';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/(authenticated)/admin/notification')({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!hasAdminRole(user.roles)) {
      throw redirect({ to: '/admin' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const notificationQuery = useNotificationQuery();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && notificationQuery.data) {
      setEnabled(notificationQuery.data.enabled);
      setMessage(notificationQuery.data.message);
      setHydrated(true);
    }
  }, [hydrated, notificationQuery.data]);

  const saveMutation = useMutation({
    mutationFn: updateNotification,
    onSuccess: (data) => {
      queryClient.setQueryData(notificationQueryOptions().queryKey, data);
    },
  });

  const saveError = saveMutation.error;
  const isSaving = saveMutation.isPending;
  const isLoadingInitial = notificationQuery.isLoading;

  return (
    <main className="mt-8">
      <div className="container">
        <Link className="btn btn-sm mb-4" to="/admin">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Admin Dashboard
        </Link>
        <MegaphoneIcon className="w-6 h-6" />
        <h1 className="h1">Site Notification</h1>
        <p className="subtitle">
          Edit the banner shown at the top of the landing and home pages.
        </p>
        <hr className="border-main-border my-4" />

        {isLoadingInitial ? (
          <div className="flex items-center gap-3 text-sm text-base-content/70">
            <div className="loading loading-spinner loading-sm" />
            <span>Loading notification…</span>
          </div>
        ) : (
          <form
            className="flex max-w-2xl flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.reset();
              saveMutation.mutate({ enabled, message });
            }}
          >
            <label className="label cursor-pointer justify-start gap-3">
              <input
                checked={enabled}
                className="toggle toggle-primary"
                onChange={(e) => setEnabled(e.target.checked)}
                type="checkbox"
              />
              <span className="label-text">Show notification banner</span>
            </label>

            <div>
              <label className="label" htmlFor="notification-message">
                <span className="label-text">Message</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full"
                id="notification-message"
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Walter is in a test environment. Data may be stale."
                rows={4}
                value={message}
              />
              <p className="label">
                <span className="label-text-alt">
                  {message.length} / 2000
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="btn btn-primary"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </button>

              {saveMutation.isSuccess ? (
                <span className="text-sm text-success">Saved.</span>
              ) : null}
            </div>

            {saveError ? (
              <div className="alert alert-error">
                <span>
                  Failed to save{' '}
                  {saveError instanceof HttpError
                    ? `(HTTP ${saveError.status})`
                    : ''}
                  .
                </span>
              </div>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
