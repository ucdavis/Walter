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
});

function RouteComponent() {
  const { data, error, isError, isPending } = useAccrualOverviewQuery();

  if (isPending) {
    return <PageLoading message="Loading the vacation accrual overview..." />;
  }

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

  return <VacationAccrualOverview data={data} />;
}
