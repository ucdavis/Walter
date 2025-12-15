import {
  managedPisQueryOptions,
  useManagedPisQuery,
} from '@/queries/project.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects')({
  component: RouteComponent,
  loader: async ({ context: { queryClient } }) => {
    const user = await queryClient.ensureQueryData(meQueryOptions());
    return queryClient.ensureQueryData(managedPisQueryOptions(user.employeeId));
  },
  pendingComponent: () => <div>Loading managed investigators...</div>,
});

function RouteComponent() {
  const user = useUser();
  const {
    data: managedPis,
    error,
    isError,
    isPending,
  } = useManagedPisQuery(user.employeeId);

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="alert alert-error">
        <span>Unable to load managed investigators: {error.message}</span>
      </div>
    );
  }

  if (!managedPis?.length) {
    return (
      <Navigate
        params={{ employeeId: user.employeeId }}
        to="/projects/$employeeId/"
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Managed Investigators</h1>
        <p className="text-base-content/70">
          Showing investigators for manager ID {user.id}.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {managedPis.map((pi) => (
          <div className="card bg-base-100 shadow" key={pi.employeeId}>
            <div className="card-body">
              <h2 className="card-title">{pi.name}</h2>
              <p className="text-base-content/70">
                Projects managed: {pi.projectCount}
              </p>
              <div className="card-actions justify-end">
                <Link
                  className="btn btn-primary btn-sm"
                  params={{ employeeId: pi.employeeId }}
                  to="/projects/$employeeId/"
                >
                  View Projects
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
