import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  getPiProjectAlerts,
  type PiProjectAlert,
} from '@/lib/projectAlerts.ts';
import {
  projectsDetailQueryOptions,
  type ManagedPiRecord,
  type PiWithProjects,
} from '@/queries/project.ts';
import { AlertCard } from './ProjectAlerts.tsx';

export interface PiProjectAlertsState {
  alerts: PiProjectAlert[];
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
}

export function usePiProjectAlerts(
  managedPis: ManagedPiRecord[],
  pmEmployeeId: string
): PiProjectAlertsState {
  const projectsQueries = useQueries({
    queries: managedPis.map((pi) => projectsDetailQueryOptions(pi.employeeId)),
  });

  const firstError = projectsQueries.find((q) => q.isError);
  const allLoaded = projectsQueries.every((q) => q.isSuccess);
  const isLoading =
    managedPis.length > 0 && !allLoaded && !firstError;

  const alerts = useMemo(() => {
    if (!allLoaded || managedPis.length === 0) return [];

    const now = new Date();
    const pisWithProjects: PiWithProjects[] = managedPis.map((pi, index) => {
      const allProjects = projectsQueries[index]?.data ?? [];
      const projects = allProjects.filter(
        (p) =>
          p.pmEmployeeId === pmEmployeeId &&
          (!p.awardEndDate || new Date(p.awardEndDate) >= now)
      );
      const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
      const totalBalance = projects.reduce((sum, p) => sum + p.balance, 0);

      return {
        employeeId: pi.employeeId,
        name: pi.name,
        projectCount: projects.length,
        projects,
        totalBalance,
        totalBudget,
      };
    });

    return getPiProjectAlerts(pisWithProjects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, managedPis, pmEmployeeId]);

  return {
    alerts,
    error: firstError?.error instanceof Error ? firstError.error : null,
    isError: !!firstError,
    isLoading,
  };
}

interface PiProjectAlertsProps {
  managedPis: ManagedPiRecord[];
  pmEmployeeId: string;
}

export function PiProjectAlerts({
  managedPis,
  pmEmployeeId,
}: PiProjectAlertsProps) {
  const { alerts, isLoading, isError, error } = usePiProjectAlerts(
    managedPis,
    pmEmployeeId
  );

  if (managedPis.length === 0) {
    return null;
  }

  if (isError) {
    return (
      <div className="alert alert-error mt-8">
        <span>
          Unable to load alerts: {error?.message ?? 'Unknown error'}
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mt-4 flex flex-col gap-4">
        <div className="skeleton h-12 w-full" />
        <div className="skeleton h-12 w-full" />
        <div className="skeleton h-12 w-full" />
      </div>
    );
  }

  if (alerts.length === 0) {
    return <p className="mt-4 text-base-content/60">No alerts</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {alerts.map((alert) => (
        <AlertCard
          alert={alert}
          balance={alert.balance}
          key={alert.id}
          linkParams={{
            employeeId: alert.piEmployeeId,
            projectNumber: alert.projectNumber,
          }}
        />
      ))}
    </div>
  );
}
