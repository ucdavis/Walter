import type {
  PlanExpense,
  PlanFunding,
} from '@/components/guidedProjections/defaults.ts';
import type {
  FundingSplit,
  ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';
import {
  indexToMonth,
  monthToIndex,
} from '@/components/projections/projection.ts';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import type {
  Projection,
  ProjectionExpense,
  ProjectionJob,
  ProjectionProject,
} from '@/queries/projections.ts';

const OUTSIDE = '__outside__';
const ADJUSTMENT = 'Guided plan balance adjustment';
const COLORS = [
  '#1d4776',
  '#2d806e',
  '#a45f16',
  '#7854a2',
  '#ae4e66',
  '#487e95',
];
const projectKey = (id: number) => `project-${id}`;
const jobKey = (id: number) => `job-${id}`;
const month = (value: string | null, fallback: string) =>
  value?.slice(0, 7) ?? fallback;
const balance = (project: ProjectionProject) =>
  project.budgets.reduce(
    (total, item) => total + item.budget - item.spentToDate - item.committed,
    0
  );
const startMonth = (projection: Projection) =>
  projection.settings?.startMonth ?? projection.seededAt.slice(0, 7);
const endMonth = (projection: Projection) =>
  indexToMonth(
    monthToIndex(startMonth(projection)) +
      (projection.settings?.months ?? 12) -
      1
  );
const lastDay = (value: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return '';
  }
  const [year, m] = value.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
};

function displayExpense(
  expense: ProjectionExpense,
  projectId: string,
  index: number | string,
  seedMonth: string
): PlanExpense {
  return {
    amount: expense.amount,
    frequency: expense.kind === 'OneTime' ? 'once' : 'monthly',
    fundingId: projectId,
    id: `expense-${projectId}-${index}`,
    month: month(expense.startMonth, seedMonth),
    name: expense.description ?? expense.expenditureCategory,
    serverExpense: structuredClone(expense),
  };
}

/** Keeps the source document alongside editable fields so a save retains data the guided editor does not expose. */
export function fromServerProjection(projection: Projection): ProjectionPlan {
  const source = structuredClone(projection);
  const start = startMonth(source);
  const end = endMonth(source);
  return {
    expenses: source.projects.flatMap((project) =>
      project.expenses.map((expense, i) =>
        displayExpense(
          expense,
          projectKey(project.id),
          i,
          source.seededAt.slice(0, 7)
        )
      )
    ),
    funding: source.projects.map((project, i) => ({
      color: COLORS[i % COLORS.length],
      description: [
        project.projectNumber,
        project.taskNumber && `Task ${project.taskNumber}`,
        project.taskName,
      ]
        .filter(Boolean)
        .join(' · '),
      endDate: project.endDate ?? lastDay(end),
      id: projectKey(project.id),
      indirectRate: 0,
      name: project.projectName,
      serverProject: structuredClone(project),
      startDate: project.startDate ?? `${source.seededAt.slice(0, 7)}-01`,
      startingBalance: balance(project),
    })),
    historyMonths: source.historyMonths,
    id: source.id > 0 ? String(source.id) : 'walter-default-plan',
    months: source.settings?.months ?? 12,
    name: source.name,
    note: source.settings?.note ?? '',
    selectedFunding:
      source.settings?.selectedProjectIds?.map(projectKey) ??
      source.projects.map((p) => projectKey(p.id)),
    serverProjection: source,
    staff: source.jobs.map((job) => ({
      annualSalary: (job.monthlySalary ?? 0) * 12,
      endMonth: month(job.endDate, end),
      fringeRate: (job.cbrRate ?? 0) * 100,
      fundingId: job.fundingEntries[0]?.projectId
        ? projectKey(job.fundingEntries[0].projectId)
        : OUTSIDE,
      id: jobKey(job.id),
      included: !source.settings?.excludedJobIds?.includes(job.id),
      name: job.name,
      percent: (job.fundingEntries[0]?.percent ?? 0) * job.fte * 100,
      salaryMissing: job.monthlySalary === null,
      serverJob: structuredClone(job),
      splits: job.fundingEntries.map((entry, i) => ({
        endMonth: month(entry.endDate, end),
        fundingId:
          entry.projectId === null ? OUTSIDE : projectKey(entry.projectId),
        id: `split-${job.id}-${i}`,
        percent: entry.percent * job.fte * 100,
        serverEndMonth: month(entry.endDate, end),
        serverEntry: structuredClone(entry),
        serverStartMonth: month(entry.startDate, source.seededAt.slice(0, 7)),
        startMonth: month(entry.startDate, source.seededAt.slice(0, 7)),
      })),
      startMonth: month(job.startDate, start),
    })),
    startMonth: start,
  };
}

