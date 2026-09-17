import { lazy, Suspense } from 'react';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { createFileRoute, notFound } from '@tanstack/react-router';

const ProjectionLab =
  import.meta.env.MODE === 'demo'
    ? lazy(() => import('@/components/projections/ProjectionLab.tsx'))
    : null;

export const Route = createFileRoute('/(authenticated)/projections/$iamId')({
  component: ProjectionsPage,
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
      <PageEmpty message="ProjectionLab is available in the local demo portfolio." />
    </div>
  ),
});

function ProjectionsPage() {
  const plan = Route.useLoaderData();
  const { iamId } = Route.useParams();
  return ProjectionLab ? (
    <Suspense fallback={<p className="p-6">Loading projections…</p>}>
      <ProjectionLab iamId={iamId} initialPlan={plan} key={iamId} />
    </Suspense>
  ) : null;
}
