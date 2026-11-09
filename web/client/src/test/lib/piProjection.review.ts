import assert from 'node:assert/strict';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import {
  createProjectionSession,
  setAppointmentMonthlySalary,
} from '@/lib/projectionWorkspace.ts';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import type { Projection } from '@/queries/projections.ts';

const SUPPLIES = '05 - Supplies';

/** Synthetic dollars and illustrative rates; these are not UC Davis rate tables. */
function example() {
  const plan = createSalaryExample();
  plan.appointments[0].cbrRate = 0.3;
  plan.appointments[0].vacationAccrualRate = 0.1;
  for (const source of plan.fundingSources) {
    source.actuals = [];
    source.budgets = [
      [SALARY_CATEGORY, 100_000],
      [FRINGE_CATEGORY, 40_000],
      [FEE_REMISSION_CATEGORY, 10_000],
      [SUPPLIES, 10_000],
    ].map(([expenditureCategory, budget]) => ({
      budget: Number(budget),
      committed: 0,
      expenditureCategory: String(expenditureCategory),
      spentToDate: 0,
    }));
  }
  return plan;
}

function edited(plan: Projection) {
  const result = setAppointmentMonthlySalary(createProjectionSession(plan), {
    appointmentId: 101,
    monthlySalary: 11_000,
  });
  assert.equal(result.ok, true);
  return result.session.draft;
}

function costs(plan: Projection, month: string, fundingSourceId = 1) {
  const rows = computePiProjection(plan).rows;
  const amount = (category: string) =>
    rows.find(
      (row) =>
        row.fundingSourceId === fundingSourceId &&
        row.month === month &&
        row.expenditureCategory === category
    )?.projectedAmount ?? 0;
  return {
    fees: amount(FEE_REMISSION_CATEGORY),
    fringe: amount(FRINGE_CATEGORY),
    salary: amount(SALARY_CATEGORY),
    supplies: amount(SUPPLIES),
  };
}

function extendThrough(plan: Projection, end: string) {
  plan.fundingSources.forEach((source) => (source.endDate = end));
  plan.appointments[0].endDate = end;
  plan.appointments[0].allocations.forEach(
    (funding) => (funding.endDate = end)
  );
}

/**
 * Run with `node scripts/review-projection-calculations.ts` from web/client.
 * Check agreed salary scaling and print the date calculations. Other examples
 * distinguish unresolved alternatives from the rules already chosen.
 */
