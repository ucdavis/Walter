import { describe, expect, it } from 'vitest';
import { getPiProjectAlerts } from '@/lib/projectAlerts.ts';
import type { PiWithProjects } from '@/queries/project.ts';

const createPi = (
  employeeId: string,
  projects: Array<{ project_number: string; project_name: string; cat_budget: number; cat_bud_bal: number }>
): PiWithProjects => ({
  employeeId,
  name: `PI ${employeeId}`,
  projectCount: projects.length,
  projects: projects as PiWithProjects['projects'],
  totalBalance: projects.reduce((sum, p) => sum + p.cat_bud_bal, 0),
  totalBudget: projects.reduce((sum, p) => sum + p.cat_budget, 0),
});

describe('getPiProjectAlerts', () => {
  it('aggregates alerts across multiple PIs', () => {
    const pis = [
      createPi('1', [{ project_number: 'P1', project_name: 'Project One', cat_budget: 10000, cat_bud_bal: -500 }]),
      createPi('2', [{ project_number: 'P2', project_name: 'Project Two', cat_budget: 10000, cat_bud_bal: -200 }]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.piEmployeeId)).toContain('1');
    expect(alerts.map((a) => a.piEmployeeId)).toContain('2');
  });

  it('sorts errors before warnings', () => {
    const pis = [
      createPi('1', [
        { project_number: 'P1', project_name: 'Warning Project', cat_budget: 10000, cat_bud_bal: 500 },
        { project_number: 'P2', project_name: 'Error Project', cat_budget: 10000, cat_bud_bal: -100 },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts[0].severity).toBe('error');
    expect(alerts[1].severity).toBe('warning');
  });
});