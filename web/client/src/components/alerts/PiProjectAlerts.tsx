import { getAlertsForProject, type Alert } from '@/lib/projectAlerts.ts';
import { summarizeProjectByNumber } from '@/lib/projectSummary.ts';
import { PiWithProjects, ProjectRecord } from '@/queries/project.ts';
import { AlertCard } from './ProjectAlerts.tsx';

interface PiProjectAlert extends Alert {
  balance: number;
  piEmployeeId: string;
  projectNumber: string;
}

export function getPiProjectAlerts(managedPis: PiWithProjects[]): PiProjectAlert[] {
  const alerts: PiProjectAlert[] = [];

  for (const pi of managedPis) {
    // Group projects by project number
    const projectMap = new Map<string, ProjectRecord[]>();
    for (const p of pi.projects) {
      const existing = projectMap.get(p.project_number) ?? [];
      existing.push(p);
      projectMap.set(p.project_number, existing);
    }

    for (const [projectNumber, records] of projectMap) {
      const summary = summarizeProjectByNumber(records, projectNumber);
      if (!summary) continue;

      const projectAlerts = getAlertsForProject(summary, `${summary.projectName} `);

      for (const alert of projectAlerts) {
        alerts.push({
          ...alert,
          balance: summary.totals.balance,
          piEmployeeId: pi.employeeId,
          projectNumber,
        });
      }
    }
  }

  // Sort: errors first, then by balance ascending (most negative first for errors, lowest remaining for warnings)
  return alerts
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'error' ? -1 : 1;
      }
      return a.balance - b.balance;
    })
    .slice(0, 3);
}

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
