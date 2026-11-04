import { useMemo } from 'react';
import type { ManagedPiRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';

const columnHelper = createColumnHelper<ManagedPiRecord>();

type PortfolioDestination = '/projects/$iamId/' | '/projections/$iamId';

const createColumns = (to: PortfolioDestination) => [
  columnHelper.accessor('name', {
    cell: (info) => {
      const iamId = info.row.original.iamId;
      if (!iamId) {
        return <span>{info.getValue()}</span>;
      }

      return (
        <Link className="link" params={{ iamId }} to={to}>
          {info.getValue()}
        </Link>
      );
    },
    header: 'PI Name',
  }),
];

interface PrincipalInvestigatorsTableProps {
  pis: ManagedPiRecord[];
  to?: PortfolioDestination;
}

export function PrincipalInvestigatorsTable({
  pis,
  to = '/projects/$iamId/',
}: PrincipalInvestigatorsTableProps) {
  const columns = useMemo(() => createColumns(to), [to]);
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
        defaultColumnSize={220}
        filterPlaceholder="Search PIs..."
        globalFilter="left"
        initialState={{ pagination: { pageSize: 25 } }}
        tableClassName="table-cardgrid"
      />
    </div>
  );
}