function newProject(id: number, fund: PlanFunding): ProjectionProject {
  return {
    actuals: [],
    awardName: null,
    awardNumber: null,
    budgets: [],
    endDate: fund.endDate,
    expenses: [],
    id,
    isSeeded: false,
    projectName: fund.name,
    projectNumber: null,
    projectType: null,
    runRates: [],
    startDate: fund.startDate,
    taskName: null,
    taskNumber: null,
  };
}

function newJob(id: number): ProjectionJob {
  return {
    cbrRate: 0,
    colaMonth: 7,
    colaRate: 0,
    employeeId: null,
    endDate: null,
    feeRemissionMonthly: null,
    fte: 1,
    fundingEntries: [],
    id,
    isSeeded: false,
    jobCode: null,
    monthlySalary: 0,
    name: '',
    positionNumber: null,
    rateSet: 'DVCMP',
    startDate: null,
    title: null,
    vacationAccrualRate: 0,
  };
}

function saveExpense(
  expense: PlanExpense,
  source: Projection
): ProjectionExpense {
  const original = expense.serverExpense;
  const sameFrequency =
    original &&
    expense.frequency === (original.kind === 'OneTime' ? 'once' : 'monthly');
  return {
    amount: expense.amount,
    description:
      original &&
      expense.name === (original.description ?? original.expenditureCategory)
        ? original.description
        : expense.name,
    endMonth: original?.endMonth ?? null,
    expenditureCategory: original?.expenditureCategory ?? 'Other expenses',
    kind: sameFrequency
      ? original.kind
      : expense.frequency === 'once'
        ? 'OneTime'
        : 'Monthly',
    startMonth:
      original &&
      expense.month === month(original.startMonth, source.seededAt.slice(0, 7))
        ? original.startMonth
        : `${expense.month}-01`,
  };
}

function saveEntry(
  split: FundingSplit,
  fte: number,
  projectIds: Map<string, number>,
  source: Projection
) {
  const original = split.serverEntry;
  return {
    endDate:
      original && split.endMonth === month(original.endDate, endMonth(source))
        ? original.endDate
        : lastDay(split.endMonth),
    isSeeded: original?.isSeeded ?? false,
    percent:
      original && split.percent === original.percent * fte * 100
        ? original.percent
        : fte > 0
          ? split.percent / (fte * 100)
          : (original?.percent ?? 0),
    projectId:
      split.fundingId === OUTSIDE
        ? null
        : (projectIds.get(split.fundingId) ?? null),
    startDate:
      original &&
      split.startMonth ===
        month(original.startDate, source.seededAt.slice(0, 7))
        ? original.startDate
        : `${split.startMonth}-01`,
  };
}

