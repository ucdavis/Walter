// Builds links to the Finjector chart-string detail tool.
// A Finjector PPM chart string is `Project-Task-Org-ExpenditureType`. Walter's
// project/task data has no single expenditure type (that lives at the transaction
// level), so we send a fixed placeholder for the final segment.
const PLACEHOLDER_EXPENDITURE_TYPE = '522201';
const FINJECTOR_BASE_URL = 'https://finjector.ucdavis.edu/details';

/**
 * Builds the PPM chart string used by Finjector. The expenditure type remains a
 * fixed placeholder because project/task data does not identify one.
 */
export function buildFinjectorChartString(
  project: string | null | undefined,
  task: string | null | undefined,
  org: string | null | undefined
): string | null {
  if (!project || !task || !org) {
    return null;
  }

  return [project, task, org, PLACEHOLDER_EXPENDITURE_TYPE].join('-');
}

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
  const chartString = buildFinjectorChartString(project, task, org);
  if (!chartString) {
    return null;
  }

  const encodedChartString = chartString
    .split('-')
    .map((segment) => encodeURIComponent(segment))
    .join('-');

  return `${FINJECTOR_BASE_URL}/${encodedChartString}/`;
}
