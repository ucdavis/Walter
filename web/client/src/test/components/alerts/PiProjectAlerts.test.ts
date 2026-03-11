import { describe, expect, it } from 'vitest';
import { getPiProjectAlerts } from '@/lib/projectAlerts.ts';
import type { PiWithProjects } from '@/queries/project.ts';

const createPi = (
  employeeId: string,
  projects: Array<{
    projectNumber: string;
    projectName: string;
    ppmBudget: number;
    ppmBudBal: number;
  }>
): PiWithProjects => ({
  employeeId,
  name: `PI ${employeeId}`,
  projectCount: projects.length,
  projects: projects as PiWithProjects['projects'],
  totalBalance: projects.reduce((sum, p) => sum + p.ppmBudBal, 0),
  totalBudget: projects.reduce((sum, p) => sum + p.ppmBudget, 0),
});

describe('getPiProjectAlerts', () => {
  it('aggregates alerts across multiple PIs', () => {
    const pis = [
      createPi('1', [
        {
          projectNumber: 'P1',
          projectName: 'Project One',
          ppmBudget: 10000,
          ppmBudBal: -500,
        },
      ]),
      createPi('2', [
        {
          projectNumber: 'P2',
          projectName: 'Project Two',
          ppmBudget: 10000,
          ppmBudBal: -200,
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.piEmployeeId)).toContain('1');
    expect(alerts.map((a) => a.piEmployeeId)).toContain('2');
  });

  it('sorts errors before warnings', () => {
    const pis = [
      createPi('1', [
        {
          projectNumber: 'P1',
          projectName: 'Warning Project',
          ppmBudget: 10000,
          ppmBudBal: 500,
        },
        {
          projectNumber: 'P2',
          projectName: 'Error Project',
          ppmBudget: 10000,
          ppmBudBal: -100,
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts[0].severity).toBe('error');
    expect(alerts[1].severity).toBe('warning');
  });
});
