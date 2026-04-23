import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { VacationAccrualDepartmentDetail } from '@/components/accrual/VacationAccrualDepartmentDetail.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  accrualAssumptionsQueryOptions,
  accrualDepartmentDetailQueryOptions,
} from '@/queries/accrual.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
} from '@tanstack/react-router';

export const Route = createFileRoute(
  '/(authenticated)/accruals/department/$departmentCode'
)({
  component: RouteComponent,
  errorComponent: RouteErrorBoundary,
  loader: async ({ context: { queryClient }, params: { departmentCode } }) => {
    await Promise.all([
      queryClient.ensureQueryData(accrualDepartmentDetailQueryOptions(departmentCode)),
      queryClient.ensureQueryData(accrualAssumptionsQueryOptions()),
    ]);
  },
  pendingComponent: () => (
    <PageLoading message="Loading department accrual detail..." />
  ),
});

function RouteComponent() {
  const { departmentCode } = Route.useParams();
  const { data } = useSuspenseQuery(
    accrualDepartmentDetailQueryOptions(departmentCode)
  );
  const { data: assumptions } = useSuspenseQuery(accrualAssumptionsQueryOptions());

  return (
    <VacationAccrualDepartmentDetail assumptions={assumptions} data={data} />
  );
}

function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  const presentation = getErrorPresentation(error, {
    404: {
      message:
        'Walter could not find that department in the current vacation accrual snapshot.',
      title: 'Department not found',
    },
  });

  return (
    <main className="mt-8">
      <div className="container">
        <PageError
          actions={
            <>
              <button
                className="btn btn-primary"
                onClick={() => reset()}
                type="button"
              >
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
