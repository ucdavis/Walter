import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.ts';

export interface AccrualLostCostTrendPoint {
  asOfDate: string;
  label: string;
  lostCost: number;
}

export interface AccrualStatusTrendPoint {
  active: number;
  approaching: number;
  asOfDate: string;
  atCap: number;
  label: string;
}

export interface AccrualDepartmentBreakdownRow {
  avgBalanceHours: number;
  approachingCapCount: number;
  atCapCount: number;
  department: string;
  headcount: number;
  lostCostMonth: number;
  lostCostYtd: number;
}

export interface AccrualOverviewResponse {
  approachingCapCount: number;
  asOfDate: string;
  atCapCount: number;
  departmentBreakdown: AccrualDepartmentBreakdownRow[];
  employeeStatusOverTime: AccrualStatusTrendPoint[];
  lostCostMonth: number;
  lostCostYtd: number;
  monthlyLostCost: AccrualLostCostTrendPoint[];
  totalDepartments: number;
  totalEmployees: number;
  wasteRate: number;
  ytdMonthCount: number;
}

export const accrualOverviewQueryOptions = () => ({
  queryFn: async (): Promise<AccrualOverviewResponse> => {
    return await fetchJson<AccrualOverviewResponse>('/api/accrual/overview');
  },
  queryKey: ['accruals', 'overview'] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useAccrualOverviewQuery = () => {
  return useQuery(accrualOverviewQueryOptions());
};
