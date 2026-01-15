import { managedPisQueryOptions } from '@/queries/project.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects')({
  component: RouteComponent,
  loader: async ({ context: { queryClient } }) => {
    const user = await queryClient.ensureQueryData(meQueryOptions());
    return queryClient.ensureQueryData(managedPisQueryOptions(user.employeeId));
  },
  pendingComponent: () => <div>Loading managed investigators...</div>,
});

function RouteComponent() {
  return <Outlet />;
}
