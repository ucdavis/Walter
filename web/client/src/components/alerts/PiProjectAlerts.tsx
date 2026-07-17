import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  getPiProjectAlerts,
  type PiProjectAlert,
} from '@/lib/projectAlerts.ts';
import { getLocalDateOnly, parseProjectDate } from '@/lib/date.ts';
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
  const navigablePis = useMemo(
    () => managedPis.filter((pi) => Boolean(pi.iamId)),
    [managedPis]
  );
  const projectsQueries = useQueries({
    queries: navigablePis.map((pi) => projectsDetailQueryOptions(pi.iamId!)),
  });

  const firstError = projectsQueries.find((q) => q.isError);
  const allLoaded = projectsQueries.every((q) => q.isSuccess);
  const isLoading = navigablePis.length > 0 && !allLoaded && !firstError;

  let alerts: PiProjectAlert[] = [];
  if (allLoaded && navigablePis.length > 0) {
    const today = getLocalDateOnly();
    const pisWithProjects: PiWithProjects[] = navigablePis.map((pi, index) => {
      const allProjects = projectsQueries[index]?.data ?? [];
      const projects = allProjects.filter((p) => {
        if (p.pmEmployeeId !== pmEmployeeId) {
          return false;
        }

        if (!p.awardEndDate) {
          return true;
        }

        const awardEndDate = parseProjectDate(p.awardEndDate);

        return awardEndDate ? awardEndDate >= today : false;
      });
      const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
      const totalBalance = projects.reduce((sum, p) => sum + p.balance, 0);

      return {
        employeeId: pi.employeeId,
        iamId: pi.iamId,
        name: pi.name,
        projectCount: projects.length,
        projects,
        totalBalance,
        totalBudget,
      };
    });

    alerts = getPiProjectAlerts(pisWithProjects);
  }

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
  const { alerts, error, isError, isLoading } = usePiProjectAlerts(
    managedPis,
    pmEmployeeId
  );

  if (managedPis.length === 0) {
    return null;
  }

  if (isError) {
    return (
      <div className="alert alert-error mt-8">
        <span>Unable to load alerts: {error?.message ?? 'Unknown error'}</span>
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
    return <p className="mt-4 text-base-content/70">No alerts</p>;
  }

  const iamIdByEmployeeId = new Map(
    managedPis.filter((pi) => pi.iamId).map((pi) => [pi.employeeId, pi.iamId!])
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      {alerts.map((alert) => {
        const iamId = iamIdByEmployeeId.get(alert.piEmployeeId);
        return (
          <AlertCard
            alert={alert}
            balance={alert.balance}
            key={alert.id}
            linkParams={
              iamId ? { iamId, projectNumber: alert.projectNumber } : undefined
            }
          />
        );
      })}
    </div>
  );
}
