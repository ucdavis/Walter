import type { PersonnelRecord } from '@/queries/personnel.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import type { ProjectProjectionResult } from '@/queries/projectProjection.ts';
import type { Transaction } from '@/queries/transaction.ts';
import type { User } from '@/queries/user.ts';

export const DEFAULT_DEMO_SEED = 42;
export const DEMO_IAM_ID = '9000000001';
export const DEMO_PROJECT = 'DEMOSPN001';

const categories = [
  '01 - Salaries and Wages',
  '02 - Fringe Benefits',
  '03 - Supplies / Services / Other Expenses',
  '04 - Equipment and Facilities',
  '05 - Contracts (Subrecipients)',
  '07 - Travel',
  '08 - Fellowship & Scholarships',
  '09 - Indirect Costs',
];

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

export function monthAt(asOf: string, offset: number) {
  const [year, month] = asOf.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

// Allocate integer cents, carrying the remainder into the last item so every
// detail row, monthly series, and exported total reconciles to the same ledger.
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = total;
  return weights.map((weight, index) => {
    const value =
      index === weights.length - 1 ? left : Math.floor((total * weight) / sum);
    left -= value;
    return value;
  });
}

const dollars = (value: number) => value / 100;

type Amounts = [budget: number, expenses: number, commitments: number];

