import { allProjectsQueryOptions } from '@/queries/project.ts';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects')({
  component: RouteComponent,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(allProjectsQueryOptions()),
  pendingComponent: () => <div>Loading projects...</div>,
});

function RouteComponent() {
  return <div>here we will check what permissions you have</div>;
}
