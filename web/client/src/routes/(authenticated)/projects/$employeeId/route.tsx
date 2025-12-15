import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectsSidebar } from '@/components/project/sidebar.tsx';
import { allProjectsQueryOptions } from '@/queries/project.ts';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId')({
  component: RouteComponent,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(allProjectsQueryOptions()),
  pendingComponent: () => <div>Loading projects...</div>,
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