export function createDemoData(
  seed = DEFAULT_DEMO_SEED,
  asOf = new Date().toISOString().slice(0, 7)
) {
  const random = randomSource(seed);
  const vary = (value: number) =>
    Math.round(value * 100 * (0.96 + random() * 0.08));
  const projects: ProjectRecord[] = [];
  const transactions: Transaction[] = [];
  const projections: Record<string, ProjectProjectionResult> = {};
  const user: User = {
    email: 'morgan.reed@example.com',
    employeeId: 'DEMO-PI',
    iamId: DEMO_IAM_ID,
    id: 'demo-user',
    isEmulating: false,
    kerberos: 'demo-reed',
    name: 'Morgan Reed',
    roles: [],
  };

  function addProject(
    projectNumber: string,
    name: string,
    rows: { amounts: Amounts[]; task: string; taskName: string }[],
    internal = false,
    closed = false
  ) {
    const startOffset = closed ? -48 : -38;
    const endOffset = closed ? -14 : 13;
    const lastActualOffset = closed ? endOffset : -1;
    const projection: ProjectProjectionResult = { categories: [], periods: [] };
    projections[projectNumber] = projection;

    for (const [taskIndex, task] of rows.entries()) {
      for (const [index, amounts] of task.amounts.entries()) {
        const budget = vary(amounts[0]);
        const expenseTarget = vary(amounts[1]);
        const commitments = vary(amounts[2]);
        const category = categories[index];
        const months = Array.from(
          { length: lastActualOffset - startOffset + 1 },
          (_, i) => monthAt(asOf, startOffset + i)
        );
        const monthlyExpenses = allocate(
          expenseTarget,
          months.map(
            (_, i) => (0.7 + random() * 0.6) * (1 + (i / months.length) * 0.4)
          )
        );
        let spent = 0;
        for (const [i, month] of months.entries()) {
          const actual = monthlyExpenses[i];
          spent += actual;
          if (actual !== 0) {
            transactions.push({
              accountingPeriod: month,
              burdenedCostInReceiverLedgerCurrency: dollars(actual),
              contractNumber: internal ? '' : `DEMO-AWARD-${projectNumber}`,
              creationDate: `${month}-28`,
              expenditureCategory: category,
              expenditureItemDate: `${month}-15`,
              expenditureType: category.slice(5),
              fundingSources: internal
                ? 'Research support'
                : 'Example Science Foundation',
              projectNumber,
              rawCostInReceiverLedgerCurrency: dollars(actual),
              taskNumber: task.task,
            });
          }
          projection.periods.push({
            actualAmount: dollars(actual),
            displayPeriod: month,
            expenditureCategory: category,
            isPersonnel: index < 2 ? 1 : 0,
            kind: 'actual',
            month,
            projectedAmount: 0,
            remaining: dollars(budget - spent),
          });
        }

        const balance = budget - spent - commitments;
        projection.categories.push({
          budget: dollars(budget),
          committed: dollars(commitments),
          expenditureCategory: category,
          isPersonnel: index < 2 ? 1 : 0,
          remainingNow: dollars(balance),
          spentToDate: dollars(spent),
        });

        if (!closed) {
          // Commitments are reserved once at the forecast boundary. Future
          // amounts are additional spending, not a second charge for that reserve.
          let remaining = balance;
          const forecast = Math.round(
            monthlyExpenses.slice(-6).reduce((a, b) => a + b, 0) / 6
          );
          for (let offset = 0; offset <= endOffset; offset++) {
            const projected = offset === 0 ? 0 : forecast;
            remaining -= projected;
            projection.periods.push({
              actualAmount: 0,
              displayPeriod: monthAt(asOf, offset),
              expenditureCategory: category,
              isPersonnel: index < 2 ? 1 : 0,
              kind: offset === 0 ? 'blended' : 'projected',
              month: monthAt(asOf, offset),
              projectedAmount: dollars(projected),
              remaining: dollars(remaining),
            });
          }
        }

        projects.push({
          activityCode: '000000',
          activityDesc: 'Research',
          awardCloseDate: closed ? `${monthAt(asOf, endOffset + 3)}-28` : null,
          awardEndDate: internal ? null : `${monthAt(asOf, endOffset)}-28`,
          awardName: internal ? null : name,
          awardNumber: internal ? null : `DEMO-AWARD-${projectNumber}`,
          awardPi: internal ? null : user.name,
          awardStartDate: internal ? null : `${monthAt(asOf, startOffset)}-01`,
          awardStatus: internal ? null : closed ? 'Closed' : 'Active',
          awardType: internal ? null : 'Research grant',
          balance: dollars(balance),
          billingCycle: internal ? null : 'Monthly',
          budget: dollars(budget),
          commitments: dollars(commitments),
          contractAdministrator: internal ? null : 'Avery Brooks',
          copi: null,
          costShareRequiredBySponsor: internal ? null : 'No',
          displayName: name,
          expenditureCategoryName: category,
          expenses: dollars(spent),
          flowThroughFundsAmount: null,
          flowThroughFundsEndDate: null,
          flowThroughFundsPrimarySponsor: null,
          flowThroughFundsReferenceAwardName: null,
          flowThroughFundsStartDate: null,
          fundCode: internal
            ? `D${String(taskIndex + 1).padStart(4, '0')}`
            : 'D5000',
          fundDesc: internal ? task.taskName : 'Sponsored research',
          grantAdministrator: internal ? null : 'Avery Brooks',
          ownerName: 'Reed, Morgan',
          pa: 'Avery Brooks',
          pi: user.name,
          pm: 'Casey Ellis',
          pmEmployeeId: 'DEMO-PM',
          postReportingPeriod: `${monthAt(asOf, -1)}-28`,
          ppmBudBal: dollars(balance),
          ppmBudget: dollars(budget),
          ppmCommitments: dollars(commitments),
          ppmExpenses: dollars(spent),
          primarySponsorName: internal ? null : 'Example Science Foundation',
          programCode: '000',
          programDesc: 'Research',
          projectBurdenCostRate: internal ? null : '0.60',
          projectBurdenScheduleBase: internal
            ? null
            : 'Modified total direct costs',
          projectFund: internal ? null : 'D5000',
          projectName: name,
          projectNumber,
          projectOwningOrg: 'Ecology and Environmental Science',
          projectOwningOrgCode: 'DEMO001',
          projectStatusCode: closed ? 'CLOSED' : 'ACTIVE',
          projectType: internal ? 'Internal' : 'Sponsored',
          purposeDesc: 'Research',
          sponsorAwardNumber: internal ? null : `DEMO-${projectNumber}`,
          taskName: task.taskName,
          taskNum: task.task,
          taskStatus: closed ? 'Inactive' : 'Active',
        });
      }
    }

    // A category can span internal tasks. The projection API groups categories
    // across tasks, just as the detail and portfolio screens do.
    const grouped = new Map<
      string,
      ProjectProjectionResult['categories'][number]
    >();
    for (const category of projection.categories) {
      const existing = grouped.get(category.expenditureCategory);
      if (existing) {
        for (const key of [
          'budget',
          'committed',
          'remainingNow',
          'spentToDate',
        ] as const) {
          existing[key] =
            Math.round((existing[key] + category[key]) * 100) / 100;
        }
      } else {
        grouped.set(category.expenditureCategory, { ...category });
      }
    }
    projection.categories = [...grouped.values()];
  }

  addProject(DEMO_PROJECT, 'Mapping Pollinator Diversity Across California', [
    {
      amounts: [
        [212_000, 127_800, 0],
        [50_500, 29_100, 0],
        [84_500, 4800, 0],
        [6000, 1800, 0],
        [0, 0, 52_800],
        [5000, 7600, 0],
        [0, 6200, 0],
        [190_000, 101_500, 0],
      ],
      task: 'TASK01',
      taskName: 'Collaborative biodiversity research',
    },
  ]);

  const tasks: [string, string, number, number, number][] = [
    ['CHAIR', 'Endowed chair research support', 282_000, 207_000, 240],
    ['RESEARCH', 'Agricultural research allocation', 207_000, 201_000, 0],
    ['SEED', 'Early career seed research', 6800, 3550, 0],
    ['OUTREACH', 'Community biodiversity day', 1100, 2250, 0],
    ['GIFTS', 'Field collection research gifts', 9800, 9350, 0],
    ['TRAVEL', 'Graduate student travel awards', 4500, 3500, 0],
    ['TRAINING', 'Graduate research training', 6200, 4850, 0],
    ['SYMPOS', 'Ecology research symposium', 4400, 2100, 0],
  ];
  addProject(
    'DEMOINT001',
    'Morgan Reed Research and Teaching Support',
    tasks.map(([task, taskName, budget, expenses, commitments]) => {
      const weights = [48, 16, 18, 4, 0, 9, 5, 0];
      const budgets = allocate(budget * 100, weights);
      const spending = allocate(expenses * 100, weights);
      return {
        amounts: weights.map(
          (_, i): Amounts => [
            budgets[i] / 100,
            spending[i] / 100,
            i === 2 ? commitments : 0,
          ]
        ),
        task,
        taskName,
      };
    }),
    true
  );

  addProject(
    'DEMOCLO001',
    'Coastal Habitat Field Survey',
    [
      {
        amounts: [
          [75_000, 65_000, 0],
          [19_000, 16_700, 0],
          [27_000, 23_600, 0],
          [5000, 4800, 0],
          [0, 0, 0],
          [9000, 8600, 0],
          [4000, 3800, 0],
          [46_000, 41_400, 0],
        ],
        task: 'TASK01',
        taskName: 'Habitat survey and specimen collection',
      },
    ],
    false,
    true
  );
  addProject(
    'DEMOCLO002',
    'Native Bee Research Training',
    [
      {
        amounts: [
          [24_000, 26_500, 0],
          [6000, 6800, 0],
          [10_000, 11_200, 0],
          [2000, 1900, 0],
          [0, 0, 0],
          [7000, 8600, 0],
          [5000, 5300, 0],
          [14_000, 15_100, 0],
        ],
        task: 'TASK01',
        taskName: 'Field methods and student research',
      },
    ],
    false,
    true
  );

  const people: [string, string, number, number, number, string, string][] = [
    [
      'Jordan Chen',
      'Postdoctoral researcher',
      6125,
      1,
      0.25,
      DEMO_PROJECT,
      'TASK01',
    ],
    [
      'Sam Rivera',
      'Student research assistant',
      3000,
      0.24,
      0.02,
      DEMO_PROJECT,
      'TASK01',
    ],
    [
      'Taylor Patel',
      'Student research assistant',
      3000,
      0.24,
      0.02,
      DEMO_PROJECT,
      'TASK01',
    ],
    [
      'Alex Kim',
      'Graduate student researcher',
      8100,
      0.5,
      0.02,
      'DEMOINT001',
      'CHAIR',
    ],
    [
      'Jamie Park',
      'Graduate student researcher',
      8100,
      0.5,
      0.02,
      'DEMOINT001',
      'RESEARCH',
    ],
    [
      'Robin Bell',
      'Staff research associate',
      6900,
      1,
      0.52,
      'DEMOINT001',
      'CHAIR',
    ],
  ];
  const personnel: PersonnelRecord[] = people.map(
    (
      [
        name,
        positionDescription,
        rate,
        fte,
        compositeBenefitRate,
        projectId,
        task,
      ],
      i
    ) => ({
      compositeBenefitRate,
      distributionPercent: 100,
      employeeId: `DEMO-EMP-${i + 1}`,
      fte,
      fundingEffectiveDate: `${monthAt(asOf, -2)}-01`,
      fundingEndDate: `${monthAt(asOf, 10)}-28`,
      jobCode: `D${String(i + 1).padStart(5, '0')}`,
      jobEffectiveDate: `${monthAt(asOf, -6)}-01`,
      jobEndDate: `${monthAt(asOf, 10)}-28`,
      monthlyRate: Math.round(dollars(vary(rate)) / 25) * 25,
      name,
      positionDescription,
      positionNumber: `DEMO-POS-${i + 1}`,
      projectDescription: projects.find((p) => p.projectNumber === projectId)!
        .projectName,
      projectId,
      projectType: projectId === DEMO_PROJECT ? 'Sponsored' : 'Internal',
      task,
    })
  );
  for (const [projectNumber, projection] of Object.entries(projections)) {
    const grouped = new Map<
      string,
      ProjectProjectionResult['periods'][number]
    >();
    for (const period of projection.periods) {
      const key = `${period.expenditureCategory}|${period.month}`;
      const existing = grouped.get(key);
      if (existing) {
        for (const field of [
          'actualAmount',
          'projectedAmount',
          'remaining',
        ] as const) {
          existing[field] =
            Math.round((existing[field] + period[field]) * 100) / 100;
        }
      } else {
        grouped.set(key, { ...period });
      }
    }
    projection.periods = [...grouped.values()].sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    // Match Walter's personnel forecast to the current appointments displayed
    // in the table. Historical payroll remains the historical transaction ledger.
    const appointments = personnel.filter((p) => p.projectId === projectNumber);
    for (const category of projection.categories.filter(
      (c) => c.isPersonnel === 1
    )) {
      const monthlyCost = appointments.reduce((sum, p) => {
        const salary = (p.monthlyRate * p.fte * p.distributionPercent) / 100;
        return (
          sum +
          Math.round(
            salary *
              (category.expenditureCategory === categories[0]
                ? 1
                : p.compositeBenefitRate) *
              100
          )
        );
      }, 0);
      let remaining = Math.round(category.remainingNow * 100);
      for (const period of projection.periods.filter(
        (p) =>
          p.expenditureCategory === category.expenditureCategory &&
          p.kind !== 'actual'
      )) {
        const projected = period.kind === 'blended' ? 0 : monthlyCost;
        remaining -= projected;
        period.projectedAmount = dollars(projected);
        period.remaining = dollars(remaining);
      }
    }
  }
  return { asOf, personnel, projections, projects, seed, transactions, user };
}

export type DemoData = ReturnType<typeof createDemoData>;
