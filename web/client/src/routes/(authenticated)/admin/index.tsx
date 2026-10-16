import { createFileRoute, Link } from '@tanstack/react-router';
import {
  canAccessAdminUsers,
  hasAdminRole,
  hasSystemRole,
} from '@/shared/auth/roleAccess.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import {
  ArrowRightIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

export const Route = createFileRoute('/(authenticated)/admin/')({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  const isAdmin = hasAdminRole(user.roles);
  const isSystem = hasSystemRole(user.roles);
  const showUsersPageLink = canAccessAdminUsers(user.roles);
  const currentRole = isAdmin ? 'Admin' : isSystem ? 'System' : 'Manager';

  return (
    <main className="mt-8">
      <div className="container">
        <h1 className="h1">Admin Dashboard</h1>
        <p className="subtitle">
          Administrative tools and controls for Walter.
        </p>

        <div className="fancy-data mt-6">
          <dl className="grid items-stretch gap-6 md:grid-cols-3">
            <div>
              <dt className="stat-label">Current Role</dt>
              <dd className="stat-value">{currentRole}</dd>
              <dd className="mt-2 text-sm text-base-content/70">
                Access is determined by role assignments from the user profile.
              </dd>
            </div>
            <div>
              <dt className="stat-label">Dashboard</dt>
              <dd className="stat-value">Enabled</dd>
              <dd className="mt-2 text-sm text-base-content/70">
                You can access administrative dashboard pages.
              </dd>
            </div>
            <div>
              <dt className="stat-label">User Management</dt>
              <dd className="stat-value">
                {showUsersPageLink ? 'Enabled' : 'Not enabled'}
              </dd>
              <dd className="mt-2 text-sm text-base-content/70">
                Managers can access the admin users page.
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {showUsersPageLink ? (
            <Link
              aria-label="User Management"
              className="border-main-border group block h-full rounded-sm border bg-base-100 p-5 transition hover:bg-[#F2F6FC] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              to="/admin/users"
            >
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <UsersIcon className="h-6 w-6" />
                  <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-base-content/40 transition group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-sans font-bold">
                    User Management
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-base-content/70">
                    Search for users and manage their Walter access.
                  </p>
                </div>
              </div>
            </Link>
          ) : null}
          {isAdmin ? (
            <>
              <Link
                aria-label="Site Notification"
                className="border-main-border group block h-full rounded-sm border bg-base-100 p-5 transition hover:bg-[#F2F6FC] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                to="/admin/notification"
              >
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <MegaphoneIcon className="h-6 w-6" />
                    <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-base-content/40 transition group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-sans font-bold">
                      Site Notification
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-base-content/70">
                      Share an announcement with Walter users.
                    </p>
                  </div>
                </div>
              </Link>
              <Link
                aria-label="Email Preview"
                className="border-main-border group block h-full rounded-sm border bg-base-100 p-5 transition hover:bg-[#F2F6FC] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                to="/admin/email-preview"
              >
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <EnvelopeIcon className="h-6 w-6" />
                    <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-base-content/40 transition group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-sans font-bold">
                      Email Preview
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-base-content/70">
                      Preview the notification emails sent by Walter.
                    </p>
                  </div>
                </div>
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
