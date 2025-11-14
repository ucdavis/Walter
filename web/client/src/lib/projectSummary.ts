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
  pa: string | null;
  pi: string | null;
  pm: string | null;
  projectName: string;
  projectNumber: string;
  projectStatusCode: string | null;
  totals: ProjectTotals;
}

type DateKey = 'award_start_date' | 'award_end_date';

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
    totals.budget += record.cat_budget;
    totals.expense += record.cat_itd_exp;
    totals.encumbrance += record.cat_commitments;
    totals.balance += record.cat_bud_bal;

    const existing = categories.get(record.expenditure_category_name);
    if (existing) {
      existing.budget += record.cat_budget;
      existing.expense += record.cat_itd_exp;
      existing.encumbrance += record.cat_commitments;
      existing.balance += record.cat_bud_bal;
    } else {
      categories.set(record.expenditure_category_name, {
        balance: record.cat_bud_bal,
        budget: record.cat_budget,
        encumbrance: record.cat_commitments,
        expense: record.cat_itd_exp,
        name: record.expenditure_category_name,
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
    awardEndDate: findLatestDate(records, 'award_end_date'),
    awardStartDate: findEarliestDate(records, 'award_start_date'),
    categories,
    copi: null,
    pa: null,
    pi: 'Multiple',
    pm: 'Multiple',
    projectName: DEFAULT_SUMMARY_NAME,
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
    (record) => record.project_number === projectNumber
  );

  if (!filtered.length) {
    return null;
  }

  const { categories, totals } = aggregateCategories(filtered);
  const first = filtered[0];

  return {
    awardEndDate: findLatestDate(filtered, 'award_end_date'),
    awardStartDate: findEarliestDate(filtered, 'award_start_date'),
    categories,
    copi: first.copi,
    pa: first.pa,
    pi: first.pi,
    pm: first.pm,
    projectName: first.project_name,
    projectNumber: first.project_number,
    projectStatusCode: first.project_status_code,
    totals,
  };
};
