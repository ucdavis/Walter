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
  iamId,
  onCreated,
  projection,
}: {
  iamId: string;
  onCreated: (saved: Projection) => Promise<void>;
  projection: ProjectionSummary;
}) {
  const router = useRouter();
  const duplicate = useDuplicateProjection(iamId, projection.id);
  const [failed, setFailed] = useState(false);
  const intent = useRef<DuplicateProjectionRequest | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const navigationVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    // Destination loaders can keep this list mounted after the user has chosen another page.
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
    if (pending.current) {
      return;
    }
    intent.current ??= {
      creationKey: crypto.randomUUID(),
      name: `${projection.name.slice(0, 195)} copy`,
    };
    const startedAtNavigationVersion = navigationVersion.current;
    pending.current = true;
    setFailed(false);
    try {
      const saved = await duplicate.mutateAsync(intent.current);
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
    }
  }

  return (
    <div>
      <button
        className="btn btn-outline btn-sm"
        disabled={duplicate.isPending}
        onClick={() => void copy()}
        type="button"
      >
        {duplicate.isPending
          ? `Duplicating ${projection.name}...`
          : failed
            ? `Retry duplicate ${projection.name}`
            : `Duplicate ${projection.name}`}
      </button>
      {failed && (
        <p className="mt-2 text-sm text-error" role="alert">
          Duplication was not confirmed. Retry to recover the same copy.
        </p>
      )}
    </div>
  );
}
