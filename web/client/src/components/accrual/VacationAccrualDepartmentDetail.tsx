import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  ArrowLongLeftIcon,
  ChartBarIcon,
  FireIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { Link, useNavigate } from '@tanstack/react-router';
import { ColumnDef } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import {
  type AccrualAssumptionsResponse,
  type AccrualDepartmentDetailResponse,
  type AccrualDepartmentEmployeeRow,
} from '@/queries/accrual.ts';
import { DataTable } from '@/shared/DataTable.tsx';

const asOfDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const hoursFormatter = (value: number) =>
  `${Math.round(value).toLocaleString('en-US')} hrs`;

const compactHoursFormatter = (value: number) =>
  value.toLocaleString('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  });

const departmentEmployeeCsvColumns = [
  { header: 'Employee', key: 'employeeName' as const },
  { header: 'ID', key: 'employeeId' as const },
  { header: 'Class', key: 'classification' as const },
  { header: 'Balance Hours', key: 'balanceHours' as const },
  { header: 'Cap Hours', key: 'capHours' as const },
  { header: '% of Cap', key: 'pctOfCap' as const },
  { header: 'Accrual/Mo', key: 'accrualHoursPerMonth' as const },
  { header: 'Months to Cap', key: 'monthsToCap' as const },
  { format: 'date' as const, header: 'Last Vacation', key: 'lastVacationDate' as const },
  {
    format: 'currency' as const,
    header: 'Lost Cost/Mo',
    key: 'lostCostMonth' as const,
  },
];

type SummaryCardProps = {
  accentClassName: string;
  description: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
};

type StatusFilter = 'all' | 'approaching' | 'at-cap';
type ClassificationFilter = 'all' | 'academic' | 'staff' | string;
type EmployeeStatus = 'active' | 'approaching' | 'at-cap';

type StatusThresholds = Pick<
  AccrualAssumptionsResponse,
  'approachingThresholdPct' | 'atCapThresholdPct'
>;

function SummaryCard({
  accentClassName,
  description,
  Icon,
  label,
  value,
}: SummaryCardProps) {
  return (
    <section className="card bg-base-100 border border-main-border shadow-sm">
      <div className="card-body gap-3 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase text-base-content/60">
          <Icon className={`h-4 w-4 ${accentClassName}`} />
          <span>{label}</span>
        </div>
        <div className={`text-4xl font-semibold ${accentClassName}`}>
          {value}
        </div>
        <p className="text-sm text-base-content/65">{description}</p>
      </div>
    </section>
  );
}

function isAcademicClassification(classification: string): boolean {
  return classification.startsWith('FY ');
}

function getEmployeeStatus(
  employee: AccrualDepartmentEmployeeRow,
  thresholds: StatusThresholds
): EmployeeStatus {
  if (employee.pctOfCap >= thresholds.atCapThresholdPct) {
    return 'at-cap';
  }

  if (employee.pctOfCap >= thresholds.approachingThresholdPct) {
    return 'approaching';
  }

  return 'active';
}

function getStatusLabel(status: EmployeeStatus): string {
  return status === 'at-cap'
    ? 'At Cap'
    : status === 'approaching'
      ? 'Approaching'
      : 'Active';
}

function getStatusClassName(status: EmployeeStatus): string {
  if (status === 'at-cap') {
    return 'border-error/20 bg-error/5 text-error';
  }

  if (status === 'approaching') {
    return 'border-warning/20 bg-warning/10 text-warning';
  }

  return 'border-success/20 bg-success/10 text-success';
}

function ClassificationBadge({
  classification,
}: {
  classification: string;
}) {
  let className = 'bg-success/10 text-success';

  if (classification === 'PSS') {
    className = 'bg-base-200 text-base-content/75';
  } else if (classification === 'MSP') {
    className = 'bg-secondary/10 text-secondary';
  } else if (classification === 'SMG') {
    className = 'bg-info/10 text-info';
  }

  return (
    <span
      className={`inline-flex rounded px-2 py-1 text-xs font-semibold whitespace-nowrap ${className}`}
    >
      {classification}
    </span>
  );
}

function StatusBadge({
  employee,
  thresholds,
}: {
  employee: AccrualDepartmentEmployeeRow;
  thresholds: StatusThresholds;
}) {
  const status = getEmployeeStatus(employee, thresholds);

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${getStatusClassName(status)}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function CapProgressBar({
  pctOfCap,
  thresholds,
}: {
  pctOfCap: number;
  thresholds: StatusThresholds;
}) {
  const status =
    pctOfCap >= thresholds.atCapThresholdPct
      ? 'at-cap'
      : pctOfCap >= thresholds.approachingThresholdPct
        ? 'approaching'
        : 'active';
  const fillClassName =
    status === 'at-cap'
      ? 'bg-error'
      : status === 'approaching'
        ? 'bg-warning'
        : 'bg-success';

  return (
    <div className="flex min-w-[10rem] items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-base-200">
        <div
          className={`h-full rounded-full ${fillClassName}`}
          style={{ width: `${Math.min(pctOfCap, 100)}%` }}
        />
      </div>
      <span
        className={`min-w-12 text-right text-sm font-semibold ${
          status === 'at-cap'
            ? 'text-error'
            : status === 'approaching'
              ? 'text-warning'
              : 'text-success'
        }`}
      >
        {pctOfCap.toLocaleString('en-US', {
          maximumFractionDigits: 1,
          minimumFractionDigits: pctOfCap % 1 === 0 ? 0 : 1,
        })}
        %
      </span>
    </div>
  );
}

function renderProjectedMonths(
  employee: AccrualDepartmentEmployeeRow,
  thresholds: StatusThresholds
) {
  const status = getEmployeeStatus(employee, thresholds);
  if (status === 'at-cap') {
    return <span className="font-semibold text-error">At Cap</span>;
  }

  if (employee.monthsToCap === null) {
    return <span className="text-success">Trending down</span>;
  }

  return (
    <span
      className={
        employee.monthsToCap <= 2 ? 'font-semibold text-warning' : undefined
      }
    >
      {employee.monthsToCap} mo{employee.monthsToCap === 1 ? '' : 's'}
    </span>
  );
}

interface VacationAccrualDepartmentDetailProps {
  assumptions: AccrualAssumptionsResponse;
  data: AccrualDepartmentDetailResponse;
}

export function VacationAccrualDepartmentDetail({
  assumptions,
  data,
}: VacationAccrualDepartmentDetailProps) {
  const navigate = useNavigate();
  const [classificationFilter, setClassificationFilter] =
    useState<ClassificationFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    setClassificationFilter('all');
    setSearchTerm('');
    setStatusFilter('all');
  }, [data.departmentCode]);

  const asOfDate = data.asOfDate ? new Date(data.asOfDate) : null;
  const statusThresholds = useMemo(
    () => ({
      approachingThresholdPct: assumptions.approachingThresholdPct,
      atCapThresholdPct: assumptions.atCapThresholdPct,
    }),
    [assumptions.approachingThresholdPct, assumptions.atCapThresholdPct]
  );

  const classifications = useMemo(
    () =>
      [...new Set(data.employees.map((employee) => employee.classification))].sort(
        (left, right) => left.localeCompare(right)
      ),
    [data.employees]
  );

  const academicClassifications = useMemo(
    () => classifications.filter((classification) => isAcademicClassification(classification)),
    [classifications]
  );

  const staffClassifications = useMemo(
    () => classifications.filter((classification) => !isAcademicClassification(classification)),
    [classifications]
  );

  const filteredEmployees = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    return data.employees.filter((employee) => {
      const status = getEmployeeStatus(employee, statusThresholds);
      if (statusFilter === 'at-cap' && status !== 'at-cap') {
        return false;
      }

      if (statusFilter === 'approaching' && status !== 'approaching') {
        return false;
      }

      if (classificationFilter === 'academic' &&
          !isAcademicClassification(employee.classification)) {
        return false;
      }

      if (classificationFilter === 'staff' &&
          isAcademicClassification(employee.classification)) {
        return false;
      }

      if (!['all', 'academic', 'staff'].includes(classificationFilter) &&
          employee.classification !== classificationFilter) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return (
        employee.employeeName.toLowerCase().includes(normalizedSearchTerm) ||
        employee.employeeId.toLowerCase().includes(normalizedSearchTerm)
      );
    });
  }, [
    classificationFilter,
    data.employees,
    searchTerm,
    statusFilter,
    statusThresholds,
  ]);

  const employeeColumns: ColumnDef<AccrualDepartmentEmployeeRow>[] = [
    {
      accessorKey: 'employeeName',
      footer: () => 'Department Total',
      header: 'Employee',
      minSize: 240,
      size: 260,
    },
    {
      accessorKey: 'employeeId',
      cell: (info) => (
        <span className="font-mono text-sm text-base-content/70">
          {info.getValue<string>()}
        </span>
      ),
      header: 'ID',
      size: 120,
    },
    {
      accessorKey: 'classification',
      cell: (info) => (
        <ClassificationBadge classification={info.getValue<string>()} />
      ),
      header: 'Class',
      size: 140,
    },
    {
      accessorFn: (row) => getEmployeeStatus(row, statusThresholds),
      cell: (info) => (
        <StatusBadge
          employee={info.row.original}
          thresholds={statusThresholds}
        />
      ),
      header: 'Status',
      id: 'status',
      size: 140,
    },
    {
      accessorKey: 'balanceHours',
      cell: (info) => (
        <span className="flex justify-end w-full font-semibold">
          {compactHoursFormatter(info.getValue<number>())}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Balance</span>,
      size: 110,
    },
    {
      accessorKey: 'capHours',
      cell: (info) => (
        <span className="flex justify-end w-full text-base-content/70">
          {compactHoursFormatter(info.getValue<number>())}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Cap</span>,
      size: 100,
    },
    {
      accessorKey: 'pctOfCap',
      cell: (info) => (
        <CapProgressBar
          pctOfCap={info.getValue<number>()}
          thresholds={statusThresholds}
        />
      ),
      header: '% of Cap',
      size: 180,
    },
    {
      accessorKey: 'accrualHoursPerMonth',
      cell: (info) => (
        <span className="flex justify-end w-full">
          {compactHoursFormatter(info.getValue<number>())}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Accrual/Mo</span>,
      size: 120,
    },
    {
      accessorKey: 'monthsToCap',
      cell: (info) => renderProjectedMonths(info.row.original, statusThresholds),
      header: 'Projected',
      size: 140,
    },
    {
      accessorKey: 'lastVacationDate',
      cell: (info) => (
        <span className="text-base-content/70">
          {formatDate(info.getValue<string | null>(), '—')}
        </span>
      ),
      header: 'Last Vacation',
      size: 140,
    },
    {
      accessorKey: 'lostCostMonth',
      cell: (info) => {
        const value = info.getValue<number>();
        return (
          <span
            className={`flex justify-end w-full ${value > 0 ? 'font-semibold text-error' : 'text-base-content/55'}`}
          >
            {value > 0 ? formatCurrency(value) : '—'}
          </span>
        );
      },
      footer: () => (
        <span className="flex justify-end w-full font-semibold text-error">
          {formatCurrency(data.lostCostMonth)}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Lost $</span>,
      size: 140,
    },
  ];

  if (data.employees.length === 0) {
    return (
      <PageEmpty message="No employees are available for this department in the current accrual snapshot." />
    );
  }

  return (
    <main className="mt-8">
      <div className="container">
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary no-underline"
                  to="/accruals"
                >
                  <ArrowLongLeftIcon className="h-4 w-4" />
                  College Overview
                </Link>
                <span className="hidden text-base-content/35 sm:inline">/</span>
                <label className="sr-only" htmlFor="department-selector">
                  Department
                </label>
                <select
                  className="select select-bordered w-full max-w-md"
                  id="department-selector"
                  onChange={(event) =>
                    navigate({
                      params: { departmentCode: event.target.value },
                      to: '/accruals/department/$departmentCode',
                    })
                  }
                  value={data.departmentCode}
                >
                  {data.departments.map((department) => (
                    <option key={department.code} value={department.code}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="card bg-base-100 border border-main-border shadow-sm lg:min-w-64">
                <div className="card-body gap-1 p-4">
                  <div className="text-xs font-semibold tracking-[0.14em] uppercase text-base-content/55">
                    As Of
                  </div>
                  <div className="text-lg font-semibold">
                    {asOfDate ? asOfDateFormatter.format(asOfDate) : 'Unavailable'}
                  </div>
                  <Link className="link link-primary text-sm font-semibold" to="/accruals/about">
                    About this report
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              accentClassName="text-error"
              description="Estimated unrecoverable accrual charges for the latest month-end snapshot."
              Icon={FireIcon}
              label="Lost Cost (Month)"
              value={formatCurrency(data.lostCostMonth)}
            />
            <SummaryCard
              accentClassName="text-error"
              description={`Estimated fiscal year-to-date using ${data.ytdMonthCount} month${data.ytdMonthCount === 1 ? '' : 's'} of exposure.`}
              Icon={ChartBarIcon}
              label="Lost Cost (YTD)"
              value={formatCurrency(data.lostCostYtd)}
            />
            <SummaryCard
              accentClassName="text-base-content"
              description={`${data.departmentName} employees in the current snapshot.`}
              Icon={UserGroupIcon}
              label="Headcount"
              value={data.headcount.toLocaleString('en-US')}
            />
            <SummaryCard
              accentClassName="text-error"
              description="Employees currently at the vacation accrual cap."
              Icon={NoSymbolIcon}
              label="At Cap"
              value={data.atCapCount.toLocaleString('en-US')}
            />
            <SummaryCard
              accentClassName="text-base-content"
              description="Average current vacation balance for the department."
              Icon={ClipboardDocumentListIcon}
              label="Avg Balance"
              value={hoursFormatter(data.avgBalanceHours)}
            />
          </section>

          <section className="card bg-base-100 border border-main-border shadow-sm">
            <div className="card-body gap-5 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="join">
                  {([
                    ['all', 'All'],
                    ['approaching', 'Approaching'],
                    ['at-cap', 'At Cap'],
                  ] as const).map(([value, label]) => (
                    <button
                      className={`btn btn-sm join-item ${
                        statusFilter === value ? 'btn-primary' : 'btn-ghost'
                      }`}
                      key={value}
                      onClick={() => setStatusFilter(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    className="select select-bordered select-sm w-full sm:w-56"
                    onChange={(event) =>
                      setClassificationFilter(event.target.value)
                    }
                    value={classificationFilter}
                  >
                    <option value="all">All Classifications</option>
                    {staffClassifications.length > 0 ? (
                      <option value="staff">All Staff</option>
                    ) : null}
                    {staffClassifications.map((classification) => (
                      <option key={classification} value={classification}>
                        {classification}
                      </option>
                    ))}
                    {academicClassifications.length > 0 ? (
                      <option value="academic">All Academic</option>
                    ) : null}
                    {academicClassifications.map((classification) => (
                      <option key={classification} value={classification}>
                        {classification}
                      </option>
                    ))}
                  </select>

                  <label className="input input-bordered input-sm flex items-center gap-2 w-full sm:w-72">
                    <MagnifyingGlassIcon className="h-4 w-4 opacity-50" />
                    <input
                      className="grow"
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search by name or ID..."
                      type="text"
                      value={searchTerm}
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <span className="text-sm text-base-content/60">
                  {filteredEmployees.length.toLocaleString('en-US')} employee
                  {filteredEmployees.length === 1 ? '' : 's'}
                </span>
              </div>

              <DataTable
                columns={employeeColumns}
                data={filteredEmployees}
                defaultColumnSize={140}
                expandable={false}
                footerRowClassName="totaltr bg-base-200/70"
                globalFilter="none"
                initialState={{
                  pagination: { pageSize: 50 },
                  sorting: [{ desc: true, id: 'pctOfCap' }],
                }}
                tableActions={
                  <ExportDataButton
                    columns={departmentEmployeeCsvColumns}
                    data={filteredEmployees}
                    filename={`vacation-accrual-${data.departmentCode}.csv`}
                  />
                }
                getRowProps={(row) => {
                  const status = getEmployeeStatus(row.original, statusThresholds);
                  return {
                    className:
                      status === 'at-cap'
                        ? 'bg-error/5'
                        : status === 'approaching'
                          ? 'bg-warning/5'
                          : undefined,
                  };
                }}
                tableClassName="table-zebra"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
