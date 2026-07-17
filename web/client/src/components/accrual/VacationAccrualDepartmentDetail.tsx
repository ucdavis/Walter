import { useMemo, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  InformationCircleIcon,
  FireIcon,
  NoSymbolIcon,
  UserGroupIcon,
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
  {
    format: 'currency' as const,
    header: 'Lost Cost/Mo',
    key: 'lostCostMonth' as const,
  },
  {
    format: 'currency' as const,
    header: 'Proj. Loss FYTD',
    key: 'lostCostYtd' as const,
  },
  { header: 'Balance Hours', key: 'balanceHours' as const },
  { header: 'Cap Hours', key: 'capHours' as const },
  { header: '% of Cap', key: 'pctOfCap' as const },
  { header: 'Accrual/Mo', key: 'accrualHoursPerMonth' as const },
  { header: 'Months to Cap', key: 'monthsToCap' as const },
  {
    format: 'date' as const,
    header: 'Last Vacation',
    key: 'lastVacationDate' as const,
  },
];

type SummaryMetricProps = {
  accentClassName?: string;
  description: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
};

type StatusFilter = 'all' | 'approaching' | 'at-cap';
type ClassificationFilter = 'all' | 'academic' | 'staff' | string;
type EmployeeStatus = 'active' | 'approaching' | 'at-cap';
type DepartmentFilters = {
  classificationFilter: ClassificationFilter;
  departmentCode: string;
  searchTerm: string;
  statusFilter: StatusFilter;
};

type StatusThresholds = Pick<
  AccrualAssumptionsResponse,
  'approachingThresholdPct' | 'atCapThresholdPct'
>;

