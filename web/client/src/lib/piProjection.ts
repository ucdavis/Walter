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
  /** Average funding share over active job days; gaps and overlaps can offset. */
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

/** Imported pay is snapshot-dated; a planned future hire's input is its starting rate. */
export function getJobSalaryBaseMonth(
  job: ProjectionJob,
  snapshotMonth: string
) {
  const startMonth = job.startDate?.slice(0, 7);
  return !job.isSeeded && startMonth && startMonth > snapshotMonth
    ? startMonth
    : snapshotMonth;
}

const within = (m: number, start: string | null, end: string | null) =>
  (start === null || toIndex(start) <= m) &&
  (end === null || toIndex(end) >= m);

const DAY_MS = 86_400_000;
type DayRange = { end: number; start: number };
type DateBounds = { endDate: string | null; startDate: string | null };

// Date-only planning windows use UTC days so daylight saving cannot change their length.
const toDay = (value: string) =>
  Date.parse(`${value.slice(0, 10)}T00:00:00Z`) / DAY_MS;

const monthDays = (m: number): DayRange => ({
  end: Date.UTC(Math.floor(m / 12), (m % 12) + 1, 0) / DAY_MS,
  start: Date.UTC(Math.floor(m / 12), m % 12, 1) / DAY_MS,
});

/** Counts the inclusive intersection; a missing endpoint imposes no bound. */
function overlapDays(range: DayRange, ...bounds: DateBounds[]) {
  let { end, start } = range;
  for (const bound of bounds) {
    if (bound.startDate !== null) {
      start = Math.max(start, toDay(bound.startDate));
    }
    if (bound.endDate !== null) {
      end = Math.min(end, toDay(bound.endDate));
    }
  }
  return Math.max(0, end - start + 1);
}

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
  const seedDay = toDay(seed.toISOString());

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

  const projectsById = new Map(projection.projects.map((p) => [p.id, p]));
  const jobFunding: JobFundingMonth[] = [];
  for (const job of projection.jobs) {
    for (let m = seedIndex; m <= horizonEnd; m++) {
      if (!within(m, job.startDate, job.endDate)) {
        continue;
      }
      const days = monthDays(m);
      const activeJobDays = overlapDays(days, job);
      const salary =
        (job.monthlySalary ?? 0) * job.fte * colaFactor(job, seedIndex, m);
      const costs: [string, number][] = [
        [SALARY_CATEGORY, salary],
        [FRINGE_CATEGORY, salary * (job.cbrRate + job.vacationAccrualRate)],
      ];
      let fundedPercent = 0;
      for (const f of job.fundingEntries) {
        if (!within(m, f.startDate, f.endDate)) {
          continue;
        }
        const project =
          f.projectId === null ? undefined : projectsById.get(f.projectId);

        // Fee remission keeps its existing monthly eligibility and amount pending its own review.
        if (project && job.feeRemissionMonthly) {
          charge(
            project,
            FEE_REMISSION_CATEGORY,
            m,
            job.feeRemissionMonthly * f.percent
          );
        }

        if (
          activeJobDays === 0 ||
          (f.projectId !== null && !project) ||
          (project && m > projectEnd(project))
        ) {
          continue;
        }
        const eligibleDays = project
          ? overlapDays(days, job, f, project)
          : overlapDays(days, job, f);
        fundedPercent += f.percent * (eligibleDays / activeJobDays);
        if (!project || eligibleDays === 0) {
          continue;
        }

        // Use the whole month's eligible days here; booked snapshot costs are netted below.
        const fraction = eligibleDays / overlapDays(days);
        for (const [category, cost] of costs) {
          if (cost) {
            charge(project, category, m, cost * f.percent * fraction);
          }
        }
      }
      if (activeJobDays > 0) {
        jobFunding.push({ fundedPercent, jobId: job.id, month: toMonth(m) });
      }
    }
  }

  // Net the aggregated job targets once, before adding explicit expenses.
  // Booked salary and fringe stay fixed even when the new estimate is lower.
  for (const project of projection.projects) {
    for (const category of PERSONNEL) {
      const target =
        charges.get(project.id)?.get(category)?.get(seedIndex) ?? 0;
      const booked = project.actuals
        .filter(
          (actual) =>
            actual.expenditureCategory === category &&
            toIndex(actual.month) === seedIndex
        )
        .reduce((total, actual) => total + actual.amount, 0);
      const remaining = Math.max(target - booked, 0);
      if (remaining !== target) {
        // Net booked credits even after project end; charge's date guard only bounds forecasts.
        const byCategory =
          charges.get(project.id) ?? new Map<string, Map<number, number>>();
        const byMonth = byCategory.get(category) ?? new Map<number, number>();
        byMonth.set(seedIndex, remaining);
        byCategory.set(category, byMonth);
        charges.set(project.id, byCategory);
      }
    }
  }

  for (const project of projection.projects) {
    for (const e of project.expenses) {
      if (e.kind === 'OneTime') {
        if (e.startMonth) {
          const m = toIndex(e.startMonth);
          // A one-time expense specifies a month, so an eligible month keeps its full amount.
          if (overlapDays(monthDays(m), project) > 0) {
            charge(project, e.expenditureCategory, m, e.amount);
          }
        }
        continue;
      }
      const start = e.startMonth ? toIndex(e.startMonth) : seedIndex;
      const end = Math.min(
        e.endMonth ? toIndex(e.endMonth) : projectEnd(project),
        projectEnd(project)
      );
      for (let m = Math.max(start, seedIndex); m <= end; m++) {
        const days = monthDays(m);
        const eligibleDays = overlapDays(
          { ...days, start: m === seedIndex ? seedDay + 1 : days.start },
          project
        );
        if (eligibleDays === 0) {
          continue;
        }
        charge(
          project,
          e.expenditureCategory,
          m,
          e.amount * (eligibleDays / overlapDays(days))
        );
      }
    }
  }

  const rows: PiProjectionRow[] = [];
  for (const project of projection.projects) {
    const projectCharges =
      charges.get(project.id) ?? new Map<string, Map<number, number>>();
    const actuals = new Map<string, Map<number, number>>();
    for (const a of project.actuals) {
      const m = toIndex(a.month);
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
        // The snapshot balance already includes its booked actuals.
        const additionalActual = m === seedIndex ? 0 : actual(m);
        remaining.set(m, remaining.get(m - 1)! - additionalActual - planned(m));
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

/** Compounds COLA after the salary's base month, never within that month. */
function colaFactor(job: ProjectionJob, seedIndex: number, m: number) {
  const salaryMonth = toIndex(getJobSalaryBaseMonth(job, toMonth(seedIndex)));
  let n = 0;
  for (let k = salaryMonth + 1; k <= m; k++) {
    if ((k % 12) + 1 === job.colaMonth) {
      n++;
    }
  }
  return (1 + job.colaRate) ** n;
}
