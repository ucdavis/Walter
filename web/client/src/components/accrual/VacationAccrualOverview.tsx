import type { ComponentType, MouseEvent, SVGProps } from 'react';
import {
  ArrowLeftIcon,
  ArrowTrendingDownIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  FireIcon,
  InformationCircleIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link, useNavigate } from '@tanstack/react-router';
import { ColumnDef } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import {
  type AccrualDepartmentBreakdownRow,
  type AccrualOverviewResponse,
} from '@/queries/accrual.ts';
import { DataTable } from '@/shared/DataTable.tsx';

const asOfDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const axisCurrencyFormatter = (value: number) => {
  if (Math.abs(value) >= 1000) {
    return `$${Math.round(value / 1000)}k`;
  }

  return formatCurrency(value);
};

const percentFormatter = (value: number) => `${value.toFixed(1)}%`;

const hoursFormatter = (value: number) =>
  `${Math.round(value).toLocaleString('en-US')} hrs`;

const departmentCsvColumns = [
  { header: 'Department', key: 'department' as const },
  { header: 'Headcount', key: 'headcount' as const },
  { header: 'At Cap', key: 'atCapCount' as const },
  { header: 'Near Cap', key: 'approachingCapCount' as const },
  {
    format: 'currency' as const,
    header: 'Lost Cost/Mo',
    key: 'lostCostMonth' as const,
  },
  {
    format: 'currency' as const,
    header: 'Lost Cost FYTD',
    key: 'lostCostYtd' as const,
  },
  { header: 'Avg Balance Hours', key: 'avgBalanceHours' as const },
];

type SummaryMetricProps = {
  accentClassName?: string;
  description: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
};

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

interface VacationAccrualOverviewProps {
  data: AccrualOverviewResponse;
}

function shouldSkipRowNavigation(
  event: MouseEvent<HTMLTableRowElement>
): boolean {
  const interactiveTarget = (event.target as HTMLElement | null)?.closest(
    'a, button, input, select, textarea, summary, [role="button"], [role="link"]'
  );
  if (interactiveTarget) {
    return true;
  }

  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed);
}

