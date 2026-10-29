import { validatePlanSearch } from '@/components/guidedProjections/navigation.ts';
import { lazy, Suspense } from 'react';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import LiveGuidedProjections, {
  loadGuidedWorkspace,
  GuidedProjectionsError,
} from '@/components/guidedProjections/LiveGuidedProjections.tsx';

const ProjectionLab =
  import.meta.env.MODE === 'demo'
    ? lazy(() => import('@/components/projections/ProjectionLab.tsx'))
    : null;

export const Route = createFileRoute('/(authenticated)/projections/$iamId/')({
  validateSearch: validatePlanSearch,
  // eslint-disable-next-line perfectionist/sort-objects -- Router search validation precedes dependent route options.
  component: ProjectionsPage,
  errorComponent: GuidedProjectionsError,
  loader: async ({ context: { queryClient }, params: { iamId } }) => {
    // The demo keeps its original planner URL without querying persisted plans.
    if (import.meta.env.MODE === 'demo') {
      const [{ createDemoData }, { settings }, { createProjectionDemoPlan }] =
        await Promise.all([
          import('@/demo/data.ts'),
          import('@/demo/settings.ts'),
          import('@/demo/projectionPlan.ts'),
        ]);
      const data = createDemoData(settings.seed, settings.asOf);
      if (iamId !== data.user.iamId) {
        throw notFound();
      }
      return { demoPlan: createProjectionDemoPlan(data) };
    }
    await loadGuidedWorkspace(queryClient, iamId);
    return { demoPlan: null };
  },
  notFoundComponent: () => (
    <div className="container py-8">
      <PageEmpty message="ProjectionLab is available in the local demo portfolio." />
    </div>
  ),
  pendingComponent: () => <PageLoading message="Fetching projections..." />,
});

function ProjectionsPage() {
  const { demoPlan } = Route.useLoaderData();
  const { iamId } = Route.useParams();
  const view = Route.useSearch();
  const { plan } = view;
  if (import.meta.env.MODE === 'demo') {
    return ProjectionLab && demoPlan ? (
      <Suspense fallback={<p className="p-6">Loading projections…</p>}>
        <ProjectionLab iamId={iamId} initialPlan={demoPlan} key={iamId} />
      </Suspense>
    ) : null;
  }
  return (
    <LiveGuidedProjections
      iamId={iamId}
      key={`${iamId}-${plan ?? 'home'}`}
      projectionId={plan === 'default' ? 'walter-default-plan' : undefined}
      view={view}
    />
  );
}
