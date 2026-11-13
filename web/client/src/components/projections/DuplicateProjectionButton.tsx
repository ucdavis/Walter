import { DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { HttpError } from '@/lib/api.ts';
import {
  useDuplicateProjection,
  type DuplicateProjectionRequest,
  type Projection,
  type ProjectionSummary,
} from '@/queries/projections.ts';

export function DuplicateProjectionButton({
  canDuplicate,
  disabled = false,
  iamId,
  onBusyChange,
  onCreated,
  projection,
}: {
  canDuplicate?: () => boolean;
  disabled?: boolean;
  iamId: string;
  onBusyChange?: (busy: boolean) => void;
  onCreated: (saved: Projection) => Promise<void>;
  projection: ProjectionSummary;
}) {
  const router = useRouter();
  const duplicate = useDuplicateProjection(iamId, projection.id);
  const [created, setCreated] = useState<Projection | null>(null);
  const [failed, setFailed] = useState(false);
  const intent = useRef<DuplicateProjectionRequest | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const navigationVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    // Destination loaders can keep this component mounted after the user has chosen another page.
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

  async function copy() {
    if (pending.current || disabled || canDuplicate?.() === false) {
      return;
    }
    intent.current ??= {
      creationKey: crypto.randomUUID(),
      name: `${projection.name.slice(0, 195)} copy`,
    };
    const startedAtNavigationVersion = navigationVersion.current;
    pending.current = true;
    onBusyChange?.(true);
    setFailed(false);
    try {
      const saved = created ?? (await duplicate.mutateAsync(intent.current));
      if (mounted.current) {
        setCreated(saved);
      }
      if (
        mounted.current &&
        startedAtNavigationVersion === navigationVersion.current
      ) {
        await onCreated(saved);
      }
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      if (error instanceof HttpError && error.status === 400) {
        intent.current = null;
      }
      setFailed(true);
    } finally {
      pending.current = false;
      if (mounted.current) {
        onBusyChange?.(false);
      }
    }
  }

  return (
    <div>
      <button
        aria-label={
          duplicate.isPending
            ? `Duplicating ${projection.name}...`
            : created
              ? `Open copy of ${projection.name}`
              : failed
                ? `Retry duplicate ${projection.name}`
                : `Duplicate ${projection.name}`
        }
        className="btn btn-outline btn-sm"
        disabled={disabled || duplicate.isPending}
        onClick={() => void copy()}
        title={
          disabled ? 'Save changes before duplicating' : 'Copies the saved plan'
        }
        type="button"
      >
        <DocumentDuplicateIcon aria-hidden="true" className="size-4" />
        {duplicate.isPending
          ? 'Duplicating...'
          : created
            ? 'Open copy'
            : failed
              ? 'Retry duplicate'
              : 'Duplicate plan'}
      </button>
      {failed && !created && (
        <p className="mt-2 text-sm text-error" role="alert">
          Duplication was not confirmed. Retry to recover the same copy.
        </p>
      )}
    </div>
  );
}
