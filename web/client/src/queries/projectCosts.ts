import { fetchJson } from '@/lib/api.ts';

/** One PPM expenditure item; coded fields are 'CODE - Name'. */
export interface ProjectCostRecord {
  accountingDate: string;
  /** 'Mon-YY', e.g. 'Sep-26'. */
  accountingPeriod: string;
  adjustingItem: string | null;
  awardEndDate: string | null;
  awardName: string | null;
  /** Null for internal (non-sponsored) projects, as are the other award fields. */
  awardNumber: string | null;
  awardStartDate: string | null;
  awardStatus: string | null;
  awardType: string | null;
  billable: string;
  burdenedCost: number;
  comment: string | null;
  document: string;
  documentEntry: string;
  expenditureBatch: string;
  expenditureBusinessUnit: string;
  expenditureCategory: string;
  expenditureItemDate: string;
  expenditureOrg: string;
  expenditureType: string;
  invoicedStatus: string;
  projectBusinessUnit: string;
  projectEndDate: string | null;
  projectName: string;
  projectNumber: string;
  projectOwningOrg: string;
  projectStartDate: string;
  projectStatus: string;
  projectType: string;
  rawCost: number;
  revenueStatus: string;
  sourceTransactionNumber: number | null;
  /** Null on sponsored rows, as are the other task chart fields. */
  taskActivity: string | null;
  taskFund: string | null;
  taskName: string;
  taskNumber: string;
  taskProgram: string | null;
  taskPurpose: string | null;
  taskStatus: string;
  transactionNumber: number;
  transferredFromTransactionNumber: number | null;
}

export const projectCostsQueryOptions = (projectNumber: string) => ({
  queryFn: async (): Promise<ProjectCostRecord[]> => {
    return await fetchJson<ProjectCostRecord[]>(
      `/api/project/costs/${encodeURIComponent(projectNumber)}`
    );
  },
  queryKey: ['project-costs', projectNumber] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});
