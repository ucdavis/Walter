import type {
  Projection,
  ProjectionJob,
  ProjectionProject,
} from '@/queries/projections.ts';

export interface PiProjectionRow {
  actualAmount: number;
  expenditureCategory: string;
  kind: 'actual' | 'blended' | 'projected';
  month: string; // 'YYYY-MM'
  projectedAmount: number;
  projectId: number;
  remaining: number;
}

export interface JobFundingMonth {
  fundedPercent: number;
  jobId: number;
  month: string;
}

export const SALARY_CATEGORY = '01 - Salaries and Wages';
export const FRINGE_CATEGORY = '02 - Fringe Benefits';
export const FEE_REMISSION_CATEGORY = '08 - Fellowship & Scholarships';
/** Placeholder monthly GSR fee remission the job modal pre-fills; confirm before relying on it. */
export const GSR_FEE_REMISSION_DEFAULT = 1500;

const PERSONNEL = new Set([SALARY_CATEGORY, FRINGE_CATEGORY]);

/** Months since year 0, so month arithmetic is integer math. Accepts 'YYYY-MM' or longer ISO strings. */
const toIndex = (value: string) =>
  Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;

const toMonth = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

const within = (m: number, start: string | null, end: string | null) =>
  (start === null || toIndex(start) <= m) &&
  (end === null || toIndex(end) >= m);

/**
 * Projects a PI's portfolio month by month. "Now" is always the projection's seededAt,
 * because budgets and actuals are a snapshot from that moment.
 */
