import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { computePiProjection } from '@/lib/piProjection.ts';
import {
  createProjectionSession,
  setJobMonthlySalary,
  type SalaryChange,
} from '@/lib/projectionWorkspace.ts';
import type { Projection } from '@/queries/projections.ts';

function useSession(initialPlan: Projection) {
  const [session, setSession] = useState(() =>
    createProjectionSession(initialPlan)
  );
  const results = useMemo(
    () => computePiProjection(session.draft),
    [session.draft]
  );
  const applySalary = (change: SalaryChange) => {
    setSession((current) => {
      const result = setJobMonthlySalary(current, change);
      return result.ok ? result.session : current;
    });
  };
  return { applySalary, results, session };
}

const SessionContext = createContext<ReturnType<typeof useSession> | null>(
  null
);

/** Mount once for the open plan, above its changing sections and editor targets. */
export function ProjectionSessionProvider({
  children,
  initialPlan,
}: {
  children: ReactNode;
  initialPlan: Projection;
}) {
  const value = useSession(initialPlan);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useProjectionSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('A projection workspace needs an open plan session.');
  }
  return value;
}
