import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

export interface Transaction {
  accountingPeriod: string;
  burdenedCostInReceiverLedgerCurrency: number;
  contractNumber: string;
  creationDate: string;
  expenditureCategory: string;
  expenditureItemDate: string;
  expenditureType: string;
  fundingSources: string;
  projectNumber: string;
  rawCostInReceiverLedgerCurrency: number;
  taskNumber: string;
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
