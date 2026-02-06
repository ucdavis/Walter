import { ExportCsvButton } from '@/components/ExportCsvButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import type { PiWithProjects } from '@/queries/project.ts';
import { DataTable } from '@/shared/dataTable.tsx';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';

const piCsvColumns = [
  { header: 'PI Name', key: 'name' as const },
  { header: 'Projects', key: 'projectCount' as const },
  { header: 'Balance', key: 'totalBalance' as const },
  { header: 'Budget', key: 'totalBudget' as const },
];

const formatPercent = (balance: number, budget: number) => {
  if (budget === 0) {
    return '—';
  }
  const percent = (balance / budget) * 100;
  return `${percent.toFixed(0)}%`;
};

const columns: ColumnDef<PiWithProjects>[] = [
  {
    accessorKey: 'name',
    cell: ({ row }) => (
      <Link
        className="link link-hover link-primary"
        params={{ employeeId: row.original.employeeId }}
        to="/projects/$employeeId/"
      >
        {row.original.name}
      </Link>
    ),
    header: 'PI Name',
  },
  {
    accessorKey: 'projectCount',
    cell: (info) => (
      <span className="flex justify-end w-full">
        {info.getValue<number>()}
      </span>
    ),
    header: () => <span className="flex justify-end w-full">Projects</span>,
  },
  {
    accessorKey: 'totalBalance',
    cell: ({ row }) => (
      <span className="flex justify-end w-full">
        {formatCurrency(row.original.totalBalance)}{' '}
        <span className="text-base-content/60">
          ({formatPercent(row.original.totalBalance, row.original.totalBudget)})
        </span>
      </span>
    ),
    header: () => <span className="flex justify-end w-full">Balance</span>,
  },
];

interface PrincipalInvestigatorsTableProps {
  pis: PiWithProjects[];
}

export function PrincipalInvestigatorsTable({
  pis,
}: PrincipalInvestigatorsTableProps) {
  if (pis.length === 0) {
    return (
      <p className="text-base-content/70 mt-8">
        No principal investigators found.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex justify-end">
        <ExportCsvButton
          columns={piCsvColumns}
          data={pis.map((pi) => ({
            name: pi.name,
            projectCount: pi.projectCount,
            totalBalance: pi.totalBalance,
            totalBudget: pi.totalBudget,
          }))}
          filename="principal-investigators.csv"
        />
      </div>
      <DataTable
        columns={columns}
        data={pis}
        initialState={{ pagination: { pageSize: 25 } }}
      />
    </div>
  );
}

