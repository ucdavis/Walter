import { useMutation } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.ts';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AskRequest {
  question: string;
  conversationHistory: ConversationMessage[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
  value2?: number;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie';
  title: string;
  data: ChartDataPoint[];
  xKey?: string;
  yKey?: string;
}

export interface AskResponse {
  answer: string;
  toolsUsed: string[];
  charts: ChartSpec[];
}

export const useAskMutation = () => {
  return useMutation({
    mutationFn: async (request: AskRequest): Promise<AskResponse> => {
      return await fetchJson<AskResponse>('/api/ask', {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },
  });
};
