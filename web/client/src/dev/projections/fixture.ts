import { SALARY_CATEGORY } from '@/lib/piProjection.ts';
import type { Projection, ProjectionProject } from '@/queries/projections.ts';

const project = (
  id: number,
  name: string,
  balance: number
): ProjectionProject => ({
  actuals: [
    { amount: 2500, expenditureCategory: SALARY_CATEGORY, month: '2025-12-01' },
  ],
  awardName: null,
  awardNumber: null,
  budgets: [
    {
      budget: balance + 2500,
      committed: 0,
      expenditureCategory: SALARY_CATEGORY,
      isSeeded: true,
      spentToDate: 2500,
    },
  ],
  endDate: '2026-06-30',
  expenses: [],
  id,
  isSeeded: true,
  projectName: name,
  projectNumber: `SYNTHETIC-${id}`,
  projectType: null,
  runRates: [],
  startDate: '2025-12-01',
  taskName: null,
  taskNumber: null,
});

/** Deliberately excludes benefits, COLA, and other costs to isolate the salary rule. */
export function createSalaryExample(): Projection {
  return {
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    historyMonths: 3,
    id: 1,
    jobs: [
      {
        cbrRate: 0,
        colaMonth: 7,
        colaRate: 0,
        employeeId: null,
        endDate: '2026-06-30',
        feeRemissionMonthly: 0,
        fte: 0.5,
        fundingEntries: [1, 2].map((projectId) => ({
          endDate: '2026-06-30',
          isSeeded: true,
          percent: 0.5,
          projectId,
          startDate: '2026-01-01',
        })),
        id: 101,
        isSeeded: true,
        jobCode: null,
        monthlySalary: 10_000,
        name: 'Alex Example',
        positionNumber: 'EXAMPLE-101',
        rateSet: 'DVCMP',
        startDate: '2026-01-01',
        title: 'Research specialist',
        vacationAccrualRate: 0,
      },
    ],
    name: 'Salary planning example',
    piEmployeeId: 'SYNTHETIC',
    projects: [
      project(1, 'Project A', 20_000),
      project(2, 'Project B', 16_000),
    ],
    seededAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: null,
  };
}
