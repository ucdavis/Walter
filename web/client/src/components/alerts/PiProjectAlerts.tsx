import { getPiProjectAlerts } from '@/lib/projectAlerts.ts';
import type { PiWithProjects } from '@/queries/project.ts';
import { AlertCard } from './ProjectAlerts.tsx';

interface PiProjectAlertsProps {
  managedPis: PiWithProjects[];
}

export function PiProjectAlerts({ managedPis }: PiProjectAlertsProps) {
  const alerts = getPiProjectAlerts(managedPis);

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