import { formatCurrency } from '@/lib/currency.ts';
import { PiWithProjects, ProjectRecord } from '@/queries/project.ts';
import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';

export interface ProjectAlert {
  balance: number;
  id: string;
  message: string;
  piEmployeeId: string;
  projectNumber: string;
  type: 'error' | 'warning';
}

export function getProjectAlerts(managedPis: PiWithProjects[]): ProjectAlert[] {
  const alerts: ProjectAlert[] = [];

  for (const pi of managedPis) {
    // Group projects by project number
    const projectMap = new Map<string, ProjectRecord[]>();
    for (const p of pi.projects) {
      const existing = projectMap.get(p.project_number) ?? [];
      existing.push(p);
      projectMap.set(p.project_number, existing);
    }

    for (const [projectNumber, records] of projectMap) {
      const first = records[0];
      const totalBudget = records.reduce((sum, r) => sum + r.cat_budget, 0);
      const totalBalance = records.reduce((sum, r) => sum + r.cat_bud_bal, 0);

      if (totalBalance < 0) {
        alerts.push({
          balance: totalBalance,
          id: `budget-${projectNumber}`,
          message: `${first.project_name} has negative balance`,
          piEmployeeId: pi.employeeId,
          projectNumber,
          type: 'error',
        });
      } else if (totalBudget > 0 && totalBalance > 0 && totalBalance / totalBudget < 0.1) {
        alerts.push({
          balance: totalBalance,
          id: `budget-${projectNumber}`,
          message: `${first.project_name} has less than 10% budget remaining`,
          piEmployeeId: pi.employeeId,
          projectNumber,
          type: 'warning',
        });
      }
    }
  }

  // Sort: errors first, then by balance ascending (most negative first for errors, lowest remaining for warnings)
  return alerts
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'error' ? -1 : 1;
      }
      return a.balance - b.balance;
    })
    .slice(0, 3);
}

interface ProjectAlertsProps {
  managedPis: PiWithProjects[];
}

export function ProjectAlerts({ managedPis }: ProjectAlertsProps) {
  const alerts = getProjectAlerts(managedPis);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <>
      <h2 className="h2 mt-8">Alerts</h2>
      <div className="mt-4 flex flex-col gap-4">
        {alerts.map((alert) => (
          <Link
            className={`alert alert-${alert.type} alert-soft`}
            key={alert.id}
            params={{
              employeeId: alert.piEmployeeId,
              projectNumber: alert.projectNumber,
            }}
            role="alert"
            to="/projects/$employeeId/$projectNumber/"
          >
            {alert.type === 'error' ? (
              <ExclamationCircleIcon className="h-5 w-5" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5" />
            )}
            <span>
              {alert.message} ({formatCurrency(alert.balance)})
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
