import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessAdminDashboard } from '@/shared/auth/roleAccess.ts';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/admin')({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!canAccessAdminDashboard(user.roles)) {
      throw redirect({ to: '/' });
    }
  },
  component: () => <Outlet />,
});
