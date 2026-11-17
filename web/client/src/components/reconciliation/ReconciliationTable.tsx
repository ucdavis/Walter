import { type ReactNode, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import type { GLPPMReconciliationRecord } from '@/queries/project.ts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  hasDiscrepancy,
  sortReconciliationRecords,
} from '@/lib/reconciliation.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';

const columnHelper = createColumnHelper<GLPPMReconciliationRecord>();

const departmentColumn = columnHelper.accessor('financialDepartment', {
  cell: (info) => <span>{info.getValue() ?? '-'}</span>,
  header: 'Dept',
});

const projectColumn = columnHelper.accessor('project', {
  cell: (info) => (
    <TooltipLabel
      focusable={false}
      label={info.getValue()}
      placement="bottom"
      screenReaderLabel={info.row.original.projectDescription ?? undefined}
      tooltip={info.row.original.projectDescription ?? undefined}
    />
  ),
  header: 'Project',
});

interface ReconciliationTableProps {
  projectFirst?: boolean;
  records: GLPPMReconciliationRecord[];
  tableActions?: ReactNode;
}

export function ReconciliationTable({
  projectFirst = false,
  records,
  tableActions,
}: ReconciliationTableProps) {
  const sorted = useMemo(() => sortReconciliationRecords(records), [records]);

  const columns = useMemo(
    () => [
      ...(projectFirst
        ? [projectColumn, departmentColumn]
        : [departmentColumn, projectColumn]),
      columnHelper.accessor('fundCode', {
        cell: (info) => (
          <TooltipLabel
            focusable={false}
            label={info.getValue() ?? '-'}
            placement="bottom"
            screenReaderLabel={info.row.original.fundDescription ?? undefined}
            tooltip={info.row.original.fundDescription ?? undefined}
          />
        ),
        header: 'GL Fund',
      }),
      columnHelper.accessor('ppmFundCode', {
        cell: (info) => (
          <TooltipLabel
            focusable={false}
            label={info.getValue()}
            placement="bottom"
            screenReaderLabel={
              info.row.original.ppmFundDescription ?? undefined
            }
            tooltip={info.row.original.ppmFundDescription ?? undefined}
          />
        ),
        header: 'PPM Fund',
      }),
      columnHelper.accessor('programCode', {
        cell: (info) => (
          <TooltipLabel
            focusable={false}
            label={info.getValue() ?? '-'}
            placement="bottom"
            screenReaderLabel={
              info.row.original.programDescription ?? undefined
            }
            tooltip={info.row.original.programDescription ?? undefined}
          />
        ),
        header: 'Program',
      }),
      columnHelper.accessor('activityCode', {
        cell: (info) => (
          <TooltipLabel
            focusable={false}
            label={info.getValue() ?? '-'}
            placement="bottom"
            screenReaderLabel={
              info.row.original.activityDescription ?? undefined
            }
            tooltip={info.row.original.activityDescription ?? undefined}
          />
        ),
        header: 'Activity',
      }),
      columnHelper.accessor('glActualAmount', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end">GL Balance</span>,
      }),
      columnHelper.accessor('ppmBudBal', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end">PPM Balance</span>,
      }),
      columnHelper.display({
        cell: (info) => {
          const row = info.row.original;
          const diff = row.glActualAmount + row.ppmBudBal;
          const isDisc = hasDiscrepancy(row);
          return (
            <span
              className={`flex font-sans font-bold justify-end ${
                isDisc ? 'text-info' : ''
              }`}
            >
              {formatCurrency(diff)}
            </span>
          );
        },
        header: () => <span className="flex justify-end">Difference</span>,
        id: 'difference',
      }),
      columnHelper.display({
        cell: (info) => {
          const row = info.row.original;
          return (
            <Link
              className="btn btn-xs ms-2 -mt-1"
              params={{ projectNumber: row.project }}
              search={{
                activity: row.activityCode ?? '',
                dept: row.financialDepartment ?? '',
                fund: row.fundCode ?? '',
                program: row.programCode ?? '',
              }}
              to="/reports/reconciliation/$projectNumber/detail"
            >
              Details
            </Link>
          );
        },
        enableSorting: false,
        header: '',
        id: 'actions',
        size: 60,
      }),
    ],
    [projectFirst]
  );

  return (
    <DataTable
      columns={columns}
      data={sorted}
      expandable={false}
      getRowProps={(row) => {
        if (!hasDiscrepancy(row.original)) {
          return {};
        }
        return { className: 'bg-info/10' };
      }}
      globalFilter="none"
      pagination="off"
      tableActions={tableActions}
    />
  );
}
