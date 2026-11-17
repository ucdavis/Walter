import type { GLPPMReconciliationRecord } from '@/queries/project.ts';

export function hasDiscrepancy(record: GLPPMReconciliationRecord): boolean {
  return Math.abs(record.glActualAmount + record.ppmBudBal) > 0.005;
}

// Sort by project, then fund, then program, then activity
export function sortReconciliationRecords(
  records: GLPPMReconciliationRecord[]
): GLPPMReconciliationRecord[] {
  return [...records].sort((a, b) => {
    const projectCmp = a.project.localeCompare(b.project);
    if (projectCmp !== 0) {
      return projectCmp;
    }
    const fundCmp = (a.fundCode ?? '').localeCompare(b.fundCode ?? '');
    if (fundCmp !== 0) {
      return fundCmp;
    }
    const progCmp = (a.programCode ?? '').localeCompare(b.programCode ?? '');
    if (progCmp !== 0) {
      return progCmp;
    }
    return (a.activityCode ?? '').localeCompare(b.activityCode ?? '');
  });
}
