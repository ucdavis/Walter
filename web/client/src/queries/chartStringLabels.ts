import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api.ts';

/** One shared label: an explanation of a chart-string segment combination.
 * Empty string in a segment field means it is not part of the label's key. */
export interface ChartStringLabelDto {
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

export const chartStringLabelsQueryKey = ['chart-string-labels'] as const;

export const useChartStringLabels = () =>
  useQuery({
    queryFn: () =>
      fetchJson<ChartStringLabelDto[]>('/api/chartstringlabels'),
    queryKey: chartStringLabelsQueryKey,
    staleTime: 60_000,
  });

/** Non-empty text creates/updates the label for the exact combination; empty text deletes it. */
export const upsertChartStringLabel = (input: LabelSegments & { text: string }) =>
  fetchJson<ChartStringLabelDto | undefined>('/api/chartstringlabels', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
