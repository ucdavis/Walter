import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface FinancialSummaryRow {
  account?: string | null;
  accountDesc?: string | null;
  activity?: string | null;
  activityDesc?: string | null;
  assets: number;
  dept?: string | null;
  deptDesc?: string | null;
  endingBalance: number;
  expenses: number;
  fund?: string | null;
  fundDesc?: string | null;
  liabilities: number;
  netPosition: number;
  /** The snapshot's accounting period ("balances as of"); always populated. */
  periodName?: string | null;
  project?: string | null;
  projectDesc?: string | null;
  purpose?: string | null;
  purposeDesc?: string | null;
  revenue: number;
}

export interface FinancialSummaryOption {
  code: string;
  /** Hierarchy level for Dept/Fund/Account facets: 'Leaf' or '0'..'5' (0 = top rollup); null otherwise. */
  level?: string | null;
  name: string;
}

export interface FinancialSummaryFilters {
  accounts?: string[];
  activities?: string[];
  financialDepartments?: string[];
  funds?: string[];
  projects?: string[];
  purposes?: string[];
}

export interface FinancialSummaryQuery extends FinancialSummaryFilters {
  dimensions: string[];
}

export type OptionsSegment =
  | 'Dept' | 'Fund' | 'Account' | 'Purpose' | 'Project' | 'Activity' | 'Period';

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
