import { ROLE_NAMES, type AppRole, hasRole } from '@/shared/auth/roleAccess.ts';

const FINANCIAL_SEARCH_ROLES = new Set<AppRole>([
  ROLE_NAMES.admin,
  ROLE_NAMES.financialViewer,
]);

export const canViewFinancials = (roles: readonly string[]) => {
  return hasRole(roles, FINANCIAL_SEARCH_ROLES);
};
