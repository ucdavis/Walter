import { isAwardExpired } from '@/lib/date.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import type { Projection, ProjectionProject } from '@/queries/projections.ts';

type PortfolioTask = Pick<
  ProjectRecord,
  'awardEndDate' | 'projectNumber' | 'projectType' | 'taskNum' | 'taskStatus'
>;

function sumRows<T>(
  rows: T[],
  key: (row: T) => string,
  add: (total: T, row: T) => void
): T[] {
  const totals = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    const total = totals.get(id);
    if (total) {
      add(total, row);
    } else {
      totals.set(id, structuredClone(row));
    }
  }
  return [...totals.values()];
}

/** Matches the dashboard's default task visibility, including its latest award end date per project. */
function visibleTasks(portfolio: PortfolioTask[]) {
  const awardEnds = new Map<string, string | null>();
  for (const row of portfolio) {
    const end = awardEnds.get(row.projectNumber);
    if (!end || (row.awardEndDate && row.awardEndDate > end)) {
      awardEnds.set(row.projectNumber, row.awardEndDate);
    }
  }
  return new Set(
    portfolio
      .filter((row) =>
        row.projectType === 'Internal'
          ? row.taskStatus !== 'Inactive'
          : !isAwardExpired(awardEnds.get(row.projectNumber) ?? null)
      )
      .map((row) => JSON.stringify([row.projectNumber, row.taskNum]))
  );
}

/** Filters before aggregation so excluded task balances, costs, and funding never enter the plan. */
export function prepareDefaultProjection(
  seed: Projection,
  portfolio: PortfolioTask[]
): Projection {
  const eligible = visibleTasks(portfolio);
  const groups = new Map<string, ProjectionProject[]>();
  for (const project of seed.projects) {
    if (
      !eligible.has(JSON.stringify([project.projectNumber, project.taskNumber]))
    ) {
      continue;
    }
    const key = project.projectNumber!;
    const group = groups.get(key) ?? [];
    group.push(project);
    groups.set(key, group);
  }

  const projectIds = new Map<number, number>();
  const projects = [...groups.values()].map((tasks): ProjectionProject => {
    const project = structuredClone(tasks[0]);
    for (const task of tasks) {
      projectIds.set(task.id, project.id);
    }
    project.taskNumber = null;
    project.taskName = null;
    project.budgets = sumRows(
      tasks.flatMap((task) => task.budgets),
      (row) => row.expenditureCategory,
      (total, row) => {
        total.budget += row.budget;
        total.spentToDate += row.spentToDate;
        total.committed += row.committed;
      }
    );
    project.actuals = sumRows(
      tasks.flatMap((task) => task.actuals),
      (row) => JSON.stringify([row.expenditureCategory, row.month]),
      (total, row) => {
        total.amount += row.amount;
      }
    );
    project.runRates = sumRows(
      tasks.flatMap((task) => task.runRates),
      (row) => JSON.stringify([row.expenditureCategory, row.historyMonths]),
      (total, row) => {
        total.monthlyAmount += row.monthlyAmount;
      }
    );
    project.expenses = sumRows(
      tasks.flatMap((task) => task.expenses),
      (row) =>
        JSON.stringify([
          row.expenditureCategory,
          row.kind,
          row.startMonth,
          row.endMonth,
          row.description,
        ]),
      (total, row) => {
        total.amount += row.amount;
      }
    );
    return project;
  });

  const jobs = seed.jobs
    .filter(
      (job) =>
        job.fundingEntries.length === 0 ||
        job.fundingEntries.some(
          (entry) => entry.projectId !== null && projectIds.has(entry.projectId)
        )
    )
    .map((job) => ({
      ...structuredClone(job),
      // Excluded allocations become outside funding; never redistribute that pay to retained projects.
      fundingEntries: sumRows(
        job.fundingEntries.map((entry) => ({
          ...entry,
          projectId:
            entry.projectId === null
              ? null
              : (projectIds.get(entry.projectId) ?? null),
        })),
        (entry) =>
          JSON.stringify([
            entry.projectId,
            entry.startDate,
            entry.endDate,
            entry.isSeeded,
          ]),
        (total, entry) => {
          total.percent += entry.percent;
        }
      ),
    }));

  return {
    ...structuredClone(seed),
    jobs,
    projects,
  };
}
