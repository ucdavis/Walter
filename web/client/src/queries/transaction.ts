import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface Transaction {
  account: string;
  account_description: string;
  activity: string;
  actual_amount: number;
  commitment_amount: number;
  department: string;
  entity: string;
  fund: string;
  journal_acct_date: string;
  obligation_amount: number;
  period_name: string;
  program: string;
  project: string;
  purpose: string;
}

export const transactionsForProjectQueryOptions = (projectCodes: string[]) => ({
  queryFn: async (): Promise<Transaction[]> => {
    const params = new URLSearchParams();
    params.set('projectCodes', projectCodes.join(','));
    return await fetchJson<Transaction[]>(
      `/api/project/transactions?${params.toString()}`
    );
  },
  queryKey: ['transactions', 'projects', projectCodes] as const,
  staleTime: 60 * 60 * 1000, // 1 hour
});

export const useTransactionsForProjectQuery = (projectCodes: string[]) => {
  return useQuery(transactionsForProjectQueryOptions(projectCodes));
};
