export const ROLE_NAMES = {
  accrualViewer: 'AccrualViewer',
  admin: 'Admin',
  financialViewer: 'FinancialViewer',
  manager: 'Manager',
  projectManager: 'ProjectManager',
  system: 'System',
} as const;

export type AppRole = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

const ELEVATED_ROLES = new Set<AppRole>([
  ROLE_NAMES.admin,
  ROLE_NAMES.manager,
]);

const PI_NAV_ROLES = new Set<AppRole>([
  ROLE_NAMES.financialViewer,
  ROLE_NAMES.projectManager,
]);

export const hasRole = (
  roles: readonly string[],
  allowedRoles: ReadonlySet<AppRole>
) => roles.some((role): role is AppRole => allowedRoles.has(role as AppRole));

export const hasAdminRole = (roles: readonly string[]) =>
  roles.includes(ROLE_NAMES.admin);

export const hasManagerRole = (roles: readonly string[]) =>
  roles.includes(ROLE_NAMES.manager);

export const hasSystemRole = (roles: readonly string[]) =>
  roles.includes(ROLE_NAMES.system);

const hasNonSystemSpecialRole = (roles: readonly string[]) =>
  hasRole(
    roles,
    new Set<AppRole>([
      ROLE_NAMES.admin,
      ROLE_NAMES.manager,
      ROLE_NAMES.accrualViewer,
      ROLE_NAMES.financialViewer,
      ROLE_NAMES.projectManager,
    ])
  );

const isDefaultNavUser = (roles: readonly string[]) =>
  !hasSystemRole(roles) && !hasNonSystemSpecialRole(roles);

export const canAccessAdminDashboard = (roles: readonly string[]) =>
  !hasSystemRole(roles) && hasRole(roles, ELEVATED_ROLES);

export const canAccessAdminUsers = (roles: readonly string[]) =>
  hasManagerRole(roles);

export const canAccessProjectsNav = (roles: readonly string[]) =>
  isDefaultNavUser(roles);

export const canAccessPersonnelNav = (roles: readonly string[]) =>
  isDefaultNavUser(roles);

export const canAccessPrincipalInvestigatorsNav = (roles: readonly string[]) =>
  !hasSystemRole(roles) && hasRole(roles, PI_NAV_ROLES);

export const canAccessReportsNav = (roles: readonly string[]) =>
  !hasSystemRole(roles);
