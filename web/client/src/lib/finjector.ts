// Builds links to the Finjector chart-string detail tool.
// A Finjector PPM chart string is `Project-Task-Org-ExpenditureType`. Walter's
// project/task data has no single expenditure type (that lives at the transaction
// level), so we send a fixed placeholder for the final segment.
const PLACEHOLDER_EXPENDITURE_TYPE = '522201';
const FINJECTOR_BASE_URL = 'https://finjector.ucdavis.edu/details';

/**
 * Builds a Finjector chart-string details URL for a PPM project/task.
 * Returns null when a required segment is missing, so callers can fall back to
 * plain text rather than emit a malformed chart string.
 */
export function buildFinjectorUrl(
  project: string | null | undefined,
  task: string | null | undefined,
  org: string | null | undefined
): string | null {
  if (!project || !task || !org) {
    return null;
  }

  const chartString = [project, task, org, PLACEHOLDER_EXPENDITURE_TYPE]
    .map((segment) => encodeURIComponent(segment))
    .join('-');

  return `${FINJECTOR_BASE_URL}/${chartString}/`;
}
