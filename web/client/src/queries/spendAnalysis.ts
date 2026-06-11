import { fetchJson } from '@/lib/api.ts';
import { useMutation } from '@tanstack/react-query';

export type SpendAnalysisRequest = {
  includeTrace?: boolean;
  question: string;
};

export type SpendAnalysisSummaryCard = {
  description?: string | null;
  label: string;
  rawValue?: number | null;
  value: string;
};

export type SpendAnalysisChartPayload = {
  data: Array<Record<string, number | string | null>>;
  kind: 'bar' | 'line' | 'pie' | string;
  title: string;
  xKey: string;
  yKeys: string[];
};

export type SpendAnalysisTablePayload = {
  columns: string[];
  rows: Array<Record<string, string>>;
  title: string;
};

export type SpendAnalysisToolCallTrace = {
  filtersApplied: string[];
  payloadJson: string;
  queryText: string;
  reason: string;
  toolName: string;
  topResultIds: string[];
};

export type SpendAnalysisEvidenceEntity = {
  confidence: string;
  id?: string | null;
  kind: string;
  reason: string;
  value: string;
};

export type SpendAnalysisEvidenceRow = {
  categoryName?: string | null;
  confidence: string;
  itemDescription?: string | null;
  lineAmount?: number | null;
  poLineId: string;
  purchaseOrderDescription?: string | null;
  reason: string;
  score: number;
  supplierName: string;
  supplierNumber: string;
};

export type SpendAnalysisEvidenceAssessment = {
  assessmentId: string;
  candidateSetIds: string[];
  confidence: string;
  confirmedEntities: SpendAnalysisEvidenceEntity[];
  confirmedRows: SpendAnalysisEvidenceRow[];
  evidenceState: string;
  expectedEntityType: string;
  exploratoryRows: SpendAnalysisEvidenceRow[];
  focus: string;
  signals: string[];
  suggestedFilters: Record<string, string>;
  summary: string;
  supportingEntities: SpendAnalysisEvidenceEntity[];
  supportingRows: SpendAnalysisEvidenceRow[];
};

export type SpendAnalysisTracePayload = {
  evidenceAssessments: SpendAnalysisEvidenceAssessment[];
  entityType: string;
  finalAnswerSource: string;
  inferredIntent: string;
  originalQuery: string;
  queryExpansions: string[];
  resolvedEntity?: string | null;
  toolCalls: SpendAnalysisToolCallTrace[];
};

export type SpendAnalysisResponse = {
  answerText: string;
  auditSummary: string[];
  charts: SpendAnalysisChartPayload[];
  confidence: string;
  confirmedFindings: string[];
  entity?: {
    supplierNumber?: string | null;
    type: string;
    value: string;
  } | null;
  exploratoryFindings: string[];
  intent: string;
  isConfigured: boolean;
  question: string;
  summaryCards: SpendAnalysisSummaryCard[];
  supportingFindings: string[];
  supportingTable?: SpendAnalysisTablePayload | null;
  trace?: SpendAnalysisTracePayload | null;
};

export async function submitSpendAnalysisQuestion(
  request: SpendAnalysisRequest
): Promise<SpendAnalysisResponse> {
  return await fetchJson<SpendAnalysisResponse>('/api/spendanalysis/query', {
    body: JSON.stringify({
      includeTrace: request.includeTrace ?? true,
      question: request.question,
    }),
    method: 'POST',
  });
}

export const useSpendAnalysisMutation = () =>
  useMutation({
    mutationFn: submitSpendAnalysisQuestion,
  });
