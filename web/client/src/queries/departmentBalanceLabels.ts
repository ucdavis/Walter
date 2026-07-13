import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

/** One shared label: an explanation of a chart-string segment combination.
 * Empty string in a segment field means it is not part of the label's key. */
export interface DepartmentBalanceLabelDto {
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

export const departmentBalanceLabelsQueryKey = ['department-balances-labels'] as const;

export const useDepartmentBalanceLabels = () =>
  useQuery({
    queryFn: () =>
      fetchJson<DepartmentBalanceLabelDto[]>('/api/departmentbalances/labels'),
    queryKey: departmentBalanceLabelsQueryKey,
    staleTime: 60_000,
  });

/** Non-empty text creates/updates the label for the exact combination; empty text deletes it. */
export const upsertDepartmentBalanceLabel = (input: LabelSegments & { text: string }) =>
  fetchJson<DepartmentBalanceLabelDto | undefined>('/api/departmentbalances/labels', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
