import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessAdminUsers } from '@/shared/auth/roleAccess.ts';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/admin/users')({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!canAccessAdminUsers(user.roles)) {
      throw redirect({ to: '/admin' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="container mt-8">
      <h1 className="h1">Admin Users</h1>
      <p className="subtitle">
        Manager-level page for user administration workflows.
      </p>

      <div className="alert alert-info mt-6">
        <span>
          User management capabilities can be added here as they are defined.
        </span>
      </div>

      <div className="mt-8">
        <Link className="btn btn-outline" to="/admin">
          Back to Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
