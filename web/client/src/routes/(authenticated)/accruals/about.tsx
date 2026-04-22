import { createFileRoute } from '@tanstack/react-router';
import { VacationAccrualAbout } from '@/components/accrual/VacationAccrualAbout.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import {
  accrualAssumptionsQueryOptions,
  useAccrualAssumptionsQuery,
} from '@/queries/accrual.ts';

export const Route = createFileRoute('/(authenticated)/accruals/about')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(accrualAssumptionsQueryOptions()),
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
