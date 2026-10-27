import { lazy, Suspense } from 'react';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';

const GuidedProjections =
  import.meta.env.MODE === 'demo'
    ? lazy(() => import('@/components/guidedProjections/GuidedProjections.tsx'))
    : null;

export const Route = createFileRoute(
  '/(authenticated)/guided-projections/$iamId'
)({
  component: GuidedProjectionsPage,
  loader: async ({ params: { iamId } }) => {
    if (import.meta.env.MODE !== 'demo') {
      throw notFound();
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
});

function GuidedProjectionsPage() {
  const initialPlan = Route.useLoaderData();
  const { iamId } = Route.useParams();
  return GuidedProjections ? (
    <Suspense fallback={<p className="p-6">Opening guided projections…</p>}>
      <GuidedProjections initialPlan={initialPlan} key={iamId} />
    </Suspense>
  ) : null;
}
