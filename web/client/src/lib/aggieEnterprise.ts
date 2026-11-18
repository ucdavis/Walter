// Builds deep links into Aggie Enterprise (Oracle Fusion). Links open under the
// user's own Aggie Enterprise sign-in.
const AGGIE_ENTERPRISE_BASE_URL =
  'https://fa-etfq-saasfaprod1.fa.ocs.oraclecloud.com';

function buildDeepLink(objType: string, objKey: string, action: string) {
  return `${AGGIE_ENTERPRISE_BASE_URL}/fscmUI/faces/deeplink?objType=${objType}&objKey=${objKey}&action=${action}`;
}

/**
 * Builds the link to a single project cost. The PPM transaction number is the
 * Oracle expenditure item id. Returns null when it is missing.
 */
export function buildAeCostUrl(
  transactionNumber: number | null | undefined
): string | null {
  if (transactionNumber == null) {
    return null;
  }

  return buildDeepLink(
    'EXPENDITUREITEMDETAILS',
    `ExpItemId=${transactionNumber}`,
    'EDIT'
  );
}

/**
 * Builds the link to a project's Manage Project Budget page. Takes Oracle's
 * internal project id, not the project number. Returns null when it is missing.
 */
export function buildAeProjectBudgetUrl(
  oracleProjectId: number | null | undefined
): string | null {
  if (oracleProjectId == null) {
    return null;
  }

  return buildDeepLink(
    'PROJECT',
    `ProjectId=${oracleProjectId}`,
    'MANAGE_BUDGET'
  );
}

/**
 * Builds the link to a project's Manage Financial Project Plan page. Takes
 * Oracle's internal project id, not the project number. Returns null when it
 * is missing.
 */
export function buildAeFinancialPlanUrl(
  oracleProjectId: number | null | undefined
): string | null {
  if (oracleProjectId == null) {
    return null;
  }

  return buildDeepLink(
    'PROJECT',
    `ProjectId=${oracleProjectId}`,
    'MANAGE_FIN_PLAN'
  );
}
