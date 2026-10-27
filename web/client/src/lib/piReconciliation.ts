import type {
  GLPPMReconciliationRecord,
  ProjectRecord,
} from '@/queries/project.ts';
import {
  hasDiscrepancy,
  sortReconciliationRecords,
} from '@/lib/reconciliation.ts';

// The reconciliation sproc embeds project IDs in an OPENQUERY string capped at
// 8,000 characters, so large portfolios are split across requests.
export const RECONCILIATION_BATCH_SIZE = 100;

export interface PmInternalProject {
  projectName: string;
  projectNumber: string;
}

export interface PiReconciliationProject extends PmInternalProject {
  isOutOfBalance: boolean;
  records: GLPPMReconciliationRecord[];
}

export function getPmInternalProjects(
  records: ProjectRecord[],
  pmEmployeeId: string
): PmInternalProject[] {
  const byNumber = new Map<string, PmInternalProject>();
  for (const r of records) {
    if (
      r.projectType === 'Internal' &&
      r.pmEmployeeId === pmEmployeeId &&
      !byNumber.has(r.projectNumber)
    ) {
      byNumber.set(r.projectNumber, {
        projectName: r.projectName,
        projectNumber: r.projectNumber,
      });
    }
  }

  return [...byNumber.values()].sort(
    (a, b) =>
      a.projectName.localeCompare(b.projectName) ||
      a.projectNumber.localeCompare(b.projectNumber)
  );
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export function buildPiProjects(
  projects: PmInternalProject[],
  recordsByProject: Map<string, GLPPMReconciliationRecord[]>
): PiReconciliationProject[] {
  return projects.map((p) => {
    const records = sortReconciliationRecords(
      recordsByProject.get(p.projectNumber) ?? []
    );
    return { ...p, isOutOfBalance: records.some(hasDiscrepancy), records };
  });
}
