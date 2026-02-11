import {
  AccrualRecord,
  accrualsQueryOptions,
  useAccrualsQuery,
} from '@/queries/accrual.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { createFileRoute } from '@tanstack/react-router';
import { ColumnDef } from '@tanstack/react-table';

export const Route = createFileRoute('/(authenticated)/accruals/')({
  component: RouteComponent,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(accrualsQueryOptions()),
});

const formatNumber = (value: number) =>
  value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`;

const columns: ColumnDef<AccrualRecord>[] = [
  { accessorKey: 'PREFERRED_NAME', header: 'Name' },
  { accessorKey: 'JOB_TITLE', header: 'Job Title' },
  { accessorKey: 'EMPL_CLASS_DESCR', header: 'Group' },
  {
    accessorKey: 'ACCRUAL',
    cell: (info) => formatNumber(info.getValue<number>()),
    header: 'Accrual Last Period',
  },
  {
    accessorKey: 'CURR_BAL',
    cell: (info) => formatNumber(info.getValue<number>()),
    header: 'Current Balance',
  },
  {
    accessorKey: 'ACCR_LIMIT',
    cell: (info) => formatNumber(info.getValue<number>()),
    header: 'Accrual Limit',
  },
  {
    accessorFn: (row) =>
      row.ACCR_LIMIT > 0 ? row.CURR_BAL / row.ACCR_LIMIT : 0,
    cell: (info) => formatPercent(info.getValue<number>()),
    header: '% Max',
    id: 'percentMax',
  },
];

function RouteComponent() {
  const { data, error, isError, isPending } = useAccrualsQuery();

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center py-10">
        <span
          aria-label="Loading accruals"
          className="loading loading-spinner loading-lg text-primary"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="alert alert-error">
        <span>Unable to load accruals: {error.message}</span>
      </div>
    );
  }

  const accruals = data ?? [];
  const totalEmployees = accruals.length;
  const employeesAtMax = accruals.filter(
    ({ ACCR_LIMIT, CURR_BAL }) => ACCR_LIMIT > 0 && CURR_BAL >= ACCR_LIMIT
  ).length;
  const trendingToMax = accruals.filter(
    ({ ACCR_LIMIT, CURR_BAL }) =>
      ACCR_LIMIT > 0 && CURR_BAL < ACCR_LIMIT && CURR_BAL / ACCR_LIMIT >= 0.9
  ).length;

  const toPercent = (value: number) =>
    totalEmployees === 0
      ? '0%'
      : `${Math.round((value / totalEmployees) * 100)}%`;

  return (
    <div className="container mt-8">
      <div className="flex gap-12 mt-8">
        <section className="flex-1">
          <h1 className="h1">Employee Vacation Accruals</h1>
          <dl className="fancy-data">
            <div className="grid items-stretch grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-main-border">
              <div className="flex flex-col">
                <dt className="stat-label">Employees at Max</dt>
                <dd className="text-xl mb-3">{employeesAtMax}</dd>
                <dd className="mt-auto text-sm text-dark-font/70">
                  {toPercent(employeesAtMax)} of{' '}
                  {totalEmployees === 0 ? '0' : totalEmployees} employees
                  reached accrual limit.
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="stat-label">Trending to Max (&gt;90%)</dt>
                <dd className="text-xl mb-3">{trendingToMax}</dd>
                <dd className="mt-auto text-sm text-dark-font/70">
                  {toPercent(trendingToMax)} are above 90% of their limit.
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="stat-label">Monthly Liability</dt>
                <dd className="text-xl font-extrabold text-info mb-3">
                  $75,945
                </dd>
                <dd className="mt-auto text-sm text-dark-font/70">
                  Static value for now.
                </dd>
              </div>
            </div>
          </dl>

          <DataTable
            columns={columns}
            data={accruals}
            initialState={{ pagination: { pageSize: 25 } }}
          />
        </section>
      </div>
    </div>
  );
}
