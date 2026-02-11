import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectsSidebar } from '@/components/project/ProjectsSidebar.tsx';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { PageLoading } from '@/components/states/PageLoading.tsx';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId')({
  component: RouteComponent,
  loader: ({ context: { queryClient }, params: { employeeId } }) =>
    queryClient.ensureQueryData(projectsDetailQueryOptions(employeeId)),
  pendingComponent: () => <PageLoading message="Fetching projects..." />,
});

function RouteComponent() {
  return (
    <div className="container">
      <div className="flex gap-12">
        <ProjectsSidebar />

        <Outlet />
      </div>
    </div>
  );
}