export function VacationAccrualOverview({
  data,
}: VacationAccrualOverviewProps) {
  const navigate = useNavigate();

  if (data.totalEmployees === 0) {
    return (
      <PageEmpty message="No vacation accrual balances are available for the overview yet." />
    );
  }

  const asOfDate = data.asOfDate ? new Date(data.asOfDate) : null;
  const departmentColumns: ColumnDef<AccrualDepartmentBreakdownRow>[] = [
    {
      accessorKey: 'department',
      cell: (info) => (
        <div className="flex items-start">
          <Link
            aria-label={`Open ${info.getValue<string>()} department details`}
            className="link link-hover text-inherit"
            params={{ departmentCode: info.row.original.departmentCode }}
            title="Open department details"
            to="/accruals/department/$departmentCode"
          >
            {info.getValue<string>()}
          </Link>
        </div>
      ),
      footer: () => 'CAES Total',
      header: 'Department',
      minSize: 260,
      size: 320,
    },
    {
      accessorKey: 'headcount',
      cell: (info) => (
        <span className="flex justify-end w-full">
          {info.getValue<number>().toLocaleString('en-US')}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full font-semibold">
          {data.totalEmployees.toLocaleString('en-US')}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Headcount</span>,
      size: 120,
    },
    {
      accessorKey: 'atCapCount',
      cell: (info) => (
        <span className="flex justify-end w-full text-error font-semibold">
          {info.getValue<number>().toLocaleString('en-US')}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-error font-semibold">
          {data.atCapCount.toLocaleString('en-US')}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">At Cap</span>,
      size: 120,
    },
    {
      accessorKey: 'approachingCapCount',
      cell: (info) => (
        <span className="flex justify-end w-full text-warning font-semibold">
          {info.getValue<number>().toLocaleString('en-US')}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-warning font-semibold">
          {data.approachingCapCount.toLocaleString('en-US')}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Near Cap</span>,
      size: 120,
    },
    {
      accessorKey: 'lostCostMonth',
      cell: (info) => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(info.getValue<number>())}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(data.lostCostMonth)}
        </span>
      ),
      header: () => (
        <span className="flex justify-end w-full">Lost Cost/Mo</span>
      ),
      size: 160,
    },
    {
      accessorKey: 'lostCostYtd',
      cell: (info) => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(info.getValue<number>())}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(data.lostCostYtd)}
        </span>
      ),
      header: () => (
        <span className="flex justify-end w-full">Lost Cost FYTD</span>
      ),
      size: 170,
    },
    {
      accessorKey: 'avgBalanceHours',
      cell: (info) => (
        <span className="flex justify-end w-full">
          {hoursFormatter(info.getValue<number>())}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-base-content/55">-</span>
      ),
      header: () => (
        <span className="flex justify-end w-full">Avg Balance</span>
      ),
      size: 140,
    },
  ];

  return (
    <main className="mt-8">
      <div className="container">
        <section className="section-margin">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                className="btn btn-sm mb-4"
                to="/accruals"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Department Selector
              </Link>
              <h1 className="h1">Vacation Accrual Overview</h1>
              <h3 className="subtitle mt-2">
                {data.totalEmployees.toLocaleString('en-US')} employees across{' '}
                {data.totalDepartments.toLocaleString('en-US')} departments
              </h3>
            </div>

            <Link className="btn btn-sm" to="/accruals/about">
              <InformationCircleIcon className="h-4 w-4" />
              About this report
            </Link>
          </div>

          <div className="fancy-data">
            <dl className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <SummaryMetric
                description="Latest month-end snapshot"
                Icon={CalendarDaysIcon}
                label="As Of"
                value={
                  asOfDate ? asOfDateFormatter.format(asOfDate) : 'Unavailable'
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
                accentClassName="text-error"
                description={`of ${data.totalEmployees.toLocaleString('en-US')} employees`}
                Icon={NoSymbolIcon}
                label="At Cap"
                value={data.atCapCount.toLocaleString('en-US')}
              />
              <SummaryMetric
                accentClassName="text-warning"
                description="80% to 99% of maximum balance"
                Icon={ExclamationTriangleIcon}
                label="Approaching Cap"
                value={data.approachingCapCount.toLocaleString('en-US')}
              />
              <SummaryMetric
                accentClassName="text-warning"
                description="Lost cost over monthly accruals"
                Icon={ArrowTrendingDownIcon}
                label="Waste Rate"
                value={percentFormatter(data.wasteRate)}
              />
            </dl>
          </div>
        </section>

        <section className="section-margin">
          <h2 className="h2">Accrual Trends</h2>
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <article className="min-w-0">
              <h3 className="h3">Monthly Lost Accrual Cost</h3>
              <div className="mt-4 h-80">
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart
                    data={data.monthlyLostCost}
                    margin={{ bottom: 8, left: 8, right: 16, top: 8 }}
                  >
                    <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={axisCurrencyFormatter}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #E9E3EE',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number) => [
                        formatCurrency(value),
                        'Lost cost',
                      ]}
                      labelFormatter={(label: string) => `Month: ${label}`}
                    />
                    <Line
                      activeDot={{ r: 5 }}
                      dataKey="lostCost"
                      dot={{ fill: 'var(--color-error)', r: 3 }}
                      name="Lost Cost"
                      stroke="var(--color-error)"
                      strokeWidth={2.5}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="min-w-0">
              <h3 className="h3">Employee Accrual Status Over Time</h3>
              <div className="mt-4 h-80">
                <ResponsiveContainer height="100%" width="100%">
                  <BarChart
                    data={data.employeeStatusOverTime}
                    margin={{ bottom: 8, left: 8, right: 16, top: 8 }}
                  >
                    <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #E9E3EE',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="active"
                      fill="var(--color-success)"
                      name="Active"
                      stackId="status"
                    />
                    <Bar
                      dataKey="approaching"
                      fill="var(--color-warning)"
                      name="Approaching"
                      stackId="status"
                    />
                    <Bar
                      dataKey="atCap"
                      fill="var(--color-error)"
                      name="At Cap"
                      stackId="status"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="h2">Department Breakdown</h2>
              <p className="mt-1">
                Click a row to drill into the live employee breakdown for a
                department.
              </p>
            </div>
          </div>

          <DataTable
            columns={departmentColumns}
            data={data.departmentBreakdown}
            defaultColumnSize={160}
            expandable={false}
            filterPlaceholder="Search departments..."
            footerRowClassName="totaltr bg-base-200/70"
            getRowProps={(row) => ({
              className: 'cursor-pointer hover:bg-base-200',
              onClick: (event) => {
                if (shouldSkipRowNavigation(event)) {
                  return;
                }

                void navigate({
                  params: {
                    departmentCode: row.original.departmentCode,
                  },
                  to: '/accruals/department/$departmentCode',
                });
              },
            })}
            initialState={{
              pagination: { pageSize: 50 },
              sorting: [{ desc: false, id: 'department' }],
            }}
            tableActions={
              <ExportDataButton
                columns={departmentCsvColumns}
                data={data.departmentBreakdown}
                filename="vacation-accrual-department-breakdown.csv"
              />
            }
            tableClassName="table-zebra"
          />
        </section>
      </div>
    </main>
  );
}
