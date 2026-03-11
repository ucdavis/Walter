const FINANCIAL_SEARCH_ROLES = new Set([
  'admin',
  'financialviewer',
  'projectmanager',
]);

export const canViewFinancials = (roles: readonly string[]) => {
  return roles.some((role) => FINANCIAL_SEARCH_ROLES.has(role.toLowerCase()));
};
