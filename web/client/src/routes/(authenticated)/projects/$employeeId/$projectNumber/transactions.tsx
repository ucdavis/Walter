import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/transactions'
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { employeeId, projectNumber } = Route.useParams();

  return (
    <main className="flex-1 max-w-4xl">
      <section className="bg-white rounded-lg border border-gray-200 p-8">
        <h1 className="text-2xl font-semibold mb-3">Transactions</h1>
        <p className="text-gray-600 mb-6">
          Transaction details for project{' '}
          <span className="font-mono">{projectNumber}</span>
          <br/>
          Stay tuned for details!
        </p>
        <Link
          className="btn btn-primary"
          params={{ employeeId, projectNumber }}
          to="/projects/$employeeId/$projectNumber/"
        >
          Back to Project
        </Link>
      </section>
    </main>
  );
}