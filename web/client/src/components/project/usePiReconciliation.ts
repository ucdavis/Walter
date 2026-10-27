import { useQueries } from '@tanstack/react-query';
import {
  buildPiProjects,
  chunk,
  getPmInternalProjects,
  type PiReconciliationProject,
  RECONCILIATION_BATCH_SIZE,
} from '@/lib/piReconciliation.ts';
import {
  type GLPPMReconciliationRecord,
  glPpmReconciliationQueryOptions,
  type ManagedPiRecord,
  projectsDetailQueryOptions,
} from '@/queries/project.ts';

export type PiReconciliationStatus = 'loading' | 'error' | 'success';

export interface PiReconciliationSummary {
  issueCount: number;
  projects: PiReconciliationProject[];
  status: PiReconciliationStatus;
}

const emptySummary: PiReconciliationSummary = {
  issueCount: 0,
  projects: [],
  status: 'success',
};

/**
 * Reconciliation for each PI's internal projects managed by `pmEmployeeId`.
 * Only this PM's projects are requested, so the viewer never fetches
 * reconciliation rows they aren't allowed to see.
 */
export function usePiReconciliation(
  pis: ManagedPiRecord[],
  pmEmployeeId: string | null
): {
  byPi: Map<string, PiReconciliationSummary>;
  totalIssueCount: number | null;
} {
  // Same query keys as the home page, so cached portfolios are reused.
  const portfolioQueries = useQueries({
    queries: pmEmployeeId
      ? pis.map((pi) => projectsDetailQueryOptions(pi.iamId ?? ''))
      : [],
  });

  const pmProjects = portfolioQueries.map((q) =>
    q.data && pmEmployeeId ? getPmInternalProjects(q.data, pmEmployeeId) : []
  );
  const portfoliosSettled = portfolioQueries.every((q) => !q.isPending);

  const projectNumbers = portfoliosSettled
    ? [...new Set(pmProjects.flat().map((p) => p.projectNumber))].sort()
    : [];
  const batches = chunk(projectNumbers, RECONCILIATION_BATCH_SIZE);

  const reconciliationQueries = useQueries({
    queries: batches.map((batch) => glPpmReconciliationQueryOptions(batch)),
  });

  const batchByProject = new Map<string, number>();
  batches.forEach((batch, index) => {
    for (const projectNumber of batch) {
      batchByProject.set(projectNumber, index);
    }
  });

  const recordsByProject = new Map<string, GLPPMReconciliationRecord[]>();
  for (const q of reconciliationQueries) {
    for (const r of q.data ?? []) {
      const list = recordsByProject.get(r.project) ?? [];
      list.push(r);
      recordsByProject.set(r.project, list);
    }
  }

  const byPi = new Map<string, PiReconciliationSummary>();
  pis.forEach((pi, index) => {
    if (!pmEmployeeId) {
      byPi.set(pi.employeeId, emptySummary);
      return;
    }

    const portfolio = portfolioQueries[index];
    const projects = pmProjects[index] ?? [];
    let status: PiReconciliationStatus;
    if (!portfolio || portfolio.isPending) {
      status = 'loading';
    } else if (portfolio.isError) {
      status = 'error';
    } else if (projects.length === 0) {
      status = 'success';
    } else if (!portfoliosSettled) {
      status = 'loading';
    } else {
      const batchQueries = projects.map(
        (p) => reconciliationQueries[batchByProject.get(p.projectNumber) ?? -1]
      );
      if (batchQueries.some((q) => !q || q.isPending)) {
        status = 'loading';
      } else if (batchQueries.some((q) => q.isError)) {
        status = 'error';
      } else {
        status = 'success';
      }
    }

    const built =
      status === 'success' ? buildPiProjects(projects, recordsByProject) : [];
    byPi.set(pi.employeeId, {
      issueCount: built.filter((p) => p.isOutOfBalance).length,
      projects: built,
      status,
    });
  });

  const summaries = [...byPi.values()];
  const totalIssueCount = summaries.every((s) => s.status === 'success')
    ? new Set(
        summaries.flatMap((s) =>
          s.projects.filter((p) => p.isOutOfBalance).map((p) => p.projectNumber)
        )
      ).size
    : null;

  return { byPi, totalIssueCount };
}
