import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.ts';

export interface AccrualRecord {
  ACCR_LIMIT: number;
  ACCRUAL: number;
  ADJUSTED: number;
  APR_MAX_IND: string;
  BUSINESS_EMAIL: string;
  CURR_BAL: number;
  DEPTID: string;
  EMPL_CLASS: string;
  EMPL_CLASS_DESCR: string;
  EMPLID: string;
  JOB_TITLE: string;
  JOBCODE: string;
  PREFERRED_NAME: string;
  PREV_BAL: number;
  TAKEN: number;
}

export const accrualsQueryOptions = () => ({
  queryFn: async (): Promise<AccrualRecord[]> => {
    return await fetchJson<AccrualRecord[]>('/api/accrual');
  },
  queryKey: ['accruals', 'all'] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useAccrualsQuery = () => {
  return useQuery(accrualsQueryOptions());
};