export function reviewProjectionCalculations() {
  const salary = example();
  const salaryAfter = edited(salary);
  const salaryBeforeCosts = costs(salary, '2026-01');
  const salaryAfterCosts = costs(salaryAfter, '2026-01');
  assert.deepEqual(salaryBeforeCosts, {
    fees: 0,
    fringe: 1000,
    salary: 2500,
    supplies: 0,
  });
  assert.deepEqual(salaryAfterCosts, {
    fees: 0,
    fringe: 1100,
    salary: 2750,
    supplies: 0,
  });
  assert.deepEqual(costs(salaryAfter, '2026-01', 2), salaryAfterCosts);
  assert.equal(salary.appointments[0].monthlySalary, 10_000);

  const cola = example();
  extendThrough(cola, '2028-08-31');
  cola.appointments[0].colaRate = 0.03;
  const julySnapshot = structuredClone(cola);
  julySnapshot.seededAt = '2026-07-15T00:00:00Z';
  julySnapshot.fundingSources.forEach(
    (source) => (source.capturedAt = julySnapshot.seededAt)
  );
  const futureAppointment = structuredClone(cola);
  futureAppointment.appointments[0].isSeeded = false;
  futureAppointment.appointments[0].startDate = '2026-08-01';
  assert.equal(costs(futureAppointment, '2026-08').salary, 2500);
  assert.equal(costs(futureAppointment, '2027-07').salary, 2575);

  const fees = structuredClone(cola);
  fees.appointments[0].feeRemissionMonthly = 1500;
  assert.equal(costs(fees, '2026-07').fees, 750);
  assert.equal(costs(edited(fees), '2026-07').fees, 750);

  const datedFees = structuredClone(fees);
  datedFees.appointments[0].startDate = '2026-04-10';
  datedFees.appointments[0].endDate = '2026-04-30';
  datedFees.appointments[0].allocations = [
    {
      ...datedFees.appointments[0].allocations[0],
      endDate: '2026-04-24',
      startDate: '2026-04-01',
    },
  ];
  datedFees.fundingSources[0].startDate = '2026-04-01';
  datedFees.fundingSources[0].endDate = '2026-04-30';
  assert.equal(costs(datedFees, '2026-04').fees, 375);

  const boundaries = example();
  boundaries.seededAt = '2026-01-15T00:00:00Z';
  boundaries.fundingSources.forEach(
    (source) => (source.capturedAt = boundaries.seededAt)
  );
  boundaries.appointments[0].startDate = '2026-02-15';
  boundaries.appointments[0].endDate = '2026-03-10';
  boundaries.appointments[0].allocations[0].startDate = '2026-02-20';
  boundaries.appointments[0].allocations[0].endDate = '2026-03-05';
  boundaries.appointments[0].allocations[1].startDate = '2026-03-31';
  boundaries.appointments[0].allocations[1].endDate = '2026-04-01';

  const futureSource = example();
  futureSource.fundingSources[0].startDate = '2026-04-01';
  futureSource.fundingSources[0].expenses = [
    {
      amount: 310,
      description: 'Synthetic monthly supplies',
      endMonth: null,
      expenditureCategory: SUPPLIES,
      kind: 'Monthly',
      startMonth: null,
    },
    {
      amount: 200,
      description: 'Synthetic February purchase',
      endMonth: null,
      expenditureCategory: SUPPLIES,
      kind: 'OneTime',
      startMonth: '2026-02-01',
    },
  ];

  const currentActuals = example();
  currentActuals.seededAt = '2026-10-16T00:00:00Z';
  currentActuals.fundingSources.forEach(
    (source) => (source.capturedAt = currentActuals.seededAt)
  );
  extendThrough(currentActuals, '2026-11-30');
  currentActuals.fundingSources = [currentActuals.fundingSources[0]];
  currentActuals.appointments[0].allocations = [
    { ...currentActuals.appointments[0].allocations[0], percent: 1 },
  ];
  currentActuals.appointments[0].feeRemissionMonthly = 1500;
  const currentSource = currentActuals.fundingSources[0];
  // These current totals explicitly include each October actual below.
  const currentTotals = [20_000, 8000, 2000, 2000];
  const octoberActuals = [2500, 1000, 750, 100];
  currentSource.budgets.forEach((budget, index) => {
    budget.spentToDate = currentTotals[index];
    currentSource.actuals.push({
      amount: octoberActuals[index],
      expenditureCategory: budget.expenditureCategory,
      month: '2026-10-01',
    });
  });
  currentSource.expenses = [{ ...futureSource.fundingSources[0].expenses[0] }];
  const snapshotFee = computePiProjection(currentActuals).rows.find(
    (row) =>
      row.month === '2026-10' &&
      row.expenditureCategory === FEE_REMISSION_CATEGORY
  );
  assert.equal(snapshotFee?.actualAmount, 750);
  assert.equal(snapshotFee?.projectedAmount, 1500);
  assert.equal(snapshotFee?.remaining, 6500);

  const fundingSwitch = example();
  fundingSwitch.appointments[0].allocations = [
    {
      ...fundingSwitch.appointments[0].allocations[0],
      endDate: '2026-03-15',
      percent: 1,
      startDate: '2026-03-01',
    },
    {
      ...fundingSwitch.appointments[0].allocations[1],
      endDate: '2026-03-31',
      percent: 1,
      startDate: '2026-03-16',
    },
  ];

  const recurringDates = [
    { end: '2026-10-31', start: null },
    { end: '2026-10-20', start: null },
    { end: '2026-10-31', start: '2026-10-20' },
  ].map(({ end, start }) => {
    const plan = structuredClone(currentActuals);
    plan.appointments = [];
    plan.fundingSources[0].startDate = start;
    plan.fundingSources[0].endDate = end;
    return { end, start, supplies: costs(plan, '2026-10').supplies };
  });

  const oneTime = structuredClone(currentActuals);
  oneTime.appointments = [];
  oneTime.fundingSources[0].endDate = '2026-10-10';
  oneTime.fundingSources[0].expenses = ['2026-09', '2026-10', '2026-11'].map(
    (month) => ({
      amount: 1000,
      description: `Synthetic ${month} purchase`,
      endMonth: null,
      expenditureCategory: SUPPLIES,
      kind: 'OneTime',
      startMonth: `${month}-01`,
    })
  );

  return {
    establishedSalaryExample: {
      afterPerSource: salaryAfterCosts,
      assumptions:
        'Snapshot 2026-01-01. Full-time annual salary 120000 to 132000. FTE 0.5, each source share 0.5, illustrative CBR 0.30 plus vacation 0.10. No COLA or fees.',
      beforePerSource: salaryBeforeCosts,
      independentlyWorked:
        'Each source: salary 2500 to 2750; fringe 1000 to 1100; total 3500 to 3850, a 350 increase. Both funding sources together: 7000 to 7700. Agreed scaling assertions passed.',
    },
    reviewExamples: [
      {
        assumptions:
          'Same base salary/FTE/shares/rates. Snapshot 2026-01-01, July COLA 3%, source and appointment through 2028-08-31. Values are for Project A; Project B is identical.',
        current: ['2026-06', '2026-07', '2027-07', '2028-07'].map((month) => ({
          afterSalaryEdit: costs(edited(cola), month),
          beforeSalaryEdit: costs(cola, month),
          month,
        })),
        independentlyWorked:
          'Before edit salary/fringe: June 2026 = 2500/1000; July 2026 = 2575/1030; July 2027 = 2652.25/1060.90; July 2028 = 2731.8175/1092.727. After edit: 2750/1100; 2832.50/1133; 2917.475/1166.99; 3004.99925/1201.9997. Assumes annual compounding with no intermediate rounding.',
        rule: 'COLA compounds once each configured annual month strictly after the salary base month.',
        topic: 'Multi-year COLA',
      },
      {
        assumptions:
          'Same 120000 annual salary and July 3% COLA, but snapshot is July 15, 2026.',
        current: ['2026-07', '2027-07', '2028-07'].map((month) => ({
          ...costs(julySnapshot, month),
          month,
        })),
        independentlyWorked:
          'The entered 120000 is the snapshot rate. Per-source salaries are 2500 in July 2026, then 2575 and 2652.25 in the next two Julys.',
        rule: 'Imported salaries use the snapshot month as their base; do not apply another increase within that month.',
        topic: 'Snapshot during COLA month',
      },
      {
        assumptions:
          'Snapshot Jan 1, 2026. New appointment starts Aug 1 with full-time annual salary 120000 and July COLA 3%.',
        current: ['2026-08', '2027-07', '2028-07'].map((month) => ({
          ...costs(futureAppointment, month),
          month,
        })),
        independentlyWorked:
          '120000 is the August starting rate. At 0.5 FTE and a 0.5 source share, salary is 2500 per source until July 2027, then 2575 and 2652.25 in the next two Julys. Benefits follow the same salary increases.',
        rule: 'A planned future hire receives its first COLA in the configured month strictly after its start month. Imported appointments retain the snapshot-based rule.',
        topic: 'Future hire starting rate',
      },
      {
        assumptions:
          'Fixed fee remission input 1500/month, FTE 0.5, each source share 0.5. July COLA 3%.',
        current: ['2026-01', '2026-07', '2027-07'].map((month) => ({
          afterSalaryEdit: costs(edited(fees), month).fees,
          beforeSalaryEdit: costs(fees, month).fees,
          month,
        })),
        independentlyWorked:
          'The appointment-level monthly fee is 1500. Each source owes 750 at its 0.5 funding share, regardless of salary, FTE, or COLA.',
        question:
          'Should category 08 historical estimates continue alongside employee fees? They remain additive until that separate decision.',
        rule: 'Prorate employee fees by inclusive source, appointment, and funding days. Include the entire eligible snapshot month without subtracting booked category 08 costs.',
        topic: 'Fee remission allocation',
      },
      {
        assumptions:
          'Appointment fee 1500/month, appointment April 10 through 30, source April 1 through 30, and 0.5 funding share April 1 through 24.',
        current: costs(datedFees, '2026-04'),
        independentlyWorked:
          'April 10 through 24 gives 15 eligible days: 1500 × 0.5 × 15/30 = 375. FTE, salary, and COLA do not change the fee amount.',
        rule: 'Use the inclusive intersection of all three date ranges and divide by the calendar days in the month.',
        topic: 'Fee remission date boundaries',
      },
      {
        assumptions:
          'Snapshot 2026-01-15. Appointment Feb 15 to Mar 10. Project A funding Feb 20 to Mar 5; Project B funding Mar 31 to Apr 1. Each share remains 0.5.',
        current: ['2026-01', '2026-02', '2026-03', '2026-04'].map((month) => ({
          month,
          projectA: costs(boundaries, month, 1),
          projectB: costs(boundaries, month, 2),
        })),
        independentlyWorked:
          'Project A salary/fringe is 803.5714285714/321.4285714286 in February (9/28 days), then 403.2258064516/161.2903225806 in March (5/31 days). Project B is zero because its funding dates never overlap the appointment.',
        rule: 'Use the inclusive intersection of source, appointment, and funding dates; prorate salary and fringe by eligible calendar days.',
        topic: 'Job and funding date boundaries',
      },
      {
        assumptions:
          'Snapshot Jan 1, 2026. Project A starts Apr 1 and ends Jun 30. Appointment/allocation already active Jan 1. Monthly supplies 310 plus one-time February supplies 200.',
        current: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-06'].map(
          (month) => ({ ...costs(futureSource, month), month })
        ),
        independentlyWorked:
          'January through March salary/fringe/supplies are zero; April salary/fringe/supplies are 2500/1000/310. The February one-time purchase stays in the plan but contributes no forecast before the source starts.',
        rule: 'Funding source dates bound personnel and recurring expense estimates. A one-time expense requires its month to overlap the source dates.',
        topic: 'Future source start',
      },
      {
        assumptions:
          'A 0.5-FTE appointment at 10000 monthly full-time salary. Project A funds 100% of the appointment March 1 through 15; Project B funds 100% March 16 through 31. Illustrative benefits remain 40%.',
        current: {
          projectA: costs(fundingSwitch, '2026-03', 1),
          projectB: costs(fundingSwitch, '2026-03', 2),
        },
        independentlyWorked:
          'Salary is 5000 × 15/31 = 2419.3548387097 for A and 5000 × 16/31 = 2580.6451612903 for B, totaling 5000. Benefits total 2000, split by the same fractions.',
        rule: 'Each entry uses its own eligible days and entered share. Sequential full allocations do not each charge a whole month.',
        topic: 'Funding switch within a month',
      },
      {
        assumptions:
          'Snapshot October 16, 2026. A 310 monthly supplies estimate with three different source date ranges.',
        current: recurringDates,
        independentlyWorked:
          'A source active all October adds 150 for October 17 through 31. Ending October 20 adds 40 for October 17 through 20. Starting October 20 adds 120 for October 20 through 31.',
        rule: 'Recurring estimates use source-active days and exclude the snapshot day and earlier days in the snapshot month.',
        topic: 'Recurring expense dates',
      },
      {
        assumptions:
          'Snapshot October 16, 2026. Funding source ends October 10. Three explicit 1000 one-time expenses specify September, October, and November.',
        current: ['2026-09', '2026-10', '2026-11'].map((month) => ({
          month,
          supplies: costs(oneTime, month).supplies,
        })),
        independentlyWorked:
          'September and November add zero. October adds the full 1000 even though the source ended before the snapshot date. All three expense entries stay in the plan.',
        rule: 'One-time expenses specify a month, not a posting day. Charge the full amount in an eligible month; retain out-of-range entries without forecasting them.',
        topic: 'One-time expense month eligibility',
      },
      {
        assumptions:
          'Snapshot Oct 16, 2026. One source receives all 0.5-FTE salary. Budgets salary/fringe/fee/supplies = 100000/40000/10000/10000. spentToDate current totals = 20000/8000/2000/2000, already including October actuals 2500/1000/750/100. Monthly supplies 310; 15 remaining days yield 150.',
        current: computePiProjection(currentActuals).rows.filter(
          (row) => row.month === '2026-10'
        ),
        independentlyWorked:
          'Keeping booked costs and forecasting only the salary/fringe remainder: salary remaining 77500 = 100000-20000-max(5000-2500,0); fringe 31000 = 40000-8000-max(2000-1000,0). Supplies remaining 7850 = 10000-2000-150 because its actual 100 is already spent. Fee remaining is 6500 = 10000-2000-1500: the full eligible employee fee stays additive, and the booked 750 is already included in spentToDate.',
        rule: 'Use the latest imported inputs anchored to the saved UTC snapshot. Salary/fringe keep their nonnegative remainder forecast; employee fees remain additive because category 08 can contain other costs. Snapshot actuals are not deducted from current balances a second time.',
        topic: 'Current-month actuals and current-total balances',
      },
    ],
  };
}
