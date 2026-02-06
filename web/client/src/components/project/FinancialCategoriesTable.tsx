import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AcademicCapIcon,
  ArchiveBoxIcon,
  BoltIcon,
  BriefcaseIcon,
  GlobeAltIcon,
  PaperClipIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import type {
  ProjectCategorySummary,
  ProjectTotals,
} from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';
import { DataTable } from '@/shared/dataTable.tsx';

const ICONS = {
  Contract: UserIcon,
  Default: BriefcaseIcon,
  Fringe: PaperClipIcon,
  Indirect: BoltIcon,
  Salaries: AcademicCapIcon,
  Supplies: ArchiveBoxIcon,
  Travel: GlobeAltIcon,
};

function resolveIcon(category: string) {
  const key = category.toLowerCase();
  if (key.includes('salary') || key.includes('wage')) {
    return ICONS.Salaries;
  }
  if (key.includes('fringe')) {
    return ICONS.Fringe;
  }
  if (key.includes('supplies') || key.includes('services')) {
    return ICONS.Supplies;
  }
  if (key.includes('contract')) {
    return ICONS.Contract;
  }
  if (key.includes('travel')) {
    return ICONS.Travel;
  }
  if (key.includes('indirect') || key.includes('overhead')) {
    return ICONS.Indirect;
  }
  return ICONS.Default;
}

interface FinancialCategoriesTableProps {
  categories: ProjectCategorySummary[];
  totals: ProjectTotals;
}

export function FinancialCategoriesTable({
  categories,
  totals,
}: FinancialCategoriesTableProps) {
  const columns = useMemo<ColumnDef<ProjectCategorySummary>[]>(
    () => [
      {
        accessorKey: 'name',
        cell: ({ row }) => {
          const Icon = resolveIcon(row.original.name);
          return (
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5" />
              <span>{row.original.name}</span>
            </div>
          );
        },
        footer: () => 'TOTALS',
        header: 'Category name',
      },
      {
        accessorKey: 'budget',
        cell: ({ row }) => (
          <span className="flex justify-end w-full">
            <Currency value={row.original.budget} />
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            <Currency value={totals.budget} />
          </span>
        ),
        header: () => <span className="flex justify-end w-full">Budget</span>,
      },
      {
        accessorKey: 'expense',
        cell: ({ row }) => (
          <span className="flex justify-end w-full">
            <Currency value={row.original.expense} />
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            <Currency value={totals.expense} />
          </span>
        ),
        header: () => <span className="flex justify-end w-full">Expenses</span>,
      },
      {
        accessorKey: 'encumbrance',
        cell: ({ row }) => (
          <span className="flex justify-end w-full">
            <Currency value={row.original.encumbrance} />
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            <Currency value={totals.encumbrance} />
          </span>
        ),
        header: () => (
          <span className="flex justify-end w-full">Encumbrance</span>
        ),
      },
      {
        accessorKey: 'balance',
        cell: ({ row }) => (
          <span className="flex justify-end w-full">
            <Currency value={row.original.balance} />
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            <Currency value={totals.balance} />
          </span>
        ),
        header: () => <span className="flex justify-end w-full">Balance</span>,
      },
    ],
    [totals.balance, totals.budget, totals.encumbrance, totals.expense]
  );

  return (
    <DataTable
      columns={columns}
      data={categories}
      footerRowClassName="totaltr"
      globalFilter="none"
      pagination="off"
    />
  );
}
