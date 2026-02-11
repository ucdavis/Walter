import type { ManagedPiRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';

const columnHelper = createColumnHelper<ManagedPiRecord>();

const columns = [
  columnHelper.accessor('name', {
    cell: (info) => (
      <Link
        className="link"
        params={{ employeeId: info.row.original.employeeId }}
        to="/projects/$employeeId/"
      >
        {info.getValue()}
      </Link>
    ),
    header: 'PI Name',
  }),
];

interface PrincipalInvestigatorsTableProps {
  pis: ManagedPiRecord[];
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
      <DataTable
        columns={columns}
        data={pis}
        globalFilter="left"
        initialState={{ pagination: { pageSize: 25 } }}
      />
    </div>
  );
}