function SummaryMetric({
  accentClassName = '',
  description,
  Icon,
  label,
  value,
}: SummaryMetricProps) {
  return (
    <div className="flex min-w-0 flex-col">
      <Icon className="h-4 w-4" />
      <dt className="stat-label-lg">{label}</dt>
      <dd
        className={['stat-value-lg break-words', accentClassName]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </dd>
      <dd className="mt-1 text-sm text-base-content/65">{description}</dd>
    </div>
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

function ClassificationBadge({ classification }: { classification: string }) {
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

function createDepartmentFilters(departmentCode: string): DepartmentFilters {
  return {
    classificationFilter: 'all',
    departmentCode,
    searchTerm: '',
    statusFilter: 'all',
  };
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
  const [isDepartmentMenuOpen, setIsDepartmentMenuOpen] = useState(false);
  const [filters, setFilters] = useState<DepartmentFilters>(() =>
    createDepartmentFilters(data.departmentCode)
  );
  const activeFilters =
    filters.departmentCode === data.departmentCode
      ? filters
      : createDepartmentFilters(data.departmentCode);
  const { classificationFilter, searchTerm, statusFilter } = activeFilters;
  const updateFilters = (
    updater: (current: DepartmentFilters) => DepartmentFilters
  ) => {
    setFilters((current) =>
      updater(
        current.departmentCode === data.departmentCode
          ? current
          : createDepartmentFilters(data.departmentCode)
      )
    );
  };
  const openDepartment = (departmentCode: string) => {
    setIsDepartmentMenuOpen(false);
    void navigate({
      params: { departmentCode },
      to: '/accruals/department/$departmentCode',
    });
  };

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
      [
        ...new Set(data.employees.map((employee) => employee.classification)),
      ].sort((left, right) => left.localeCompare(right)),
    [data.employees]
  );

  const academicClassifications = useMemo(
    () =>
      classifications.filter((classification) =>
        isAcademicClassification(classification)
      ),
    [classifications]
  );

  const staffClassifications = useMemo(
    () =>
      classifications.filter(
        (classification) => !isAcademicClassification(classification)
      ),
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

      if (
        classificationFilter === 'academic' &&
        !isAcademicClassification(employee.classification)
      ) {
        return false;
      }

      if (
        classificationFilter === 'staff' &&
        isAcademicClassification(employee.classification)
      ) {
        return false;
      }

      if (
        !['all', 'academic', 'staff'].includes(classificationFilter) &&
        employee.classification !== classificationFilter
      ) {
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
    {
      accessorKey: 'lostCostYtd',
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
          {formatCurrency(data.lostCostYtd)}
        </span>
      ),
      header: () => (
        <span className="flex justify-end w-full">Proj. Loss FYTD</span>
      ),
      size: 160,
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
      cell: (info) =>
        renderProjectedMonths(info.row.original, statusThresholds),
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
  ];

  if (data.employees.length === 0) {
    return (
      <PageEmpty message="No employees are available for this department in the current accrual snapshot." />
    );
  }

  return (
    <main className="mt-8">
      <div className="container">
        <div className="mx-auto">
          <section className="section-margin">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <Link
                  className="btn btn-sm mb-4"
                  to="/accruals"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Department Selector
                </Link>
                <div
                  className="relative mt-3 w-fit max-w-full"
                  onBlur={(event) => {
                    const nextFocus = event.relatedTarget as Node | null;
                    if (!event.currentTarget.contains(nextFocus)) {
                      setIsDepartmentMenuOpen(false);
                    }
                  }}
                >
                  <h1 className="h1">
                    <button
                      aria-expanded={isDepartmentMenuOpen}
                      aria-haspopup="listbox"
                      aria-label={`Department: ${data.departmentName}`}
                      className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-xs text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      onClick={() =>
                        setIsDepartmentMenuOpen((current) => !current)
                      }
                      type="button"
                    >
                      <span className="truncate">{data.departmentName}</span>
                      <ChevronDownIcon className="h-6 w-6 shrink-0" />
                    </button>
                  </h1>

                  {isDepartmentMenuOpen ? (
                    <div
                      aria-label="Department"
                      className="absolute left-0 z-50 mt-2 max-h-80 w-max min-w-full max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-main-border bg-base-100 p-1 shadow-lg"
                      role="listbox"
                    >
                      {data.departments.map((department) => (
                        <button
                          aria-selected={
                            department.code === data.departmentCode
                          }
                          className={`block w-full rounded px-3 py-2 text-left text-sm ${
                            department.code === data.departmentCode
                              ? 'bg-base-200 font-semibold'
                              : 'hover:bg-base-200'
                          }`}
                          key={department.code}
                          onClick={() => openDepartment(department.code)}
                          onMouseDown={(event) => event.preventDefault()}
                          role="option"
                          type="button"
                        >
                          {department.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <h3 className="subtitle mt-2">
                  Department {data.departmentCode}
                </h3>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  className="btn btn-sm"
                  search={{ departmentCode: data.departmentCode }}
                  to="/accruals/about"
                >
                  <InformationCircleIcon className="h-4 w-4" />
                  About this report
                </Link>
              </div>
            </div>

            <div className="fancy-data">
              <dl className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                <SummaryMetric
                  description="Latest month-end snapshot"
                  Icon={CalendarDaysIcon}
                  label="As Of"
                  value={
                    asOfDate
                      ? asOfDateFormatter.format(asOfDate)
                      : 'Unavailable'
                  }
                />
                <SummaryMetric
                  accentClassName="text-error"
                  description="Estimated unrecoverable accrual charges"
                  Icon={FireIcon}
                  label="Lost Cost (Month)"
                  value={formatCurrency(data.lostCostMonth)}
                />
                <SummaryMetric
                  accentClassName="text-error"
                  description={`${data.ytdMonthCount} fiscal month${data.ytdMonthCount === 1 ? '' : 's'}`}
                  Icon={ChartBarIcon}
                  label="Lost Cost (FYTD)"
                  value={formatCurrency(data.lostCostYtd)}
                />
                <SummaryMetric
                  description={`${data.departmentName} employees`}
                  Icon={UserGroupIcon}
                  label="Headcount"
                  value={data.headcount.toLocaleString('en-US')}
                />
                <SummaryMetric
                  accentClassName="text-error"
                  description="Employees at the vacation accrual cap"
                  Icon={NoSymbolIcon}
                  label="At Cap"
                  value={data.atCapCount.toLocaleString('en-US')}
                />
                <SummaryMetric
                  description="Average current vacation balance"
                  Icon={ClipboardDocumentListIcon}
                  label="Avg Balance"
                  value={hoursFormatter(data.avgBalanceHours)}
                />
              </dl>
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="h2">Employee Breakdown</h2>
              <p className="mt-1">
                Filter the current department snapshot by cap status,
                classification, employee name, or employee ID.
              </p>
            </div>

            <DataTable
              columns={employeeColumns}
              data={filteredEmployees}
              defaultColumnSize={140}
              footerRowClassName="totaltr bg-base-200/70"
              getRowProps={(row) => {
                const status = getEmployeeStatus(
                  row.original,
                  statusThresholds
                );
                return {
                  className:
                    status === 'at-cap'
                      ? 'bg-error/5'
                      : status === 'approaching'
                        ? 'bg-warning/5'
                        : undefined,
                };
              }}
              globalFilter="none"
              initialState={{
                pagination: { pageSize: 50 },
                sorting: [{ desc: true, id: 'pctOfCap' }],
              }}
              tableActions={
                <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="tabs tabs-box tabs-sm" role="tablist">
                      {(
                        [
                          ['all', 'All'],
                          ['approaching', 'Approaching'],
                          ['at-cap', 'At Cap'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          aria-selected={statusFilter === value}
                          className={`tab ${
                            statusFilter === value ? 'tab-active' : ''
                          }`}
                          key={value}
                          onClick={() =>
                            updateFilters((current) => ({
                              ...current,
                              departmentCode: data.departmentCode,
                              statusFilter: value,
                            }))
                          }
                          role="tab"
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <select
                      className="select select-bordered select-sm w-full sm:w-56"
                      onChange={(event) =>
                        updateFilters((current) => ({
                          ...current,
                          classificationFilter: event.target.value,
                          departmentCode: data.departmentCode,
                        }))
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
                      <svg
                        className="h-[1em] opacity-50"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <g
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                        >
                          <circle cx="11" cy="11" r="8"></circle>
                          <path d="m21 21-4.3-4.3"></path>
                        </g>
                      </svg>
                      <input
                        className="grow"
                        onChange={(event) =>
                          updateFilters((current) => ({
                            ...current,
                            departmentCode: data.departmentCode,
                            searchTerm: event.target.value,
                          }))
                        }
                        placeholder="Search by name or ID..."
                        type="text"
                        value={searchTerm}
                      />
                      {searchTerm ? (
                        <button
                          className="btn btn-ghost btn-sm btn-circle"
                          onClick={() =>
                            updateFilters((current) => ({
                              ...current,
                              departmentCode: data.departmentCode,
                              searchTerm: '',
                            }))
                          }
                          type="button"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="currentColor"
                            viewBox="0 0 16 16"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                          </svg>
                        </button>
                      ) : null}
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <ExportDataButton
                      columns={departmentEmployeeCsvColumns}
                      data={filteredEmployees}
                      filename={`vacation-accrual-${data.departmentCode}.csv`}
                    />
                  </div>
                </div>
              }
              tableClassName="table-zebra"
            />
          </section>
        </div>
      </div>
    </main>
  );
}
