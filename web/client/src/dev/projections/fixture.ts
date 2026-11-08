import {
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
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

/** Booked costs are included in spentToDate. Benefit rates are illustrative only. */
export function createBookedSalaryExample(): Projection {
  const plan = createSalaryExample();
  plan.name = 'Booked salary example';
  plan.createdAt = plan.seededAt = plan.updatedAt = '2026-01-16T00:00:00Z';
  plan.jobs[0].cbrRate = 0.3;
  plan.jobs[0].vacationAccrualRate = 0.1;
  for (const project of plan.projects) {
    project.budgets = [
      {
        budget: 20_000,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        isSeeded: true,
        spentToDate: 1000,
      },
      {
        budget: 8000,
        committed: 0,
        expenditureCategory: FRINGE_CATEGORY,
        isSeeded: true,
        spentToDate: 400,
      },
    ];
    project.actuals = project.budgets.map((budget) => ({
      amount: budget.spentToDate,
      expenditureCategory: budget.expenditureCategory,
      month: '2026-01-01',
    }));
  }
  return plan;
}

/** Partial funding dates isolate proration and a funding entry that never overlaps its job. */
export function createDateBoundaryExample(): Projection {
  const plan = createBookedSalaryExample();
  plan.name = 'Date boundary example';
  plan.createdAt = plan.seededAt = plan.updatedAt = '2026-01-15T00:00:00Z';
  const job = plan.jobs[0];
  job.startDate = '2026-02-15';
  job.endDate = '2026-03-10';
  job.fundingEntries[0].startDate = '2026-02-20';
  job.fundingEntries[0].endDate = '2026-03-05';
  job.fundingEntries[1].startDate = '2026-03-31';
  job.fundingEntries[1].endDate = '2026-04-01';
  for (const project of plan.projects) {
    project.startDate = '2026-01-01';
    project.endDate = '2026-04-30';
    project.actuals = [];
    for (const budget of project.budgets) {
      budget.spentToDate = 0;
    }
  }
  return plan;
}

/** A hypothetical hire starts at the entered salary, with its first COLA the following July. */
export function createFutureHireExample(): Projection {
  const plan = createSalaryExample();
  plan.name = 'Future hire example';
  const job = plan.jobs[0];
  job.isSeeded = false;
  job.employeeId = null;
  job.positionNumber = null;
  job.startDate = '2026-08-01';
  job.endDate = '2027-08-31';
  job.colaRate = 0.03;
  for (const funding of job.fundingEntries) {
    funding.isSeeded = false;
    funding.startDate = job.startDate;
    funding.endDate = job.endDate;
  }
  for (const project of plan.projects) {
    project.startDate = '2026-01-01';
    project.endDate = '2027-08-31';
    project.actuals = [];
    for (const budget of project.budgets) {
      budget.budget = 60_000;
      budget.spentToDate = 0;
    }
  }
  return plan;
}

/** Booked category 08 costs stay fixed while the entered fee follows its eligible dates. */
export function createFeeExample(): Projection {
  const plan = createSalaryExample();
  plan.name = 'Fee remission example';
  plan.createdAt = plan.seededAt = plan.updatedAt = '2026-04-16T00:00:00Z';
  const job = plan.jobs[0];
  job.monthlySalary = 0;
  job.feeRemissionMonthly = 1500;
  job.startDate = '2026-04-16';
  job.endDate = '2026-05-31';
  for (const funding of job.fundingEntries) {
    funding.startDate = job.startDate;
    funding.endDate = job.endDate;
  }
  for (const project of plan.projects) {
    project.startDate = '2026-04-01';
    project.endDate = '2026-05-31';
    project.budgets = [
      {
        budget: 10_000,
        committed: 0,
        expenditureCategory: FEE_REMISSION_CATEGORY,
        isSeeded: true,
        spentToDate: 400,
      },
    ];
    project.actuals = [
      {
        amount: 400,
        expenditureCategory: FEE_REMISSION_CATEGORY,
        month: '2026-04-01',
      },
    ];
  }
  return plan;
}
