import { useQueries } from '@tanstack/react-query';
import { getPiProjectAlerts } from '@/lib/projectAlerts.ts';
import {
  projectsDetailQueryOptions,
  type ManagedPiRecord,
  type PiWithProjects,
} from '@/queries/project.ts';
import { AlertCard } from './ProjectAlerts.tsx';

interface PiProjectAlertsProps {
  managedPis: ManagedPiRecord[];
}

export function PiProjectAlerts({ managedPis }: PiProjectAlertsProps) {
  const projectsQueries = useQueries({
    queries: managedPis.map((pi) => projectsDetailQueryOptions(pi.employeeId)),
  });

  if (managedPis.length === 0) {
    return null;
  }

  const firstError = projectsQueries.find((q) => q.isError);
  if (firstError) {
    return (
      <div className="alert alert-error mt-8">
        <span>
          Unable to load alerts:{' '}
          {firstError.error instanceof Error
            ? firstError.error.message
            : 'Unknown error'}
        </span>
      </div>
    );
  }

  const allLoaded = projectsQueries.every((q) => q.isSuccess);
  if (!allLoaded) {
    return (
      <>
        <h2 className="h2 mt-8">Alerts</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      </>
    );
  }

  const now = new Date();
  const pisWithProjects: PiWithProjects[] = managedPis.map((pi, index) => {
    const allProjects = projectsQueries[index]?.data ?? [];
    const projects = allProjects.filter(
      (p) => !p.awardEndDate || new Date(p.awardEndDate) >= now
    );
    const totalBudget = projects.reduce((sum, p) => sum + p.catBudget, 0);
    const totalBalance = projects.reduce((sum, p) => sum + p.catBudBal, 0);

    return {
      employeeId: pi.employeeId,
      name: pi.name,
      projectCount: projects.length,
      projects,
      totalBalance,
      totalBudget,
    };
  });

  const alerts = getPiProjectAlerts(pisWithProjects);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <>
      <h2 className="h2 mt-8">Alerts</h2>
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
    </>
  );
}
