import {
  AccrualRecord,
  accrualsQueryOptions,
  useAccrualsQuery,
} from '@/queries/accrual.ts';
import { DataTable } from '@/shared/dataTable.tsx';
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
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-10 space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">Accruals</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="card bg-base-100 border border-base-200 shadow-sm">
            <div className="card-body">
              <h2 className="card-title">Employees at Max</h2>
              <p className="text-4xl font-semibold text-error">
                {employeesAtMax}
              </p>
              <p className="opacity-80">
                {toPercent(employeesAtMax)} of{' '}
                {totalEmployees === 0 ? '0' : totalEmployees} employees have
                reached their accrual limit.
              </p>
            </div>
          </div>

          <div className="card bg-base-100 border border-base-200 shadow-sm">
            <div className="card-body">
              <h2 className="card-title">Trending to Max (&gt;90%)</h2>
              <p className="text-4xl font-semibold text-warning">
                {trendingToMax}
              </p>
              <p className="opacity-80">
                {toPercent(trendingToMax)} are above 90% of their limit.
              </p>
            </div>
          </div>

          <div className="card bg-base-100 border border-base-200 shadow-sm">
            <div className="card-body">
              <h2 className="card-title">Monthly Liability</h2>
              <p className="text-4xl font-semibold text-success">$75,945</p>
              <p className="opacity-80">Static value for now.</p>
            </div>
          </div>
        </div>
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <DataTable
              columns={columns}
              data={accruals}
              initialState={{ pagination: { pageSize: 25 } }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
