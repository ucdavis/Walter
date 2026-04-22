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
  departmentCode: string;
  headcount: number;
  lostCostMonth: number;
  lostCostYtd: number;
}

export interface AccrualDepartmentOption {
  code: string;
  name: string;
}

export interface AccrualBenefitsRateRow {
  label: string;
  rate: number;
}

export interface AccrualFallbackAccrualTierRow {
  label: string;
  monthlyAccrualHours: number;
}

export interface AccrualHourlyRateRow {
  hourlyRate: number;
  label: string;
}

export interface AccrualDepartmentEmployeeRow {
  accrualHoursPerMonth: number;
  balanceHours: number;
  capHours: number;
  classification: string;
  employeeId: string;
  employeeName: string;
  lastVacationDate: string | null;
  lostCostMonth: number;
  monthsToCap: number | null;
  pctOfCap: number;
}

export interface AccrualDepartmentDetailResponse {
  asOfDate: string;
  avgBalanceHours: number;
  approachingCapCount: number;
  atCapCount: number;
  departmentCode: string;
  departmentName: string;
  departments: AccrualDepartmentOption[];
  employees: AccrualDepartmentEmployeeRow[];
  headcount: number;
  lostCostMonth: number;
  lostCostYtd: number;
  ytdMonthCount: number;
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

export interface AccrualAssumptionsResponse {
  approachingThresholdPct: number;
  atCapThresholdPct: number;
  benefitsRates: AccrualBenefitsRateRow[];
  fallbackAccrualTiers: AccrualFallbackAccrualTierRow[];
  hourlyRates: AccrualHourlyRateRow[];
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

export const accrualAssumptionsQueryOptions = () => ({
  queryFn: async (): Promise<AccrualAssumptionsResponse> => {
    return await fetchJson<AccrualAssumptionsResponse>('/api/accrual/assumptions');
  },
  queryKey: ['accruals', 'assumptions'] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useAccrualAssumptionsQuery = () => {
  return useQuery(accrualAssumptionsQueryOptions());
};

export const accrualDepartmentDetailQueryOptions = (departmentCode: string) => ({
  queryFn: async (): Promise<AccrualDepartmentDetailResponse> => {
    return await fetchJson<AccrualDepartmentDetailResponse>(
      `/api/accrual/department/${encodeURIComponent(departmentCode)}`
    );
  },
  queryKey: ['accruals', 'department', departmentCode] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useAccrualDepartmentDetailQuery = (departmentCode: string) => {
  return useQuery(accrualDepartmentDetailQueryOptions(departmentCode));
};
