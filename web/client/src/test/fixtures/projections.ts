import {
  EQUIPMENT_CATEGORY,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import type {
  Projection,
  ProjectionFundingSource,
  ProjectionLookups,
} from '@/queries/projections.ts';
import { DEFAULT_FORECAST_MONTHS } from '@/lib/projectionDetails.ts';
export function createAppointmentLookupsExample(): ProjectionLookups {
  return {
    appointmentDefaults: { cbrRate: 0.2, colaMonth: 7, colaRate: 0.03, fte: 1 },
    expenditureCategories: [
      SALARY_CATEGORY,
      FRINGE_CATEGORY,
      SUPPLIES_CATEGORY,
      EQUIPMENT_CATEGORY,
      FEE_REMISSION_CATEGORY,
    ],
    jobCodes: [
      {
        cbr: 0.3,
        jobCode: 'EXAMPLE',
        rateSet: 'DVCMP',
        title: 'Research specialist',
        vacationAccrual: 0.05,
      },
      {
        cbr: 0.4,
        jobCode: 'EXAMPLE',
        rateSet: 'UCANR',
        title: 'Research specialist',
        vacationAccrual: 0.06,
      },
    ],
  };
}

const source = (
  id: number,
  name: string,
  balance: number
): ProjectionFundingSource => ({
  actuals: [
    { amount: 2500, expenditureCategory: SALARY_CATEGORY, month: '2025-12-01' },
  ],
  awardName: null,
  awardNumber: null,
  balanceAdjustment: 0,
  budgets: [
    {
      budget: balance + 2500,
      committed: 0,
      expenditureCategory: SALARY_CATEGORY,
      spentToDate: 2500,
    },
  ],
  capturedAt: '2026-01-01T00:00:00Z',
  capturedEndDate: '2026-06-30',
  capturedStartDate: '2025-12-01',
  categoryAdjustments: [],
  endDate: '2026-06-30',
  expenses: [],
  historicalExpenseOverrides: [],
  id,
  initialPlannedBalance: 0,
  name,
  plannedBudgetMode: null,
  projectName: name,
  projectNumber: `SYNTHETIC-${id}`,
  projectType: null,
  runRates: [],
  sourceKind: 'Task',
  startDate: '2025-12-01',
  taskName: null,
  taskNumber: null,
});

/** Deliberately excludes benefits, COLA, and other costs to isolate the salary rule. */
export function createSalaryExample(): Projection {
  return {
    content: {
      appointments: [
        {
          allocations: [1, 2].map((fundingSourceId) => ({
            endDate: '2026-06-30',
            fundingSourceId,
            percent: 0.5,
            startDate: '2026-01-01',
          })),
          cbrRate: 0,
          colaMonth: 7,
          colaRate: 0,
          employeeId: null,
          endDate: '2026-06-30',
          feeRemissionMonthly: 0,
          fte: 0.5,
          hasUnmatchedFunding: false,
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
      forecastMonths: DEFAULT_FORECAST_MONTHS,
      fundingSources: [
        source(1, 'Project A', 20_000),
        source(2, 'Project B', 16_000),
      ],
      historyMonths: 3,
      notes: null,
    },
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    id: 1,
    name: 'Salary planning example',
    piEmployeeId: 'SYNTHETIC',
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
  plan.content.appointments[0].cbrRate = 0.3;
  plan.content.appointments[0].vacationAccrualRate = 0.1;
  for (const source of plan.content.fundingSources) {
    source.capturedAt = plan.seededAt;
    source.budgets = [
      {
        budget: 20_000,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        spentToDate: 1000,
      },
      {
        budget: 8000,
        committed: 0,
        expenditureCategory: FRINGE_CATEGORY,
        spentToDate: 400,
      },
    ];
    source.actuals = source.budgets.map((budget) => ({
      amount: budget.spentToDate,
      expenditureCategory: budget.expenditureCategory,
      month: '2026-01-01',
    }));
  }
  return plan;
}
