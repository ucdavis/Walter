import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { HttpError } from '@/lib/api.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import {
  acknowledgeProjectionSave,
  createProjectionSession,
  setJobMonthlySalary,
  type SalaryChange,
} from '@/lib/projectionWorkspace.ts';
import type {
  Projection,
  SaveProjectionRequest,
} from '@/queries/projections.ts';

export interface ProjectionPersistence {
  reload: () => Promise<Projection>;
  save: (request: SaveProjectionRequest) => Promise<Projection>;
}

type Conflict = 'conflict' | 'snapshotChanged' | 'deleted';

function conflictCode(error: unknown): Conflict | null {
  if (!(error instanceof HttpError)) {
    return null;
  }
  if (error.status === 404) {
    return 'deleted';
  }
  if (error.status !== 409) {
    return null;
  }
  return error.body &&
    typeof error.body === 'object' &&
    'code' in error.body &&
    error.body.code === 'snapshotChanged'
    ? 'snapshotChanged'
    : 'conflict';
}

function logFailure(operation: 'save' | 'reload', error: unknown) {
  // Do not log the exception body or draft: both can contain personnel and salary information.
  // eslint-disable-next-line no-console
  console.error('Projection request failed', {
    operation,
    status: error instanceof HttpError ? error.status : null,
  });
}

function useSession(
  initialPlan: Projection,
  persistence?: ProjectionPersistence
) {
  const [session, setSession] = useState(() =>
    createProjectionSession(initialPlan)
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );
  const [reloading, setReloading] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestPending = useRef(false);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentSession = useRef(session);
  useLayoutEffect(() => {
    currentSession.current = session;
  }, [session]);
  const results = useMemo(
    () => computePiProjection(session.draft),
    [session.draft]
  );
  const applySalary = (change: SalaryChange) => {
    setSession((current) => {
      const result = setJobMonthlySalary(current, change);
      return result.ok ? result.session : current;
    });
    setSaveStatus((status) => (status === 'saving' ? status : 'idle'));
  };

  const save = async (overwrite = false) => {
    if (!persistence || requestPending.current) {
      return;
    }
    const useOverwrite = overwrite || overwriteConfirmed;
    if (conflict && (conflict !== 'conflict' || !useOverwrite)) {
      setConflictOpen(true);
      return;
    }
    if (overwrite && conflict !== 'conflict' && !overwriteConfirmed) {
      return;
    }
    const submitted = currentSession.current;
    const { historyMonths, jobs, name, projects } = submitted.draft;
    // Capture the current applied draft on this click, independently of any open field buffer.
    const request = structuredClone({
      expectedSeededAt: submitted.baseline.seededAt,
      expectedUpdatedAt: submitted.baseline.updatedAt,
      historyMonths,
      jobs,
      name,
      overwrite: useOverwrite,
      projects,
    });
    requestPending.current = true;
    if (useOverwrite) {
      setOverwriteConfirmed(true);
    }
    setError(null);
    setConflictOpen(false);
    setSaveStatus('saving');
    try {
      const saved = await persistence.save(request);
      setSession((current) =>
        acknowledgeProjectionSave(current, submitted, saved)
      );
      setConflict(null);
      setOverwriteConfirmed(false);
      setSaveStatus('saved');
    } catch (error_) {
      const nextConflict = conflictCode(error_);
      if (nextConflict) {
        setConflict(nextConflict);
        setConflictOpen(true);
      } else {
        logFailure('save', error_);
        setError(
          'Save was not confirmed. Your changes are still here. Try Save plan again.'
        );
      }
      setSaveStatus('idle');
    } finally {
      requestPending.current = false;
    }
  };

  const discardSaved = async () => {
    if (!persistence || requestPending.current) {
      return null;
    }
    requestPending.current = true;
    setReloading(true);
    setError(null);
    try {
      const saved = await persistence.reload();
      // A discarded plan may finish loading after departure; it must not navigate the next session.
      if (!mounted.current) {
        return null;
      }
      setSession((current) => ({
        ...createProjectionSession(saved),
        revision: current.revision + 1,
      }));
      setReloadVersion((version) => version + 1);
      setConflict(null);
      setOverwriteConfirmed(false);
      setConflictOpen(false);
      setSaveStatus('idle');
      return saved;
    } catch (error_) {
      logFailure('reload', error_);
      setError(
        'The saved plan could not be loaded. Your changes are still here. Try Discard again.'
      );
      if (conflictCode(error_) === 'deleted') {
        setConflict('deleted');
      }
      return null;
    } finally {
      requestPending.current = false;
      setReloading(false);
    }
  };

  return {
    applySalary,
    canSave: Boolean(persistence),
    conflict,
    conflictOpen,
    discardSaved,
    dismissConflict: () => setConflictOpen(false),
    error,
    overwrite: () => save(true),
    persistenceStatus: persistence
      ? {
          conflict,
          conflictOpen,
          error,
          reloading,
          saveStatus,
          saving: saveStatus === 'saving',
        }
      : null,
    reloading,
    reloadVersion,
    results,
    save: () => save(),
    saveStatus,
    saving: saveStatus === 'saving',
    session,
  };
}

const SessionContext = createContext<ReturnType<typeof useSession> | null>(
  null
);

/** Mount once for the open plan, above its changing sections and editor targets. */
export function ProjectionSessionProvider({
  children,
  initialPlan,
  persistence,
}: {
  children: ReactNode;
  initialPlan: Projection;
  persistence?: ProjectionPersistence;
}) {
  const value = useSession(initialPlan, persistence);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useProjectionSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('A projection workspace needs an open plan session.');
  }
  return value;
}
