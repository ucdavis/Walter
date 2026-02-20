export const hasAdminRole = (roles: readonly string[]) =>
  roles.includes('Admin');

export const hasManagerRole = (roles: readonly string[]) =>
  roles.includes('Manager');

export const canAccessAdminDashboard = (roles: readonly string[]) =>
  hasAdminRole(roles) || hasManagerRole(roles);

export const canAccessAdminUsers = (roles: readonly string[]) =>
  hasManagerRole(roles);
