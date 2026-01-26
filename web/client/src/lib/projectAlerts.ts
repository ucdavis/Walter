import { summarizeProjectByNumber, type ProjectSummary } from '@/lib/projectSummary.ts';
import type { PiWithProjects, ProjectRecord } from '@/queries/project.ts';

export interface Alert {
  id: string;
  message: string;
  severity: 'error' | 'warning';
  type: 'negative-balance' | 'low-budget' | 'ending-soon';
}

/**
 * Generate alerts for a single project based on its summary data.
 * Used by both the project overview (with links) and project detail (without links) pages.
 *
 * @param prefix - Text prepended to alert messages (e.g., "This project " → "This project has negative balance")
 */
export function getAlertsForProject(
  summary: ProjectSummary,
  prefix = 'This project '
): Alert[] {
  const alerts: Alert[] = [];
  const { balance, budget } = summary.totals;

  // Check for negative balance (error)
  if (balance < 0) {
    alerts.push({
      id: `negative-balance-${summary.projectNumber}`,
      message: `${prefix}has a negative balance`,
      severity: 'error',
      type: 'negative-balance',
    });
  }
  // Check if budget is less than 10% remaining (warning)
  else if (budget > 0 && balance > 0 && balance / budget < 0.1) {
    alerts.push({
      id: `low-budget-${summary.projectNumber}`,
      message: `${prefix}has less than 10% budget remaining`,
      severity: 'warning',
      type: 'low-budget',
    });
  }

  // Check if project ends within 3 months (warning)
  if (summary.awardEndDate) {
    const endDate = new Date(summary.awardEndDate);
    const now = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    if (endDate <= threeMonthsFromNow && endDate > now) {
      alerts.push({
        id: `ending-soon-${summary.projectNumber}`,
        message: `${prefix}ends on ${endDate.toLocaleDateString()}`,
        severity: 'warning',
        type: 'ending-soon',
      });
    }
  }

  return alerts;
}

export interface PiProjectAlert extends Alert {
  balance: number;
  piEmployeeId: string;
  projectNumber: string;
}

/**
 * Aggregate alerts across all projects managed by PIs.
 * Returns top 3 alerts sorted by severity (errors first) then by balance.
 */
export function getPiProjectAlerts(managedPis: PiWithProjects[]): PiProjectAlert[] {
  const alerts: PiProjectAlert[] = [];

  for (const pi of managedPis) {
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

  return alerts
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'error' ? -1 : 1;
      }
      return a.balance - b.balance;
    })
    .slice(0, 3);
}