/** Creates the server document without dropping excluded jobs, outside funding, or category history. */
export function toServerProjection(plan: ProjectionPlan): Projection {
  if (!plan.serverProjection) {
    throw new Error('This plan has no server snapshot.');
  }
  const source = plan.serverProjection;
  let nextProjectId =
    Math.max(0, ...plan.funding.map((fund) => fund.serverProject?.id ?? 0)) + 1;
  let nextJobId =
    Math.max(0, ...plan.staff.map((person) => person.serverJob?.id ?? 0)) + 1;
  const projectIds = new Map(
    plan.funding.map((fund) => [
      fund.id,
      fund.serverProject?.id || nextProjectId++,
    ])
  );
  const jobIds = new Map(
    plan.staff.map((person) => [person.id, person.serverJob?.id || nextJobId++])
  );
  const projects = plan.funding.map((fund) => {
    const original = fund.serverProject;
    const project = structuredClone(
      original ?? newProject(projectIds.get(fund.id)!, fund)
    );
    project.id = projectIds.get(fund.id)!;
    project.projectName = fund.name;
    project.startDate =
      original &&
      fund.startDate ===
        (original.startDate ?? `${source.seededAt.slice(0, 7)}-01`)
        ? original.startDate
        : fund.startDate;
    project.endDate =
      original &&
      fund.endDate === (original.endDate ?? lastDay(endMonth(source)))
        ? original.endDate
        : fund.endDate;
    const difference = fund.startingBalance - balance(project);
    if (Math.abs(difference) > 0.000_001) {
      const adjustment = project.budgets.find(
        (item) => item.expenditureCategory === ADJUSTMENT && !item.isSeeded
      );
      if (adjustment) {
        adjustment.budget += difference;
      } else {
        project.budgets.push({
          budget: difference,
          committed: 0,
          expenditureCategory: ADJUSTMENT,
          isSeeded: false,
          spentToDate: 0,
        });
      }
    }
    project.expenses = plan.expenses
      .filter((expense) => expense.fundingId === fund.id)
      .map((expense) => saveExpense(expense, source));
    return project;
  });
  const jobs = plan.staff.map((person) => {
    const job = structuredClone(
      person.serverJob ?? newJob(jobIds.get(person.id)!)
    );
    job.id = jobIds.get(person.id)!;
    job.name = person.name;
    job.monthlySalary = person.salaryMissing
      ? null
      : job.monthlySalary !== null &&
          person.annualSalary === job.monthlySalary * 12
        ? job.monthlySalary
        : person.annualSalary / 12;
    if (person.fringeRate !== (job.cbrRate ?? 0) * 100) {
      job.cbrRate = person.fringeRate / 100;
    }
    job.fundingEntries = person.splits.map((split) =>
      saveEntry(split, job.fte, projectIds, source)
    );
    return job;
  });
  return {
    ...source,
    historyMonths: plan.historyMonths ?? source.historyMonths,
    jobs,
    name: plan.name,
    projects,
    settings: {
      excludedJobIds: plan.staff
        .filter((person) => !person.included)
        .map((person) => jobIds.get(person.id)!),
      months: plan.months,
      note: plan.note,
      selectedProjectIds: plan.selectedFunding.flatMap((id) =>
        projectIds.has(id) ? [projectIds.get(id)!] : []
      ),
      startMonth: plan.startMonth,
    },
  };
}

/** Window changes replace only generated expenses; manual expenses remain intact. */
export function withHistoryMonths(
  plan: ProjectionPlan,
  historyMonths: number
): ProjectionPlan {
  if (!plan.serverProjection || historyMonths === plan.historyMonths) {
    return { ...plan, historyMonths };
  }
  return {
    ...plan,
    expenses: [
      ...plan.expenses.filter(
        (expense) => expense.serverExpense?.kind !== 'Projected'
      ),
      ...plan.funding.flatMap(
        (fund) =>
          fund.serverProject?.runRates
            .filter(
              (rate) =>
                rate.historyMonths === historyMonths && rate.monthlyAmount !== 0
            )
            .map((rate, i) =>
              displayExpense(
                {
                  amount: rate.monthlyAmount,
                  description: null,
                  endMonth: null,
                  expenditureCategory: rate.expenditureCategory,
                  kind: 'Projected',
                  startMonth: null,
                },
                fund.id,
                `rate-${historyMonths}-${i}`,
                plan.serverProjection!.seededAt.slice(0, 7)
              )
            ) ?? []
      ),
    ],
    historyMonths,
  };
}

