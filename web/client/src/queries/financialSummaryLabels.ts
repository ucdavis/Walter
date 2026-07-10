import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

/** One shared label: an explanation of a chart-string segment combination.
 * Empty string in a segment field means it is not part of the label's key. */
export interface FinancialSummaryLabelDto {
  account: string;
  activity: string;
  dept: string;
  fund: string;
  project: string;
  purpose: string;
  text: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface LabelSegments {
  account: string;
  activity: string;
  dept: string;
  fund: string;
  project: string;
  purpose: string;
}

export const financialSummaryLabelsQueryKey = ['financial-summary-labels'] as const;

export const useFinancialSummaryLabels = () =>
  useQuery({
    queryFn: () =>
      fetchJson<FinancialSummaryLabelDto[]>('/api/financialsummary/labels'),
    queryKey: financialSummaryLabelsQueryKey,
    staleTime: 60_000,
  });

/** Non-empty text creates/updates the label for the exact combination; empty text deletes it. */
export const upsertFinancialSummaryLabel = (input: LabelSegments & { text: string }) =>
  fetchJson<FinancialSummaryLabelDto | undefined>('/api/financialsummary/labels', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
