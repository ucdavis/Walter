import { validatePlanSearch } from '@/components/guidedProjections/navigation.ts';
import { lazy, Suspense } from 'react';
import { createFileRoute, notFound } from '@tanstack/react-router';
import LiveGuidedProjections, {
  loadGuidedWorkspace,
  GuidedProjectionsError,
} from '@/components/guidedProjections/LiveGuidedProjections.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';

const GuidedProjections =
  import.meta.env.MODE === 'demo'
    ? lazy(() => import('@/components/guidedProjections/GuidedProjections.tsx'))
    : null;

export const Route = createFileRoute(
  '/(authenticated)/guided-projections/$iamId'
)({
  validateSearch: validatePlanSearch,
  // eslint-disable-next-line perfectionist/sort-objects -- Router search validation precedes dependent route options.
  component: GuidedProjectionsPage,
  errorComponent: GuidedProjectionsError,
  loader: async ({ context: { queryClient }, params: { iamId } }) => {
    if (import.meta.env.MODE !== 'demo') {
      await loadGuidedWorkspace(queryClient, iamId);
      return null;
    }
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
    return createProjectionDemoPlan(data);
  },
  notFoundComponent: () => (
    <div className="container py-8">
      <PageEmpty message="Guided projections are available in the local demo portfolio." />
    </div>
  ),
  pendingComponent: () => <PageLoading message="Fetching projections..." />,
});

function GuidedProjectionsPage() {
  const initialPlan = Route.useLoaderData();
  const { iamId } = Route.useParams();
  const view = Route.useSearch();
  const { plan } = view;
  if (!initialPlan) {
    return (
      <LiveGuidedProjections
        iamId={iamId}
        key={`${iamId}-${plan ?? 'home'}`}
        projectionId={plan === 'default' ? 'walter-default-plan' : undefined}
        view={view}
      />
    );
  }
  return GuidedProjections ? (
    <Suspense fallback={<p className="p-6">Opening guided projections…</p>}>
      <GuidedProjections initialPlan={initialPlan} key={iamId} />
    </Suspense>
  ) : null;
}
