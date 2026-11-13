import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { useProjectionSession } from '@/components/projections/ProjectionSession.tsx';
import { HttpError } from '@/lib/api.ts';
import { useDeleteProjection } from '@/queries/projections.ts';

export function DeleteProjectionDialog({
  conflict,
  iamId,
  onClose,
  onConflict,
  onDeleted,
  onReloaded,
}: {
  conflict: boolean;
  iamId: string;
  onClose: () => void;
  onConflict: () => void;
  onDeleted: () => Promise<void>;
  onReloaded: () => void;
}) {
  const {
    discardSaved,
    error: reloadError,
    reloading,
    session,
  } = useProjectionSession();
  // Retries must authorize the same saved version, never a newer background response.
  const [target] = useState(session.baseline);
  const router = useRouter();
  const mounted = useRef(true);
  const navigationVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = router.subscribe(
      'onBeforeNavigate',
      ({ hrefChanged }) => {
        if (hrefChanged) {
          navigationVersion.current += 1;
        }
      }
    );
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [router]);
  const deletion = useDeleteProjection(iamId, target.id);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [failure, setFailure] = useState<
    'changed' | 'failed' | 'navigation' | null
  >(conflict ? 'changed' : null);
  const [confirmed, setConfirmed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const busy = deletion.isPending || reloading || leaving;
  async function leave() {
    setLeaving(true);
    try {
      await onDeleted();
    } catch {
      setFailure('navigation');
    } finally {
      pending.current = false;
      setLeaving(false);
    }
  }
  async function remove() {
    if (pending.current || failure === 'changed') {
      return;
    }
    const startedAtNavigationVersion = navigationVersion.current;
    pending.current = true;
    setFailure(null);
    try {
      await deletion.mutateAsync(target.updatedAt);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        onConflict();
      }
      setFailure(
        error instanceof HttpError && error.status === 409
          ? 'changed'
          : 'failed'
      );
      pending.current = false;
      return;
    }
    // A completed request must not replace a destination the user chose while it ran.
    if (!mounted.current) {
      return;
    }
    setConfirmed(true);
    pending.current = false;
    if (startedAtNavigationVersion !== navigationVersion.current) {
      return;
    }
    await leave();
  }
  return (
    <ProjectionDialog
      initialFocusRef={cancelRef}
      onClose={() => {
        if (!pending.current && !reloading && !confirmed) {
          onClose();
        }
      }}
      title={`Delete ${target.name}?`}
    >
      <p className="mt-4">
        Permanently delete <strong>{target.name}</strong> and all of its
        planning assumptions? This cannot be undone. Unsaved changes will also
        be lost. Leaving this page will not cancel a deletion request.
      </p>
      {failure && (
        <p className="mt-4 text-error" role="alert">
          {failure === 'navigation'
            ? 'The plan was deleted, but the dashboard could not be opened. Try returning to the dashboard again.'
            : failure === 'changed'
              ? 'This plan changed since you opened it. Nothing was deleted. Discard your edits and reload the saved plan, then review it before trying to delete again.'
              : 'Deletion was not confirmed. Your changes are still here. Retry to delete the same saved version.'}
        </p>
      )}
      {reloadError && (
        <p className="mt-4 text-error" role="alert">
          {reloadError}
        </p>
      )}
      <div className="modal-action flex-wrap">
        <button
          className="btn btn-ghost"
          disabled={busy || confirmed}
          onClick={onClose}
          ref={cancelRef}
          type="button"
        >
          Cancel
        </button>
        {confirmed ? (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void leave()}
            type="button"
          >
            Return to dashboard
          </button>
        ) : failure === 'changed' ? (
          <button
            className="btn btn-outline"
            disabled={busy}
            onClick={async () => {
              const saved = await discardSaved();
              if (saved) {
                onReloaded();
              }
            }}
            type="button"
          >
            {reloading ? 'Reloading...' : 'Discard edits and reload plan'}
          </button>
        ) : (
          <button
            className="btn btn-error"
            disabled={busy}
            onClick={() => void remove()}
            type="button"
          >
            {deletion.isPending
              ? 'Deleting...'
              : failure
                ? 'Retry delete'
                : 'Permanently delete plan'}
          </button>
        )}
      </div>
    </ProjectionDialog>
  );
}