export function computeServerGuidedPlan(plan: ProjectionPlan) {
  const document = toServerProjection(plan);
  const months = Array.from({ length: plan.months }, (_, i) =>
    indexToMonth(monthToIndex(plan.startMonth) + i)
  );
  const selectedIds = new Set(document.settings?.selectedProjectIds ?? []);
  const excludedJobs = new Set(document.settings?.excludedJobIds ?? []);
  const selected = {
    ...document,
    jobs: document.jobs.filter((job) => !excludedJobs.has(job.id)),
    projects: document.projects.filter((project) =>
      selectedIds.has(project.id)
    ),
  };
  const options = { endMonth: months.at(-1)! };
  const computed = computePiProjection(selected, options);
  const sources = plan.funding.filter((fund) =>
    plan.selectedFunding.includes(fund.id)
  );
  const people = plan.staff.filter((person) => person.included);
  const visibleMonths = new Set(months);
  const feesByMonth = new Map<string, number>();
  const costsByJob = new Map<string, number>();
  for (const cost of computed.jobCosts) {
    if (!visibleMonths.has(cost.month)) {
      continue;
    }
    const jobKey = `${cost.projectId}:${cost.jobId}`;
    costsByJob.set(jobKey, (costsByJob.get(jobKey) ?? 0) + cost.amount);
    if (cost.expenditureCategory === FEE_REMISSION_CATEGORY) {
      const monthKey = `${cost.projectId}:${cost.month}`;
      feesByMonth.set(monthKey, (feesByMonth.get(monthKey) ?? 0) + cost.amount);
    }
  }
  const rowsByProject = new Map<number, typeof computed.rows>();
  for (const row of computed.rows) {
    const projectRows = rowsByProject.get(row.projectId) ?? [];
    projectRows.push(row);
    rowsByProject.set(row.projectId, projectRows);
  }
  const funds = sources.map((fund, index) => {
    const project = selected.projects[index];
    const rows = rowsByProject.get(project.id) ?? [];
    const byMonth = new Map<string, typeof rows>();
    for (const row of rows) {
      const items = byMonth.get(row.month) ?? [];
      items.push(row);
      byMonth.set(row.month, items);
    }
    const preceding = [...byMonth.keys()]
      .filter((m) => m < plan.startMonth)
      .sort()
      .at(-1);
    let carried = preceding
      ? byMonth.get(preceding)!.reduce((total, row) => total + row.remaining, 0)
      : fund.startingBalance;
    const chart = months.map((m) => {
      const items = byMonth.get(m) ?? [];
      const amount = (category: string) =>
        items
          .filter((r) => r.expenditureCategory === category)
          .reduce((sum, r) => sum + r.actualAmount + r.projectedAmount, 0);
      const salary = amount(SALARY_CATEGORY);
      const fringe = amount(FRINGE_CATEGORY);
      const fees = feesByMonth.get(`${project.id}:${m}`) ?? 0;
      const personnel = salary + fringe + fees;
      const other =
        items.reduce(
          (sum, row) => sum + row.actualAmount + row.projectedAmount,
          0
        ) - personnel;
      const remaining = items.length
        ? items.reduce((sum, row) => sum + row.remaining, 0)
        : carried;
      carried = remaining;
      return {
        balance: remaining,
        fees,
        fringe,
        indirect: 0,
        month: m,
        opening: remaining + personnel + other,
        other,
        personnel,
        salary,
      };
    });
    const sum = (key: 'salary' | 'fringe' | 'fees' | 'personnel' | 'other') =>
      chart.reduce((total, row) => total + row[key], 0);
    const ending = chart.at(-1)?.balance ?? fund.startingBalance;
    const opening = chart[0]?.opening ?? fund.startingBalance;
    return {
      ...fund,
      chart,
      ending,
      fees: sum('fees'),
      firstDeficit: chart.find((row) => row.balance < 0)?.month,
      fringe: sum('fringe'),
      indirect: 0,
      name: project.taskNumber
        ? `${fund.name} · Task ${project.taskNumber}`
        : fund.name,
      other: sum('other'),
      personnel: sum('personnel'),
      salary: sum('salary'),
      serverProject: project,
      spending: opening - ending,
      staff: people.flatMap((person) => {
        const job = document.jobs[plan.staff.indexOf(person)];
        const cost = costsByJob.get(`${project.id}:${job.id}`) ?? 0;
        return cost === 0
          ? []
          : [
              {
                cost,
                id: person.id,
                name: person.name,
                splits: person.splits.filter(
                  (split) =>
                    split.fundingId === fund.id &&
                    split.percent > 0 &&
                    months.some(
                      (m) => m >= split.startMonth && m <= split.endMonth
                    )
                ),
              },
            ];
      }),
      startingBalance: opening,
    };
  });
  const chart = months.map((m, i) => ({
    balance: funds.reduce((total, fund) => total + fund.chart[i].balance, 0),
    month: m,
    other: funds.reduce((total, fund) => total + fund.chart[i].other, 0),
    personnel: funds.reduce(
      (total, fund) => total + fund.chart[i].personnel,
      0
    ),
  }));
  return {
    chart,
    ending: funds.reduce((total, fund) => total + fund.ending, 0),
    firstDeficit: chart.find((point) => point.balance < 0)?.month,
    funds,
    other: funds.reduce((total, fund) => total + fund.other, 0),
    personnel: funds.reduce((total, fund) => total + fund.personnel, 0),
    starting: funds.reduce((total, fund) => total + fund.startingBalance, 0),
  };
}
