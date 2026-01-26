import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectsSidebar } from '@/components/project/sidebar.tsx';
import { projectsDetailQueryOptions } from '@/queries/project.ts';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId')({
  component: RouteComponent,
  loader: ({ context: { queryClient }, params: { employeeId } }) =>
    queryClient.ensureQueryData(projectsDetailQueryOptions(employeeId)),
  pendingComponent: () => (
    <div className="text-center mt-20">
      <div className="loading loading-spinner loading-lg mb-2" />
      <div className="mb-4 text-lg">Loading Projects...</div>
    </div>
  ),
});

function RouteComponent() {
  return (
    <div className="container">
      <div className="flex gap-12">
        <ProjectsSidebar />

        {/* Main Content */}
        <Outlet />
      </div>
    </div>
  );
}
