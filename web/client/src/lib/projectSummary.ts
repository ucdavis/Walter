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
  awardCloseDate: string | null;
  awardEndDate: string | null;
  awardNumber: string | null;
  awardPi: string | null;
  awardStartDate: string | null;
  awardStatus: string | null;
  awardType: string | null;
  billingCycle: string | null;
  categories: ProjectCategorySummary[];
  contractAdministrator: string | null;
  copi: string | null;
  costShareRequiredBySponsor: string | null;
  displayName: string;
  grantAdministrator: string | null;
  internalFundedProject: string | null;
  isInternal: boolean;
  pa: string | null;
  pi: string | null;
  pm: string | null;
  postReportingPeriod: string | null;
  primarySponsorName: string | null;
  projectBurdenCostRate: string | null;
  projectBurdenScheduleBase: string | null;
  projectFund: string | null;
  projectNumber: string;
  projectStatusCode: string | null;
  sponsorAwardNumber: string | null;
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
    awardCloseDate: null,
    awardEndDate: findLatestDate(records, 'awardEndDate'),
    awardNumber: null,
    awardPi: null,
    awardStartDate: findEarliestDate(records, 'awardStartDate'),
    awardStatus: null,
    awardType: null,
    billingCycle: null,
    categories,
    contractAdministrator: null,
    copi: null,
    costShareRequiredBySponsor: null,
    displayName: DEFAULT_SUMMARY_NAME,
    grantAdministrator: null,
    internalFundedProject: null,
    isInternal: false,
    pa: null,
    pi: 'Multiple',
    pm: 'Multiple',
    postReportingPeriod: null,
    primarySponsorName: null,
    projectBurdenCostRate: null,
    projectBurdenScheduleBase: null,
    projectFund: null,
    projectNumber: DEFAULT_SUMMARY_NUMBER,
    projectStatusCode: 'ACTIVE',
    sponsorAwardNumber: null,
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
    awardCloseDate: first.awardCloseDate,
    awardEndDate: findLatestDate(filtered, 'awardEndDate'),
    awardNumber: first.awardNumber,
    awardPi: first.awardPi,
    awardStartDate: findEarliestDate(filtered, 'awardStartDate'),
    awardStatus: first.awardStatus,
    awardType: first.awardType,
    billingCycle: first.billingCycle,
    categories,
    contractAdministrator: first.contractAdministrator,
    copi: first.copi,
    costShareRequiredBySponsor: first.costShareRequiredBySponsor,
    displayName: first.displayName,
    grantAdministrator: first.grantAdministrator,
    internalFundedProject: first.projectType === 'Internal' ? 'Yes' : 'No',
    isInternal: first.projectType === 'Internal',
    pa: first.pa,
    pi: first.pi,
    pm: first.pm,
    postReportingPeriod: first.postReportingPeriod,
    primarySponsorName: first.primarySponsorName,
    projectBurdenCostRate: first.projectBurdenCostRate,
    projectBurdenScheduleBase: first.projectBurdenScheduleBase,
    projectFund: first.projectFund,
    projectNumber: first.projectNumber,
    projectStatusCode: first.projectStatusCode,
    sponsorAwardNumber: first.sponsorAwardNumber,
    totals,
  };
};
