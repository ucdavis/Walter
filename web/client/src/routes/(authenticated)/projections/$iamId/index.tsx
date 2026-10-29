import { lazy, Suspense, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router';
import { PageError } from '@/components/states/PageError.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  createProjection,
  projectionListQueryOptions,
} from '@/queries/projections.ts';

const ProjectionLab =
  import.meta.env.MODE === 'demo'
    ? lazy(() => import('@/components/projections/ProjectionLab.tsx'))
    : null;

export const Route = createFileRoute('/(authenticated)/projections/$iamId/')({
  component: ProjectionsPage,
  errorComponent: ProjectionsErrorBoundary,
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
    await queryClient.ensureQueryData(projectionListQueryOptions(iamId));
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
  if (import.meta.env.MODE === 'demo') {
    return ProjectionLab && demoPlan ? (
      <Suspense fallback={<p className="p-6">Loading projections…</p>}>
        <ProjectionLab iamId={iamId} initialPlan={demoPlan} key={iamId} />
      </Suspense>
    ) : null;
  }
  return <SavedProjectionsPage />;
}

function SavedProjectionsPage() {
  const { iamId } = Route.useParams();
  const { data: projections } = useSuspenseQuery(
    projectionListQueryOptions(iamId)
  );
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [historyMonths, setHistoryMonths] = useState(3);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const created = await createProjection(iamId, { historyMonths, name });
      await navigate({
        params: { iamId, projectionId: String(created.id) },
        to: '/projections/$iamId/$projectionId',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="container">
      <h1 className="h1 mt-8">Projections</h1>

      <section className="section-margin">
        {projections.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Data as of</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      className="link"
                      params={{ iamId, projectionId: String(p.id) }}
                      to="/projections/$iamId/$projectionId"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td>{new Date(p.seededAt).toLocaleDateString()}</td>
                  <td>
                    {new Date(p.updatedAt).toLocaleString()}
                    {p.updatedBy ? ` by ${p.updatedBy}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No projections yet.</p>
        )}
      </section>

      <section className="section-margin">
        <h2 className="h2">New projection</h2>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="flex flex-col gap-1">
            Name
            <input
              className="input input-bordered"
              onChange={(e) => setName(e.target.value)}
              required
              value={name}
            />
          </label>
          <label className="flex flex-col gap-1">
            Averaging window
            <select
              className="select select-bordered"
              onChange={(e) => setHistoryMonths(Number(e.target.value))}
              value={historyMonths}
            >
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </label>
          <button className="btn btn-primary" disabled={creating} type="submit">
            {creating ? 'Creating...' : 'Create'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ProjectionsErrorBoundary({ error, reset }: ErrorComponentProps) {
  const presentation = getErrorPresentation(error, {
    403: {
      message: 'Walter can only show projections for portfolios you can open.',
      title: 'You do not have access to these projections',
    },
  });

  return (
    <main className="container">
      <PageError
        actions={
          <button
            className="btn btn-primary"
            onClick={() => reset()}
            type="button"
          >
            Try again
          </button>
        }
        detail={presentation.detail}
        message={presentation.message}
        statusCode={presentation.statusCode}
        title={presentation.title}
      />
    </main>
  );
}
