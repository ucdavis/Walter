import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectsSidebar } from '@/components/ProjectsSidebar.tsx';
import { allProjectsQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/(authenticated)/projects')({
  component: RouteComponent,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(allProjectsQueryOptions()),
});

function RouteComponent() {
  const projectsQuery = useSuspenseQuery(allProjectsQueryOptions());

  if (projectsQuery.isFetching) {
    return <div>Loading projects...</div>;
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        {/* Sticky Sidebar */}
        <ProjectsSidebar />

        {/* Main Content */}
        <Outlet />
      </div>
    </div>
  );
}
