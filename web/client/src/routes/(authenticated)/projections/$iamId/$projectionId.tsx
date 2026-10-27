import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { projectionQueryOptions } from '@/queries/projections.ts';

export const Route = createFileRoute(
  '/(authenticated)/projections/$iamId/$projectionId'
)({
  component: RouteComponent,
  loader: ({ context: { queryClient }, params: { projectionId } }) =>
    queryClient.ensureQueryData(projectionQueryOptions(Number(projectionId))),
  pendingComponent: () => <PageLoading message="Fetching projection..." />,
});

function RouteComponent() {
  const { projectionId } = Route.useParams();
  const { data: projection } = useSuspenseQuery(
    projectionQueryOptions(Number(projectionId))
  );

  return (
    <main className="container">
      <h1 className="h1 mt-8">{projection.name}</h1>
    </main>
  );
}
