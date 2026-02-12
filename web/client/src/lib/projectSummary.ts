import type { ProjectRecord } from '@/queries/project.ts';

export interface ProjectCategorySummary {
  balance: number;
  budget: number;
  encumbrance: number;
  expense: number;
  name: string;
}

export interface ProjectTotals {
  balance: number;
  budget: number;
  encumbrance: number;
  expense: number;
}

export interface ProjectSummary {
  awardEndDate: string | null;
  awardStartDate: string | null;
  categories: ProjectCategorySummary[];
  copi: string | null;
  displayName: string;
  pa: string | null;
  pi: string | null;
  pm: string | null;
  projectNumber: string;
  projectStatusCode: string | null;
  totals: ProjectTotals;
}

type DateKey = 'awardStartDate' | 'awardEndDate';

const DEFAULT_SUMMARY_NAME = 'All Projects Dashboard';
const DEFAULT_SUMMARY_NUMBER = 'MULTIPLE';

const buildEmptyTotals = (): ProjectTotals => ({
  balance: 0,
  budget: 0,
  encumbrance: 0,
  expense: 0,
});

const aggregateCategories = (records: ProjectRecord[]) => {
  const categories = new Map<string, ProjectCategorySummary>();
  const totals = buildEmptyTotals();

  for (const record of records) {
    totals.budget += record.catBudget;
    totals.expense += record.catItdExp;
    totals.encumbrance += record.catCommitments;
    totals.balance += record.catBudBal;

    const existing = categories.get(record.expenditureCategoryName);
    if (existing) {
      existing.budget += record.catBudget;
      existing.expense += record.catItdExp;
      existing.encumbrance += record.catCommitments;
      existing.balance += record.catBudBal;
    } else {
      categories.set(record.expenditureCategoryName, {
        balance: record.catBudBal,
        budget: record.catBudget,
        encumbrance: record.catCommitments,
        expense: record.catItdExp,
        name: record.expenditureCategoryName,
      });
    }
  }

  const sortedCategories = Array.from(categories.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return { categories: sortedCategories, totals };
};

const pickDate = (
  records: ProjectRecord[],
  key: DateKey,
  sortFn: (current: string, candidate: string) => string
) => {
  let resolved: string | null = null;

  for (const record of records) {
    const value = record[key];
    if (!value) {
      continue;
    }

    resolved = !resolved ? value : sortFn(resolved, value);
  }

  return resolved;
};

const findEarliestDate = (records: ProjectRecord[], key: DateKey) =>
  pickDate(records, key, (current, candidate) =>
    candidate < current ? candidate : current
  );

const findLatestDate = (records: ProjectRecord[], key: DateKey) =>
  pickDate(records, key, (current, candidate) =>
    candidate > current ? candidate : current
  );

export const summarizeAllProjects = (
  records: ProjectRecord[]
): ProjectSummary => {
  const { categories, totals } = aggregateCategories(records);
  return {
    awardEndDate: findLatestDate(records, 'awardEndDate'),
    awardStartDate: findEarliestDate(records, 'awardStartDate'),
    categories,
    copi: null,
    displayName: DEFAULT_SUMMARY_NAME,
    pa: null,
    pi: 'Multiple',
    pm: 'Multiple',
    projectNumber: DEFAULT_SUMMARY_NUMBER,
    projectStatusCode: 'ACTIVE',
    totals,
  };
};

export const summarizeProjectByNumber = (
  records: ProjectRecord[],
  projectNumber: string
): ProjectSummary | null => {
  const filtered = records.filter(
    (record) => record.projectNumber === projectNumber
  );

  if (!filtered.length) {
    return null;
  }

  const { categories, totals } = aggregateCategories(filtered);
  const first = filtered[0];

  return {
    awardEndDate: findLatestDate(filtered, 'awardEndDate'),
    awardStartDate: findEarliestDate(filtered, 'awardStartDate'),
    categories,
    copi: first.copi,
    displayName: first.displayName,
    pa: first.pa,
    pi: first.pi,
    pm: first.pm,
    projectNumber: first.projectNumber,
    projectStatusCode: first.projectStatusCode,
    totals,
  };
};