export function computePiProjection(projection: Projection): {
  jobFunding: JobFundingMonth[];
  rows: PiProjectionRow[];
} {
  const seed = new Date(projection.seededAt);
  const seedIndex = seed.getUTCFullYear() * 12 + seed.getUTCMonth();
  const daysInMonth = new Date(
    Date.UTC(seed.getUTCFullYear(), seed.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const proration = (daysInMonth - seed.getUTCDate()) / daysInMonth;

  const projectEnd = (p: ProjectionProject) =>
    p.endDate ? toIndex(p.endDate) : seedIndex + 12;
  const horizonEnd = Math.max(
    seedIndex,
    ...projection.projects.map(projectEnd)
  );
  const firstIndex = Math.min(
    seedIndex,
    ...projection.projects.flatMap((p) =>
      p.actuals.map((a) => toIndex(a.month))
    )
  );

  // projectId -> category -> month index -> amount
  const charges = new Map<number, Map<string, Map<number, number>>>();
  const charge = (
    project: ProjectionProject,
    category: string,
    m: number,
    amount: number
  ) => {
    if (m < seedIndex || m > projectEnd(project)) {
      return;
    }
    const byCategory =
      charges.get(project.id) ?? new Map<string, Map<number, number>>();
    const byMonth = byCategory.get(category) ?? new Map<number, number>();
    byMonth.set(m, (byMonth.get(m) ?? 0) + amount);
    byCategory.set(category, byMonth);
    charges.set(project.id, byCategory);
  };

  for (const project of projection.projects) {
    for (const e of project.expenses) {
      if (e.kind === 'OneTime') {
        if (e.startMonth) {
          charge(
            project,
            e.expenditureCategory,
            toIndex(e.startMonth),
            e.amount
          );
        }
        continue;
      }
      const start =
        e.kind === 'Monthly' && e.startMonth
          ? toIndex(e.startMonth)
          : seedIndex;
      const end =
        e.kind === 'Monthly' && e.endMonth
          ? toIndex(e.endMonth)
          : projectEnd(project);
      for (let m = Math.max(start, seedIndex); m <= end; m++) {
        charge(
          project,
          e.expenditureCategory,
          m,
          m === seedIndex ? e.amount * proration : e.amount
        );
      }
    }
  }

  const projectsById = new Map(projection.projects.map((p) => [p.id, p]));
  const jobFunding: JobFundingMonth[] = [];
  for (const job of projection.jobs) {
    for (let m = seedIndex; m <= horizonEnd; m++) {
      if (!within(m, job.startDate, job.endDate)) {
        continue;
      }
      const salary =
        (job.monthlySalary ?? 0) * job.fte * colaFactor(job, seedIndex, m);
      const costs: [string, number][] = [
        [SALARY_CATEGORY, salary],
        [
          FRINGE_CATEGORY,
          salary * ((job.cbrRate ?? 0) + job.vacationAccrualRate),
        ],
        [FEE_REMISSION_CATEGORY, job.feeRemissionMonthly ?? 0],
      ];
      let fundedPercent = 0;
      for (const f of job.fundingEntries) {
        if (!within(m, f.startDate, f.endDate)) {
          continue;
        }
        fundedPercent += f.percent;
        const project =
          f.projectionProjectId === null
            ? undefined
            : projectsById.get(f.projectionProjectId);
        if (!project) {
          continue;
        }
        for (const [category, cost] of costs) {
          if (cost) {
            charge(project, category, m, cost * f.percent);
          }
        }
      }
      jobFunding.push({ fundedPercent, jobId: job.id, month: toMonth(m) });
    }
  }

  const rows: PiProjectionRow[] = [];
  for (const project of projection.projects) {
    const projectCharges =
      charges.get(project.id) ?? new Map<string, Map<number, number>>();
    const actuals = new Map<string, Map<number, number>>();
    for (const a of project.actuals) {
      const m = toIndex(a.month);
      // Mid-month personnel actuals are replaced by a whole projected month.
      if (m === seedIndex && PERSONNEL.has(a.expenditureCategory)) {
        continue;
      }
      const byMonth =
        actuals.get(a.expenditureCategory) ?? new Map<number, number>();
      byMonth.set(m, (byMonth.get(m) ?? 0) + a.amount);
      actuals.set(a.expenditureCategory, byMonth);
    }
    const categories = new Set([
      ...project.budgets.map((b) => b.expenditureCategory),
      ...actuals.keys(),
      ...projectCharges.keys(),
    ]);
    const last = Math.max(projectEnd(project), seedIndex);

    for (const category of [...categories].sort()) {
      const budget = project.budgets.find(
        (b) => b.expenditureCategory === category
      );
      const startRemaining = budget
        ? budget.budget - budget.spentToDate - budget.committed
        : 0;
      const actual = (m: number) => actuals.get(category)?.get(m) ?? 0;
      const planned = (m: number) => projectCharges.get(category)?.get(m) ?? 0;

      // Remaining at the end of each month: history integrates backward from the seed boundary.
      const remaining = new Map<number, number>([
        [seedIndex - 1, startRemaining],
      ]);
      for (let m = seedIndex - 1; m > firstIndex; m--) {
        remaining.set(m - 1, remaining.get(m)! + actual(m));
      }
      for (let m = seedIndex; m <= last; m++) {
        remaining.set(m, remaining.get(m - 1)! - actual(m) - planned(m));
      }

      for (let m = firstIndex; m <= last; m++) {
        rows.push({
          actualAmount: actual(m),
          expenditureCategory: category,
          kind:
            m < seedIndex
              ? 'actual'
              : m === seedIndex
                ? 'blended'
                : 'projected',
          month: toMonth(m),
          projectedAmount: planned(m),
          projectId: project.id,
          remaining: remaining.get(m)!,
        });
      }
    }
  }

  return { jobFunding, rows };
}

/** Compounds the COLA once for each COLA month after the seed month, through month m. */
function colaFactor(job: ProjectionJob, seedIndex: number, m: number) {
  let n = 0;
  for (let k = seedIndex + 1; k <= m; k++) {
    if ((k % 12) + 1 === job.colaMonth) {
      n++;
    }
  }
  return (1 + job.colaRate) ** n;
}
