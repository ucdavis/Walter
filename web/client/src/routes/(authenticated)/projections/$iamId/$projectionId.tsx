import { validatePlanSearch } from '@/components/guidedProjections/navigation.ts';
import { createFileRoute } from '@tanstack/react-router';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import LiveGuidedProjections, {
  loadGuidedWorkspace,
  GuidedProjectionsError,
} from '@/components/guidedProjections/LiveGuidedProjections.tsx';

export const Route = createFileRoute(
  '/(authenticated)/projections/$iamId/$projectionId'
)({
  validateSearch: validatePlanSearch,
  // eslint-disable-next-line perfectionist/sort-objects -- Search validation precedes dependent route options.
  component: RouteComponent,
  errorComponent: GuidedProjectionsError,
  loader: ({ context: { queryClient }, params: { iamId, projectionId } }) =>
    loadGuidedWorkspace(queryClient, iamId, projectionId),
  pendingComponent: () => <PageLoading message="Fetching projection..." />,
});

function RouteComponent() {
  const { iamId, projectionId } = Route.useParams();
  const view = Route.useSearch();
  return (
    <LiveGuidedProjections
      iamId={iamId}
      key={`${iamId}-${projectionId}`}
      projectionId={projectionId}
      view={view}
    />
  );
}
