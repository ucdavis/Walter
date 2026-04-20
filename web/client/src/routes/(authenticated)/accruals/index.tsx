import {
  accrualOverviewQueryOptions,
  useAccrualOverviewQuery,
} from '@/queries/accrual.ts';
import { VacationAccrualOverview } from '@/components/accrual/VacationAccrualOverview.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/accruals/')({
  component: RouteComponent,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(accrualOverviewQueryOptions()),
  pendingComponent: () => (
    <PageLoading message="Loading the vacation accrual overview..." />
  ),
});

function RouteComponent() {
  const { data, error, isError } = useAccrualOverviewQuery();

  if (isError) {
    return (
      <main className="mt-8">
        <div className="container">
          <PageError
            detail={error.message}
            message="Walter could not load the vacation accrual overview."
            title="Overview unavailable"
          />
        </div>
      </main>
    );
  }

  if (!data) {
    return <PageLoading message="Loading the vacation accrual overview..." />;
  }

  return <VacationAccrualOverview data={data} />;
}
