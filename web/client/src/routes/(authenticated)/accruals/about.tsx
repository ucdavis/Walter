import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
} from '@tanstack/react-router';
import { VacationAccrualAbout } from '@/components/accrual/VacationAccrualAbout.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  accrualAssumptionsQueryOptions,
  useAccrualAssumptionsQuery,
} from '@/queries/accrual.ts';

export const Route = createFileRoute('/(authenticated)/accruals/about')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(accrualAssumptionsQueryOptions()),
  errorComponent: RouteErrorBoundary,
  pendingComponent: () => (
    <PageLoading message="Loading accrual assumptions..." />
  ),
  component: RouteComponent,
});

function RouteComponent() {
  const { data, error, isError } = useAccrualAssumptionsQuery();

  if (isError) {
    return (
      <main className="mt-8">
        <div className="container">
          <PageError
            detail={error.message}
            message="Walter could not load the accrual assumptions."
            title="About page unavailable"
          />
        </div>
      </main>
    );
  }

  if (!data) {
    return <PageLoading message="Loading accrual assumptions..." />;
  }

  return <VacationAccrualAbout data={data} />;
}

function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  const presentation = getErrorPresentation(error, {
    404: {
      message: 'Walter could not load the accrual assumptions.',
      title: 'About page unavailable',
    },
  });

  return (
    <main className="mt-8">
      <div className="container">
        <PageError
          actions={
            <>
              <button className="btn btn-primary" onClick={() => reset()} type="button">
                Try again
              </button>
              <Link className="btn btn-outline" to="/accruals">
                Back to overview
              </Link>
            </>
          }
          detail={presentation.detail}
          message={presentation.message}
          statusCode={presentation.statusCode}
          title={presentation.title}
        />
      </div>
    </main>
  );
}
