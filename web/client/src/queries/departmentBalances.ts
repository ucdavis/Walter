import { useQuery } from '@tanstack/react-query';
import { postJson } from '@/lib/api.ts';

export interface DepartmentBalanceRow {
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

export interface DepartmentBalanceOption {
  code: string;
  /** Hierarchy level for Dept/Fund/Account facets: 'Leaf' or '0'..'5' (0 = top rollup); null otherwise. */
  level?: string | null;
  name: string;
}

export interface DepartmentBalancesFilters {
  accounts?: string[];
  activities?: string[];
  financialDepartments?: string[];
  funds?: string[];
  projects?: string[];
  purposes?: string[];
}

export interface DepartmentBalancesQuery extends DepartmentBalancesFilters {
  dimensions: string[];
}

export type OptionsSegment =
  | 'Dept' | 'Fund' | 'Account' | 'Purpose' | 'Project' | 'Activity' | 'Period';

export const useDepartmentBalancesQuery = (query: DepartmentBalancesQuery) =>
  useQuery({
    enabled: query.dimensions.length > 0,
    queryFn: () => postJson<DepartmentBalanceRow[]>('/api/departmentbalances/query', query),
    queryKey: ['department-balances', query] as const,
    staleTime: 60 * 60 * 1000,
  });

export const useDepartmentBalanceOptions = (
  segment: OptionsSegment,
  context: DepartmentBalancesFilters,
  enabled = true
) =>
  useQuery({
    enabled,
    queryFn: () =>
      postJson<DepartmentBalanceOption[]>('/api/departmentbalances/options', { segment, ...context }),
    queryKey: ['department-balances-options', segment, context] as const,
    staleTime: 60 * 60 * 1000,
  });
