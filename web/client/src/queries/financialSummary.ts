import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface FinancialSummaryRow {
  activity?: string | null;
  activityName?: string | null;
  activityParentLevel0Code?: string | null;
  activityParentLevel0Name?: string | null;
  activityParentLevel1Code?: string | null;
  activityParentLevel1Name?: string | null;
  activityParentLevel2Code?: string | null;
  activityParentLevel2Name?: string | null;
  activityParentLevel3Code?: string | null;
  activityParentLevel3Name?: string | null;
  activityParentLevel4Code?: string | null;
  activityParentLevel4Name?: string | null;
  activityParentLevel5Code?: string | null;
  activityParentLevel5Name?: string | null;
  expense: number;
  financialDeptDCode?: string | null;
  financialDeptDName?: string | null;
  financialDeptECode?: string | null;
  financialDeptEName?: string | null; financialDeptFCode?: string | null;
  financialDeptFName?: string | null; financialDeptGCode?: string | null;
  financialDeptGName?: string | null; fund?: string | null;
  fundName?: string | null; // Hierarchy ancestor levels (0 = top rollup .. 5 = nearest parent) for Fund/Activity/NaturalAccount.
  fundParentLevel0Code?: string | null;
  fundParentLevel0Name?: string | null; fundParentLevel1Code?: string | null;
  fundParentLevel1Name?: string | null; fundParentLevel2Code?: string | null;
  fundParentLevel2Name?: string | null; fundParentLevel3Code?: string | null;
  fundParentLevel3Name?: string | null; fundParentLevel4Code?: string | null;
  fundParentLevel4Name?: string | null; fundParentLevel5Code?: string | null;
  fundParentLevel5Name?: string | null; income: number;
  naturalAccount?: string | null; naturalAccountName?: string | null;
  naturalAccountParentLevel0Code?: string | null; naturalAccountParentLevel0Name?: string | null;
  naturalAccountParentLevel1Code?: string | null; naturalAccountParentLevel1Name?: string | null;
  naturalAccountParentLevel2Code?: string | null; naturalAccountParentLevel2Name?: string | null;
  naturalAccountParentLevel3Code?: string | null; naturalAccountParentLevel3Name?: string | null;
  naturalAccountParentLevel4Code?: string | null; naturalAccountParentLevel4Name?: string | null;
  naturalAccountParentLevel5Code?: string | null; naturalAccountParentLevel5Name?: string | null;
  net: number; program?: string | null;
  programName?: string | null;
  project?: string | null;
  projectName?: string | null;
}

export interface FinancialSummaryOption {
  code: string;
  level?: string | null;
  name: string;
  sortKey?: string | null;
}

export interface FinancialSummaryFilters {
  activities?: string[];
  financialDepartments?: string[];
  fiscalYears?: string[];
  funds?: string[];
  naturalAccounts?: string[];
  periods?: string[];
  programs?: string[];
  projects?: string[];
}

export interface FinancialSummaryQuery extends FinancialSummaryFilters {
  dimensions: string[];
}

export type OptionsSegment =
  | 'FinancialDept' | 'Fund' | 'Program' | 'Activity'
  | 'Project' | 'NaturalAccount' | 'FiscalYear' | 'Period';

const postJson = <T,>(url: string, body: unknown) =>
  fetchJson<T>(url, { body: JSON.stringify(body), method: 'POST' });

export const useFinancialSummaryQuery = (query: FinancialSummaryQuery) =>
  useQuery({
    enabled: query.dimensions.length > 0,
    queryFn: () => postJson<FinancialSummaryRow[]>('/api/financialsummary/query', query),
    queryKey: ['financial-summary', query] as const,
    staleTime: 60 * 60 * 1000,
  });

export const useFinancialSummaryOptions = (
  segment: OptionsSegment,
  context: FinancialSummaryFilters,
  enabled = true
) =>
  useQuery({
    enabled,
    queryFn: () =>
      postJson<FinancialSummaryOption[]>('/api/financialsummary/options', { segment, ...context }),
    queryKey: ['financial-summary-options', segment, context] as const,
    staleTime: 60 * 60 * 1000,
  });
