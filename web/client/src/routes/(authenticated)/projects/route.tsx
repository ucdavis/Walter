import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectsSidebar } from '@/components/project/sidebar.tsx';
import { allProjectsQueryOptions } from '@/queries/project.ts';

export const Route = createFileRoute('/(authenticated)/projects')({
  component: RouteComponent,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(allProjectsQueryOptions()),
  pendingComponent: () => <div>Loading projects...</div>,
});

function RouteComponent() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <ProjectsSidebar />

        {/* Main Content */}
        <Outlet />
      </div>
    </div>
  );
}
