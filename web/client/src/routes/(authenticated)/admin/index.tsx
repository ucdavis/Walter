import { createFileRoute, Link } from '@tanstack/react-router';
import {
  canAccessAdminUsers,
  hasAdminRole,
} from '@/shared/auth/roleAccess.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';

export const Route = createFileRoute('/(authenticated)/admin/')({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  const isAdmin = hasAdminRole(user.roles);
  const showUsersPageLink = canAccessAdminUsers(user.roles);

  return (
    <div className="container mt-8">
      <h1 className="h1">Admin Dashboard</h1>
      <p className="subtitle">Administrative tools and controls for Walter.</p>

      <div className="fancy-data mt-6">
        <dl className="grid items-stretch gap-6 md:grid-cols-3">
          <div>
            <dt className="stat-label">Current Role</dt>
            <dd className="stat-value">{isAdmin ? 'Admin' : 'Manager'}</dd>
            <dd className="mt-2 text-sm text-dark-font/70">
              Access is determined by role assignments from the user profile.
            </dd>
          </div>
          <div>
            <dt className="stat-label">Dashboard</dt>
            <dd className="stat-value">Enabled</dd>
            <dd className="mt-2 text-sm text-dark-font/70">
              You can access administrative dashboard pages.
            </dd>
          </div>
          <div>
            <dt className="stat-label">User Management</dt>
            <dd className="stat-value">
              {showUsersPageLink ? 'Enabled' : 'Not enabled'}
            </dd>
            <dd className="mt-2 text-sm text-dark-font/70">
              Managers can access the admin users page.
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {showUsersPageLink ? (
          <Link className="btn btn-primary" to="/admin/users">
            Open Admin Users
          </Link>
        ) : null}
        <Link className="btn btn-outline" to="/">
          Return to Home
        </Link>
      </div>
    </div>
  );
}
