import { createColumnHelper } from '@tanstack/react-table';
import {
  AcademicCapIcon,
  ArchiveBoxIcon,
  BoltIcon,
  BriefcaseIcon,
  GlobeAltIcon,
  PaperClipIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import type { ProjectCategorySummary } from '@/lib/projectSummary.ts';
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

const columnHelper = createColumnHelper<ProjectCategorySummary>();

const columns = [
  columnHelper.accessor('name', {
    cell: (info) => {
      const Icon = resolveIcon(info.getValue());
      return (
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" />
          <span>{info.getValue()}</span>
        </div>
      );
    },
    footer: () => 'TOTALS',
    header: 'Category name',
  }),
  columnHelper.accessor('budget', {
    cell: (info) => (
      <span className="flex justify-end w-full">
        <Currency value={info.getValue()} />
      </span>
    ),
    footer: ({ table }) => (
      <span className="flex justify-end w-full">
        <Currency
          value={table
            .getFilteredRowModel()
            .rows.reduce((sum, row) => sum + row.original.budget, 0)}
        />
      </span>
    ),
    header: () => <span className="flex justify-end w-full">Budget</span>,
  }),
  columnHelper.accessor('expense', {
    cell: (info) => (
      <span className="flex justify-end w-full">
        <Currency value={info.getValue()} />
      </span>
    ),
    footer: ({ table }) => (
      <span className="flex justify-end w-full">
        <Currency
          value={table
            .getFilteredRowModel()
            .rows.reduce((sum, row) => sum + row.original.expense, 0)}
        />
      </span>
    ),
    header: () => <span className="flex justify-end w-full">Expenses</span>,
  }),
  columnHelper.accessor('encumbrance', {
    cell: (info) => (
      <span className="flex justify-end w-full">
        <Currency value={info.getValue()} />
      </span>
    ),
    footer: ({ table }) => (
      <span className="flex justify-end w-full">
        <Currency
          value={table
            .getFilteredRowModel()
            .rows.reduce((sum, row) => sum + row.original.encumbrance, 0)}
        />
      </span>
    ),
    header: () => <span className="flex justify-end w-full">Encumbrance</span>,
  }),
  columnHelper.accessor('balance', {
    cell: (info) => (
      <span className="flex justify-end w-full">
        <Currency value={info.getValue()} />
      </span>
    ),
    footer: ({ table }) => (
      <span className="flex justify-end w-full">
        <Currency
          value={table
            .getFilteredRowModel()
            .rows.reduce((sum, row) => sum + row.original.balance, 0)}
        />
      </span>
    ),
    header: () => <span className="flex justify-end w-full">Balance</span>,
  }),
];

interface FinancialCategoriesTableProps {
  categories: ProjectCategorySummary[];
}

export function FinancialCategoriesTable({
  categories,
}: FinancialCategoriesTableProps) {
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
