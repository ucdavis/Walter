import { Link } from '@tanstack/react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import {
  type AccrualDepartmentBreakdownRow,
  type AccrualOverviewResponse,
} from '@/queries/accrual.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface VacationAccrualDepartmentSelectorProps {
  data: AccrualOverviewResponse;
}

interface DepartmentSelectorRow {
  department: string;
  departmentCode: string;
  employees: number;
  kind: 'department' | 'overview';
  subtitle: string;
}

function sortDepartments(
  departments: AccrualDepartmentBreakdownRow[]
): AccrualDepartmentBreakdownRow[] {
  return [...departments].sort((left, right) => {
    const departmentComparison = left.department.localeCompare(
      right.department,
      'en-US'
    );

    if (departmentComparison !== 0) {
      return departmentComparison;
    }

    return left.departmentCode.localeCompare(right.departmentCode, 'en-US');
  });
}

const departmentColumns: ColumnDef<DepartmentSelectorRow>[] = [
  {
    accessorFn: (row) =>
      `${row.department} ${row.departmentCode} ${row.employees}`,
    cell: (info) => {
      const row = info.row.original;
      const employeeLabel = `${row.employees.toLocaleString('en-US')} employee${
        row.employees === 1 ? '' : 's'
      }`;
      const content = (
        <span className="flex min-h-28 flex-col justify-between gap-4">
          <span className="space-y-1">
            <span className="block text-sm text-base-content/60">
              {row.subtitle}
            </span>
            <span className="block font-proxima-bold text-lg leading-tight">
              {row.department}
            </span>
          </span>
          <span className="block text-sm font-semibold text-base-content/75">
            {employeeLabel}
          </span>
        </span>
      );

      if (row.kind === 'overview') {
        return <Link to="/accruals/overview">{content}</Link>;
      }

      return (
        <Link
          params={{ departmentCode: row.departmentCode }}
          to="/accruals/department/$departmentCode"
        >
          {content}
        </Link>
      );
    },
    header: 'Department',
    id: 'department',
  },
];

export function VacationAccrualDepartmentSelector({
  data,
}: VacationAccrualDepartmentSelectorProps) {
  if (data.totalEmployees === 0) {
    return (
      <PageEmpty message="No vacation accrual balances are available for department selection yet." />
    );
  }

  const departments = sortDepartments(data.departmentBreakdown);
  const departmentRows: DepartmentSelectorRow[] = [
    {
      department: 'View All',
      departmentCode: '',
      employees: data.totalEmployees,
      kind: 'overview',
      subtitle: 'All departments overview',
    },
    ...departments.map((department) => ({
      department: department.department,
      departmentCode: department.departmentCode,
      employees: department.headcount,
      kind: 'department' as const,
      subtitle: department.departmentCode,
    })),
  ];

  return (
    <main className="mt-8">
      <div className="container">
        <div className="mx-auto max-w-5xl">
          <section className="section-margin">
            <div className="space-y-2">
              <h1 className="h1">Vacation accruals</h1>
              <p className="max-w-3xl text-lg text-base-content/70">
                Choose a department to open its vacation accrual detail.
              </p>
            </div>

            <div className="mt-8">
              <DataTable
                columns={departmentColumns}
                data={departmentRows}
                defaultColumnSize={220}
                filterPlaceholder="Search departments..."
                globalFilter="left"
                initialState={{ pagination: { pageSize: 25 } }}
                tableClassName="table-cardgrid"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
